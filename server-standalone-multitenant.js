import { TwilioWebSocketServer } from './packages/twilio-server/dist/index.js';
import { GeminiLiveClient } from './packages/gemini-live-client/dist/index.js';
import { AudioConverter } from './packages/audio-converter/dist/index.js';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { 
  getClientConfigByPhoneNumber, 
  getAgentById, 
  storeCallSession, 
  getCallSession,
  createCallLog,
  updateCallLog,
  incrementMinutesUsed
} from './database/supabase-service.js';

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || '12001', 10); // WebSocket server port
const HEALTH_PORT = PORT;

// Validate required environment variables
const requiredEnvVars = ['GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
    console.error('Please check your .env file or environment configuration.');
    process.exit(1);
}

// In-memory call session store (fallback if database is unavailable)
const callSessionStore = new Map();

// Custom Tw2GemServer implementation with multi-tenant support
class Tw2GemServer extends TwilioWebSocketServer {
    constructor(options) {
        super(options.serverOptions);
        this.geminiOptions = options.geminiOptions;
        this.geminiLive = new GeminiLiveEvents();
        this.audioConverter = new AudioConverter();
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.on('connection', async (socket, request) => {
            console.log('📞 New WebSocket connection from Twilio');
            
            // Extract call SID from the request URL or headers
            const url = new URL(request.url, 'http://localhost');
            const callSid = url.searchParams.get('callSid') || '';
            
            console.log('🔍 Call SID from URL:', callSid);
            
            // Get call session data
            let callSession = null;
            
            // Try to get from database first
            if (callSid) {
                callSession = await getCallSession(callSid);
                
                // If not in database, try in-memory store
                if (!callSession && callSessionStore.has(callSid)) {
                    callSession = callSessionStore.get(callSid);
                }
                
                console.log('📋 Call session retrieved:', callSession ? 'Found' : 'Not found');
            }
            
            // Create Gemini Live client for this call with appropriate configuration
            let geminiClientOptions = { ...this.geminiOptions };
            
            if (callSession && callSession.selectedAgent) {
                // Use agent-specific configuration
                const agent = callSession.selectedAgent;
                
                console.log('🤖 Using agent-specific configuration:', agent.name);
                
                // Customize Gemini options based on agent configuration
                geminiClientOptions = {
                    ...geminiClientOptions,
                    setup: {
                        ...geminiClientOptions.setup,
                        systemInstruction: {
                            parts: [{ text: agent.system_instruction || geminiClientOptions.setup.systemInstruction.parts[0].text }]
                        },
                        generationConfig: {
                            ...geminiClientOptions.setup.generationConfig,
                            speechConfig: {
                                voiceConfig: {
                                    prebuiltVoiceConfig: {
                                        voiceName: agent.voice_name || 'Puck'
                                    }
                                },
                                languageCode: agent.language_code || 'en-US'
                            }
                        }
                    }
                };
                
                // Store agent and client info on the socket
                socket.agentInfo = agent;
                socket.clientInfo = callSession.clientConfig;
                socket.callSession = callSession;
            }
            
            const geminiClient = new GeminiLiveClient(geminiClientOptions);
            socket.geminiLive = geminiClient;
            socket.twilioStreamSid = callSid;
            socket.callStartTime = new Date();
            socket.transcript = '';
            
            // Create call log in database
            if (socket.clientInfo && socket.agentInfo) {
                try {
                    const callLogData = {
                        profile_id: socket.clientInfo.clientId,
                        agent_id: socket.agentInfo.id,
                        call_sid: callSid,
                        phone_number_from: callSession?.fromNumber || 'unknown',
                        phone_number_to: callSession?.toNumber || 'unknown',
                        direction: callSession?.callType || 'inbound',
                        status: 'in_progress',
                        started_at: new Date().toISOString()
                    };
                    
                    const callLog = await createCallLog(callLogData);
                    
                    if (callLog) {
                        socket.callLogId = callLog.id;
                        console.log('📝 Call log created with ID:', callLog.id);
                    }
                } catch (error) {
                    console.error('❌ Error creating call log:', error);
                }
            }
            
            // Handle Gemini audio responses
            geminiClient.onServerContent = (serverContent) => {
                console.log('🤖 Received from Gemini:', JSON.stringify(serverContent, null, 2));
                this.handleGeminiResponse(socket, serverContent);
                
                // Capture transcript for logging
                if (serverContent.modelTurn?.parts) {
                    for (const part of serverContent.modelTurn.parts) {
                        if (part.text) {
                            socket.transcript += `AI: ${part.text}\n`;
                        }
                    }
                }
            };
            
            // Handle Gemini connection events
            geminiClient.onReady = () => {
                console.log('🤖 Gemini Live client connected and ready');
            };
            
            geminiClient.onError = (error) => {
                console.error('❌ Gemini Live client error:', error);
            };
            
            geminiClient.onClose = (event) => {
                console.log('📴 Gemini Live client closed:', event.reason);
            };
            
            // Handle Twilio messages
            socket.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleTwilioMessage(socket, message);
                    
                    // Capture user transcript
                    if (message.event === 'media' && message.media?.payload) {
                        // We don't have the actual transcript from the audio,
                        // but we can mark that the user spoke
                        if (!socket.lastUserSpeech || Date.now() - socket.lastUserSpeech > 5000) {
                            socket.transcript += `User: [Speech]\n`;
                            socket.lastUserSpeech = Date.now();
                        }
                    }
                } catch (error) {
                    console.error('❌ Error parsing Twilio message:', error);
                }
            });

            socket.on('close', async () => {
                console.log('📴 Twilio connection closed');
                
                // Update call log in database
                if (socket.callLogId) {
                    try {
                        const endTime = new Date();
                        const startTime = socket.callStartTime || endTime;
                        const durationSeconds = Math.round((endTime - startTime) / 1000);
                        
                        const updates = {
                            status: 'completed',
                            ended_at: endTime.toISOString(),
                            duration_seconds: durationSeconds,
                            transcript: socket.transcript
                        };
                        
                        await updateCallLog(socket.callLogId, updates);
                        console.log('📝 Call log updated with duration:', durationSeconds, 'seconds');
                        
                        // Update minutes used
                        if (socket.clientInfo) {
                            const minutesUsed = Math.ceil(durationSeconds / 60);
                            
                            await incrementMinutesUsed(socket.clientInfo.clientId, minutesUsed);
                            console.log('⏱️ Minutes used incremented by:', minutesUsed);
                        }
                    } catch (error) {
                        console.error('❌ Error updating call log:', error);
                    }
                }
                
                if (socket.geminiLive) {
                    socket.geminiLive.close();
                }
                
                if (this.onClose) {
                    this.onClose(socket, {});
                }
            });

            socket.on('error', (error) => {
                console.error('❌ Twilio WebSocket error:', error);
                if (this.onError) {
                    this.onError(socket, error);
                }
            });

            if (this.onNewCall) {
                this.onNewCall(socket);
            }
        });
    }

    handleGeminiResponse(socket, serverContent) {
        try {
            // Handle audio response from Gemini
            if (serverContent.modelTurn?.parts) {
                for (const part of serverContent.modelTurn.parts) {
                    if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
                        console.log('🎵 Received audio from Gemini:', {
                            mimeType: part.inlineData.mimeType,
                            dataLength: part.inlineData.data.length,
                            streamSid: socket.twilioStreamSid
                        });
                        
                        // Convert Gemini's PCM audio to Twilio's muLaw format
                        const twilioAudio = AudioConverter.convertBase64PCM24kToBase64MuLaw8k(part.inlineData.data);
                        
                        // Send audio to Twilio
                        const audioMessage = {
                            event: 'media',
                            streamSid: socket.twilioStreamSid,
                            media: {
                                payload: twilioAudio
                            }
                        };
                        
                        socket.send(JSON.stringify(audioMessage));
                        console.log('🎵 Sent audio to Twilio, payload length:', twilioAudio.length);
                    }
                }
            }
            
            // Handle text responses (for debugging)
            if (serverContent.modelTurn?.parts) {
                for (const part of serverContent.modelTurn.parts) {
                    if (part.text) {
                        console.log('💬 Gemini text response:', part.text);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error handling Gemini response:', error);
        }
    }

    handleTwilioMessage(socket, message) {
        switch (message.event) {
            case 'connected':
                console.log('🔗 Twilio connected');
                break;
                
            case 'start':
                console.log('🎬 Call started:', message.start?.streamSid);
                socket.twilioStreamSid = message.start?.streamSid;
                
                // Gemini Live client connects automatically in constructor
                console.log('🤖 Gemini Live client ready for audio');
                break;
                
            case 'media':
                if (socket.geminiLive && message.media?.payload) {
                    // Convert audio and send to Gemini
                    try {
                        // Convert Twilio's muLaw to PCM 16kHz for Gemini
                        const audioData = AudioConverter.convertBase64MuLawToBase64PCM16k(message.media.payload);
                        
                        console.log('🎤 Sending audio to Gemini:', {
                            originalLength: message.media.payload.length,
                            convertedLength: audioData.length,
                            streamSid: socket.twilioStreamSid
                        });
                        
                        // Send audio to Gemini Live in the correct format
                        socket.geminiLive.sendRealtimeInput({
                            audio: {
                                mimeType: 'audio/pcm;rate=16000',
                                data: audioData
                            }
                        });
                    } catch (error) {
                        console.error('❌ Audio conversion error:', error);
                    }
                }
                break;
                
            case 'stop':
                console.log('🛑 Call stopped');
                if (socket.geminiLive) {
                    socket.geminiLive.close();
                }
                break;
                
            default:
                console.log('📨 Unknown Twilio event:', message.event);
        }
    }
}

// Gemini Live Events handler
class GeminiLiveEvents {
    constructor() {
        this.onReady = null;
        this.onClose = null;
    }
}

// Create HTTP server and Express app for webhooks
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import Twilio for webhook responses
import twilio from 'twilio';
import { createServer as createHttpServer } from 'http';

const httpServer = createHttpServer(app);

// Get the base URL for webhooks
const WEBHOOK_URL = `https://work-2-uqgmjligulgfvwib.prod-runtime.all-hands.dev`;
const WEBSOCKET_URL = `wss://work-2-uqgmjligulgfvwib.prod-runtime.all-hands.dev`;

// Create TW2GEM Server instance with HTTP server
const server = new Tw2GemServer({
    serverOptions: {
        server: httpServer
    },
    geminiOptions: {
        server: {
            apiKey: process.env.GEMINI_API_KEY,
        },
        setup: {
            model: 'models/gemini-2.0-flash-live-001',
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: process.env.VOICE_NAME || 'Puck'
                        }
                    },
                    languageCode: process.env.LANGUAGE_CODE || 'en-US'
                },
            },
            systemInstruction: {
                parts: [{ 
                    text: process.env.SYSTEM_INSTRUCTION || 
                          'You are a professional AI assistant for customer service calls. IMPORTANT: You MUST speak first immediately when the call connects. Start with a warm greeting like "Hello! Thank you for calling. How can I help you today?" Be helpful, polite, and efficient. Always initiate the conversation and maintain a friendly, professional tone throughout the call.'
                }]
            },
            tools: []
        }
    }
});

// Event handlers
server.onNewCall = (socket) => {
    console.log('📞 New call from Twilio:', socket.twilioStreamSid);
    console.log('🕐 Call started at:', new Date().toISOString());
};

server.geminiLive.onReady = (socket) => {
    console.log('🤖 Gemini Live connection ready for call:', socket.twilioStreamSid);
    
    // Send initial greeting to ensure AI speaks first
    setTimeout(() => {
        if (socket.geminiLive && socket.geminiLive.readyState === 1) {
            const initialMessage = {
                client_content: {
                    turns: [{
                        role: 'user',
                        parts: [{ text: 'Please greet the caller now. Say hello and ask how you can help them today.' }]
                    }],
                    turn_complete: true
                }
            };
            socket.geminiLive.send(JSON.stringify(initialMessage));
            console.log('👋 Sent initial greeting prompt to Gemini for call:', socket.twilioStreamSid);
        }
    }, 500);
};

server.geminiLive.onClose = (socket) => {
    console.log('🔌 Gemini Live connection closed for call:', socket.twilioStreamSid);
};

server.onError = (socket, event) => {
    console.error('❌ Server error:', event);
};

server.onClose = (socket, event) => {
    console.log('📴 Call ended:', socket.twilioStreamSid);
    console.log('🕐 Call ended at:', new Date().toISOString());
};

// Main voice webhook handler
app.post('/webhook/voice', async (req, res) => {
    console.log('📞 Incoming call webhook:', req.body);
    
    // Get the Twilio number that received the call
    const toNumber = req.body.To;
    const fromNumber = req.body.From;
    const callSid = req.body.CallSid;
    
    // Get client configuration based on the Twilio number
    const clientConfig = await getClientConfigByPhoneNumber(toNumber);
    
    if (!clientConfig) {
        console.error('❌ No client configuration found for number:', toNumber);
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say('Sorry, this number is not configured properly.');
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    console.log('✅ Found client configuration for:', clientConfig.clientName);
    
    // Check if this is a direct agent number
    if (clientConfig.phoneNumber.agent_id) {
        // Direct routing to specific agent
        const agent = clientConfig.agents.find(a => a.id === clientConfig.phoneNumber.agent_id);
        
        if (!agent) {
            console.error('❌ Agent not found for direct number:', toNumber);
            const twiml = new twilio.twiml.VoiceResponse();
            twiml.say('Sorry, the AI agent for this number is not available.');
            res.type('text/xml');
            res.send(twiml.toString());
            return;
        }
        
        console.log('🤖 Direct routing to agent:', agent.name);
        
        // Store call session
        const sessionData = {
            clientConfig,
            selectedAgent: agent,
            callType: 'inbound',
            fromNumber,
            toNumber,
            startTime: new Date().toISOString()
        };
        
        // Store in database
        await storeCallSession(callSid, sessionData);
        
        // Also store in memory as backup
        callSessionStore.set(callSid, sessionData);
        
        // Connect directly to the agent
        const twiml = new twilio.twiml.VoiceResponse();
        
        // Enable call recording if configured
        if (clientConfig.recordingEnabled) {
            twiml.record({
                action: '/webhook/recording',
                method: 'POST',
                maxLength: 14400, // 4 hours max
                recordingStatusCallback: '/webhook/recording-status',
                recordingStatusCallbackMethod: 'POST'
            });
        }
        
        // Start a stream to capture audio
        const start = twiml.start();
        start.stream({
            url: `${WEBSOCKET_URL}?callSid=${callSid}`,
            track: 'both_tracks'
        });
        
        // Use agent-specific greeting
        const greeting = agent.greeting || 'Hello! I am your AI assistant. How can I help you today?';
        
        twiml.say({
            voice: 'alice',
            language: agent.language_code || 'en-US'
        }, greeting);
        
        // Keep the call alive
        twiml.pause({ length: 60 });
        
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    // Check routing strategy
    switch (clientConfig.routingStrategy) {
        case 'single_number_ivr':
            // Handle IVR menu routing
            handleIVRRouting(req, res, clientConfig);
            break;
            
        case 'external_integration':
            // Handle external system integration
            handleExternalIntegration(req, res, clientConfig);
            break;
            
        case 'time_based':
            // Handle time-based routing
            handleTimeBasedRouting(req, res, clientConfig);
            break;
            
        default:
            // Default to simple greeting and connection to default agent
            const defaultAgent = clientConfig.agents[0];
            
            if (!defaultAgent) {
                console.error('❌ No agents available for client:', clientConfig.clientId);
                const twiml = new twilio.twiml.VoiceResponse();
                twiml.say('Sorry, no AI agents are available. Please try again later.');
                res.type('text/xml');
                res.send(twiml.toString());
                return;
            }
            
            console.log('🤖 Default routing to agent:', defaultAgent.name);
            
            // Store call session
            const sessionData = {
                clientConfig,
                selectedAgent: defaultAgent,
                callType: 'inbound',
                fromNumber,
                toNumber,
                startTime: new Date().toISOString()
            };
            
            // Store in database
            await storeCallSession(callSid, sessionData);
            
            // Also store in memory as backup
            callSessionStore.set(callSid, sessionData);
            
            // Connect to default agent
            const twiml = new twilio.twiml.VoiceResponse();
            
            // Start a stream to capture audio
            const start = twiml.start();
            start.stream({
                url: `${WEBSOCKET_URL}?callSid=${callSid}`,
                track: 'both_tracks'
            });
            
            // Use agent-specific greeting
            const greeting = defaultAgent.greeting || 'Hello! I am your AI assistant. How can I help you today?';
            
            twiml.say({
                voice: 'alice',
                language: defaultAgent.language_code || 'en-US'
            }, greeting);
            
            // Keep the call alive
            twiml.pause({ length: 60 });
            
            res.type('text/xml');
            res.send(twiml.toString());
    }
});

// Handle IVR menu routing
async function handleIVRRouting(req, res, clientConfig) {
    const callSid = req.body.CallSid;
    const fromNumber = req.body.From;
    const toNumber = req.body.To;
    
    // Check if IVR menu exists
    if (!clientConfig.ivrMenu) {
        console.error('❌ No IVR menu configured for client:', clientConfig.clientId);
        
        // Fall back to default agent
        const defaultAgent = clientConfig.agents[0];
        
        if (!defaultAgent) {
            const twiml = new twilio.twiml.VoiceResponse();
            twiml.say('Sorry, the menu system is not configured properly.');
            res.type('text/xml');
            res.send(twiml.toString());
            return;
        }
        
        // Store call session with default agent
        const sessionData = {
            clientConfig,
            selectedAgent: defaultAgent,
            callType: 'inbound',
            fromNumber,
            toNumber,
            startTime: new Date().toISOString()
        };
        
        await storeCallSession(callSid, sessionData);
        callSessionStore.set(callSid, sessionData);
        
        // Connect to default agent
        const twiml = new twilio.twiml.VoiceResponse();
        
        // Start a stream to capture audio
        const start = twiml.start();
        start.stream({
            url: `${WEBSOCKET_URL}?callSid=${callSid}`,
            track: 'both_tracks'
        });
        
        // Use agent-specific greeting
        const greeting = defaultAgent.greeting || 'Hello! I am your AI assistant. How can I help you today?';
        
        twiml.say({
            voice: 'alice',
            language: defaultAgent.language_code || 'en-US'
        }, greeting);
        
        // Keep the call alive
        twiml.pause({ length: 60 });
        
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    console.log('📱 Using IVR menu:', clientConfig.ivrMenu.name);
    
    // Create IVR menu
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Gather agent selection
    const gather = twiml.gather({
        numDigits: 1,
        action: `/webhook/ivr-selection?callSid=${callSid}`,
        method: 'POST',
        timeout: clientConfig.ivrMenu.timeout_seconds || 10
    });
    
    // Play greeting
    gather.say(clientConfig.ivrMenu.greeting_text);
    
    // If no input, repeat the menu or go to default agent
    twiml.redirect(`/webhook/ivr-timeout?callSid=${callSid}`);
    
    // Store call session with IVR context
    const sessionData = {
        clientConfig,
        ivrContext: {
            menuId: clientConfig.ivrMenu.id,
            attempts: 0
        },
        callType: 'inbound',
        fromNumber,
        toNumber,
        startTime: new Date().toISOString()
    };
    
    await storeCallSession(callSid, sessionData);
    callSessionStore.set(callSid, sessionData);
    
    res.type('text/xml');
    res.send(twiml.toString());
}

// Handle IVR selection
app.post('/webhook/ivr-selection', async (req, res) => {
    const digits = req.body.Digits;
    const callSid = req.query.callSid || req.body.CallSid;
    
    console.log('📱 IVR selection:', digits, 'for call:', callSid);
    
    // Get call session
    let callSession = await getCallSession(callSid);
    
    // Try in-memory store if not in database
    if (!callSession && callSessionStore.has(callSid)) {
        callSession = callSessionStore.get(callSid);
    }
    
    if (!callSession) {
        console.error('❌ No call session found for SID:', callSid);
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say('Sorry, there was an error processing your selection. Please call back.');
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    // Find the selected option
    const selectedOption = callSession.clientConfig.ivrMenu.ivr_options.find(
        option => option.digit === digits
    );
    
    if (!selectedOption) {
        console.log('❌ Invalid IVR selection:', digits);
        
        // Update attempts count
        const ivrContext = callSession.ivrContext || {};
        const attempts = (ivrContext.attempts || 0) + 1;
        
        // Check if max attempts reached
        if (attempts >= (callSession.clientConfig.ivrMenu.max_attempts || 3)) {
            // Transfer to default agent
            const defaultAgent = callSession.clientConfig.agents[0];
            
            if (!defaultAgent) {
                const twiml = new twilio.twiml.VoiceResponse();
                twiml.say('Sorry, no agents are available. Please try again later.');
                res.type('text/xml');
                res.send(twiml.toString());
                return;
            }
            
            // Update call session
            const updatedSession = {
                ...callSession,
                selectedAgent: defaultAgent,
                ivrContext: null
            };
            
            await storeCallSession(callSid, updatedSession);
            callSessionStore.set(callSid, updatedSession);
            
            // Connect to default agent
            const twiml = new twilio.twiml.VoiceResponse();
            
            // Start a stream to capture audio
            const start = twiml.start();
            start.stream({
                url: `${WEBSOCKET_URL}?callSid=${callSid}`,
                track: 'both_tracks'
            });
            
            twiml.say('I\'ll connect you with our general assistant.');
            
            // Keep the call alive
            twiml.pause({ length: 60 });
            
            res.type('text/xml');
            res.send(twiml.toString());
            return;
        }
        
        // Try again
        const twiml = new twilio.twiml.VoiceResponse();
        
        // Gather agent selection
        const gather = twiml.gather({
            numDigits: 1,
            action: `/webhook/ivr-selection?callSid=${callSid}`,
            method: 'POST',
            timeout: callSession.clientConfig.ivrMenu.timeout_seconds || 10
        });
        
        gather.say('Sorry, that\'s not a valid option. ' + callSession.clientConfig.ivrMenu.greeting_text);
        
        // If no input again, redirect to timeout handler
        twiml.redirect(`/webhook/ivr-timeout?callSid=${callSid}`);
        
        // Update call session with attempt count
        const updatedSession = {
            ...callSession,
            ivrContext: {
                ...ivrContext,
                attempts
            }
        };
        
        await storeCallSession(callSid, updatedSession);
        callSessionStore.set(callSid, updatedSession);
        
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    // Process the selected option
    if (selectedOption.action_type === 'agent') {
        // Find the selected agent
        const selectedAgent = callSession.clientConfig.agents.find(
            agent => agent.id === selectedOption.agent_id
        );
        
        if (!selectedAgent) {
            console.error('❌ Selected agent not found:', selectedOption.agent_id);
            const twiml = new twilio.twiml.VoiceResponse();
            twiml.say('Sorry, the selected department is not available. Please try again later.');
            res.type('text/xml');
            res.send(twiml.toString());
            return;
        }
        
        console.log('🤖 IVR routing to agent:', selectedAgent.name);
        
        // Update call session
        const updatedSession = {
            ...callSession,
            selectedAgent,
            ivrContext: null
        };
        
        await storeCallSession(callSid, updatedSession);
        callSessionStore.set(callSid, updatedSession);
        
        // Connect to selected agent
        const twiml = new twilio.twiml.VoiceResponse();
        
        // Start a stream to capture audio
        const start = twiml.start();
        start.stream({
            url: `${WEBSOCKET_URL}?callSid=${callSid}`,
            track: 'both_tracks'
        });
        
        // Use agent-specific greeting
        const greeting = selectedAgent.greeting || 'Hello! I am your AI assistant. How can I help you today?';
        
        twiml.say({
            voice: 'alice',
            language: selectedAgent.language_code || 'en-US'
        }, greeting);
        
        // Keep the call alive
        twiml.pause({ length: 60 });
        
        res.type('text/xml');
        res.send(twiml.toString());
    } else if (selectedOption.action_type === 'transfer') {
        // Handle transfer to external number
        const transferNumber = selectedOption.action_data?.phone_number;
        
        if (!transferNumber) {
            console.error('❌ Transfer number not configured for option:', selectedOption.id);
            const twiml = new twilio.twiml.VoiceResponse();
            twiml.say('Sorry, the transfer number is not configured properly.');
            res.type('text/xml');
            res.send(twiml.toString());
            return;
        }
        
        console.log('📞 Transferring call to:', transferNumber);
        
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say('Transferring your call. Please hold.');
        twiml.dial(transferNumber);
        
        res.type('text/xml');
        res.send(twiml.toString());
    } else if (selectedOption.action_type === 'voicemail') {
        // Handle voicemail recording
        console.log('📝 Routing to voicemail');
        
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say('Please leave a message after the tone.');
        twiml.record({
            action: '/webhook/voicemail',
            method: 'POST',
            maxLength: 300,
            playBeep: true,
            transcribe: true,
            transcribeCallback: '/webhook/voicemail-transcription'
        });
        
        res.type('text/xml');
        res.send(twiml.toString());
    } else {
        console.error('❌ Unknown action type:', selectedOption.action_type);
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say('Sorry, that option is not available.');
        res.type('text/xml');
        res.send(twiml.toString());
    }
});

// Handle IVR timeout
app.get('/webhook/ivr-timeout', async (req, res) => {
    const callSid = req.query.callSid;
    
    console.log('⏱️ IVR timeout for call:', callSid);
    
    // Get call session
    let callSession = await getCallSession(callSid);
    
    // Try in-memory store if not in database
    if (!callSession && callSessionStore.has(callSid)) {
        callSession = callSessionStore.get(callSid);
    }
    
    if (!callSession) {
        console.error('❌ No call session found for SID:', callSid);
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say('Sorry, there was an error processing your call. Please call back.');
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    // Default to first agent
    const defaultAgent = callSession.clientConfig.agents[0];
    
    if (!defaultAgent) {
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say('Sorry, no agents are available. Please try again later.');
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    console.log('🤖 IVR timeout, routing to default agent:', defaultAgent.name);
    
    // Update call session
    const updatedSession = {
        ...callSession,
        selectedAgent: defaultAgent,
        ivrContext: null
    };
    
    await storeCallSession(callSid, updatedSession);
    callSessionStore.set(callSid, updatedSession);
    
    // Connect to default agent
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Start a stream to capture audio
    const start = twiml.start();
    start.stream({
        url: `${WEBSOCKET_URL}?callSid=${callSid}`,
        track: 'both_tracks'
    });
    
    twiml.say('I\'ll connect you with our assistant.');
    
    // Keep the call alive
    twiml.pause({ length: 60 });
    
    res.type('text/xml');
    res.send(twiml.toString());
});

// Handle external system integration
async function handleExternalIntegration(req, res, clientConfig) {
    const callSid = req.body.CallSid;
    const fromNumber = req.body.From;
    const toNumber = req.body.To;
    
    // Check if external integration exists
    if (!clientConfig.externalIntegrations || clientConfig.externalIntegrations.length === 0) {
        console.error('❌ No external integrations configured for client:', clientConfig.clientId);
        
        // Fall back to default agent
        const defaultAgent = clientConfig.agents[0];
        
        if (!defaultAgent) {
            const twiml = new twilio.twiml.VoiceResponse();
            twiml.say('Sorry, external integration is not configured properly.');
            res.type('text/xml');
            res.send(twiml.toString());
            return;
        }
        
        // Store call session with default agent
        const sessionData = {
            clientConfig,
            selectedAgent: defaultAgent,
            callType: 'inbound',
            fromNumber,
            toNumber,
            startTime: new Date().toISOString()
        };
        
        await storeCallSession(callSid, sessionData);
        callSessionStore.set(callSid, sessionData);
        
        // Connect to default agent
        const twiml = new twilio.twiml.VoiceResponse();
        
        // Start a stream to capture audio
        const start = twiml.start();
        start.stream({
            url: `${WEBSOCKET_URL}?callSid=${callSid}`,
            track: 'both_tracks'
        });
        
        // Use agent-specific greeting
        const greeting = defaultAgent.greeting || 'Hello! I am your AI assistant. How can I help you today?';
        
        twiml.say({
            voice: 'alice',
            language: defaultAgent.language_code || 'en-US'
        }, greeting);
        
        // Keep the call alive
        twiml.pause({ length: 60 });
        
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    // Get the first active integration
    const integration = clientConfig.externalIntegrations[0];
    
    console.log('🔌 Using external integration:', integration.integration_type);
    
    switch (integration.integration_type) {
        case 'sip':
            // Handle SIP trunk integration
            const sipUri = integration.configuration.sip_uri;
            
            if (!sipUri) {
                console.error('❌ SIP URI not configured for integration:', integration.id);
                const twiml = new twilio.twiml.VoiceResponse();
                twiml.say('Sorry, SIP integration is not configured properly.');
                res.type('text/xml');
                res.send(twiml.toString());
                return;
            }
            
            console.log('📞 Routing call to SIP URI:', sipUri);
            
            const twimlSip = new twilio.twiml.VoiceResponse();
            twimlSip.dial().sip(sipUri);
            
            res.type('text/xml');
            res.send(twimlSip.toString());
            break;
            
        case 'extension':
            // Handle extension-based routing
            // This assumes the call is coming from a PBX that has already processed the extension
            // We just need to connect to the right agent based on the extension
            
            // Get the extension from the request (could be in different places depending on the PBX)
            const extension = req.body.Digits || req.query.extension;
            
            if (!extension) {
                console.error('❌ Extension not provided for extension-based routing');
                const twiml = new twilio.twiml.VoiceResponse();
                twiml.say('Sorry, no extension was provided.');
                res.type('text/xml');
                res.send(twiml.toString());
                return;
            }
            
            console.log('📞 Extension-based routing for extension:', extension);
            
            // Find the agent mapped to this extension
            const extensionMap = integration.configuration.extension_map || {};
            const agentId = extensionMap[extension];
            
            if (!agentId) {
                console.error('❌ No agent mapped to extension:', extension);
                const twiml = new twilio.twiml.VoiceResponse();
                twiml.say('Sorry, that extension is not valid.');
                res.type('text/xml');
                res.send(twiml.toString());
                return;
            }
            
            // Find the agent
            const agent = clientConfig.agents.find(a => a.id === agentId);
            
            if (!agent) {
                console.error('❌ Agent not found for extension:', extension);
                const twiml = new twilio.twiml.VoiceResponse();
                twiml.say('Sorry, the AI agent for this extension is not available.');
                res.type('text/xml');
                res.send(twiml.toString());
                return;
            }
            
            // Store call session
            const sessionData = {
                clientConfig,
                selectedAgent: agent,
                callType: 'inbound',
                fromNumber,
                toNumber,
                startTime: new Date().toISOString()
            };
            
            await storeCallSession(callSid, sessionData);
            callSessionStore.set(callSid, sessionData);
            
            // Connect to the agent
            const twiml = new twilio.twiml.VoiceResponse();
            
            // Start a stream to capture audio
            const start = twiml.start();
            start.stream({
                url: `${WEBSOCKET_URL}?callSid=${callSid}`,
                track: 'both_tracks'
            });
            
            // Use agent-specific greeting
            const greeting = agent.greeting || 'Hello! I am your AI assistant. How can I help you today?';
            
            twiml.say({
                voice: 'alice',
                language: agent.language_code || 'en-US'
            }, greeting);
            
            // Keep the call alive
            twiml.pause({ length: 60 });
            
            res.type('text/xml');
            res.send(twiml.toString());
            break;
            
        case 'forwarding':
            // Handle call forwarding from existing number
            // Similar to direct agent routing
            const agentIdForwarding = integration.configuration.agent_id;
            
            if (!agentIdForwarding) {
                console.error('❌ No agent configured for forwarding integration:', integration.id);
                const twiml = new twilio.twiml.VoiceResponse();
                twiml.say('Sorry, forwarding is not configured properly.');
                res.type('text/xml');
                res.send(twiml.toString());
                return;
            }
            
            // Find the agent
            const agentForwarding = clientConfig.agents.find(a => a.id === agentIdForwarding);
            
            if (!agentForwarding) {
                console.error('❌ Agent not found for forwarding:', agentIdForwarding);
                const twiml = new twilio.twiml.VoiceResponse();
                twiml.say('Sorry, the AI agent is not available.');
                res.type('text/xml');
                res.send(twiml.toString());
                return;
            }
            
            console.log('📞 Call forwarding to agent:', agentForwarding.name);
            
            // Store call session
            const forwardingSessionData = {
                clientConfig,
                selectedAgent: agentForwarding,
                callType: 'inbound',
                fromNumber,
                toNumber,
                startTime: new Date().toISOString()
            };
            
            await storeCallSession(callSid, forwardingSessionData);
            callSessionStore.set(callSid, forwardingSessionData);
            
            // Connect to the agent
            const twimlForwarding = new twilio.twiml.VoiceResponse();
            
            // Start a stream to capture audio
            const startForwarding = twimlForwarding.start();
            startForwarding.stream({
                url: `${WEBSOCKET_URL}?callSid=${callSid}`,
                track: 'both_tracks'
            });
            
            // Use agent-specific greeting
            const greetingForwarding = agentForwarding.greeting || 'Hello! I am your AI assistant. How can I help you today?';
            
            twimlForwarding.say({
                voice: 'alice',
                language: agentForwarding.language_code || 'en-US'
            }, greetingForwarding);
            
            // Keep the call alive
            twimlForwarding.pause({ length: 60 });
            
            res.type('text/xml');
            res.send(twimlForwarding.toString());
            break;
            
        default:
            console.error('❌ Unknown integration type:', integration.integration_type);
            const twimlDefault = new twilio.twiml.VoiceResponse();
            twimlDefault.say('Sorry, this integration type is not supported.');
            res.type('text/xml');
            res.send(twimlDefault.toString());
    }
}

// Handle time-based routing
async function handleTimeBasedRouting(req, res, clientConfig) {
    const callSid = req.body.CallSid;
    const fromNumber = req.body.From;
    const toNumber = req.body.To;
    
    // Get current time in client's timezone
    const clientTimezone = clientConfig.timezone || 'America/New_York';
    const now = new Date();
    const clientTime = new Intl.DateTimeFormat('en-US', {
        timeZone: clientTimezone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
    }).format(now);
    
    // Get day of week (0 = Sunday, 1 = Monday, etc.)
    const clientDay = new Intl.DateTimeFormat('en-US', {
        timeZone: clientTimezone,
        weekday: 'numeric'
    }).format(now);
    
    const dayMap = {
        'Sunday': 0,
        'Monday': 1,
        'Tuesday': 2,
        'Wednesday': 3,
        'Thursday': 4,
        'Friday': 5,
        'Saturday': 6
    };
    
    const dayOfWeek = dayMap[clientDay];
    
    console.log('⏰ Time-based routing check:', {
        clientTime,
        clientDay,
        dayOfWeek
    });
    
    // Find business hours agent and after hours agent
    let businessHoursAgent = null;
    let afterHoursAgent = null;
    
    for (const agent of clientConfig.agents) {
        if (agent.agent_type === 'general') {
            // Default agent for any time
            if (!businessHoursAgent) {
                businessHoursAgent = agent;
            }
        } else if (agent.agent_type === 'after_hours') {
            afterHoursAgent = agent;
        }
    }
    
    // If no specific agents found, use the first available agent
    if (!businessHoursAgent && clientConfig.agents.length > 0) {
        businessHoursAgent = clientConfig.agents[0];
    }
    
    if (!afterHoursAgent && clientConfig.agents.length > 0) {
        // Use business hours agent as fallback
        afterHoursAgent = businessHoursAgent;
    }
    
    // Check if current time is within business hours
    let isBusinessHours = false;
    
    // Check if the current day is a business day
    const businessDays = businessHoursAgent?.business_days || [1, 2, 3, 4, 5]; // Default: Monday-Friday
    const isBusinessDay = businessDays.includes(dayOfWeek);
    
    if (isBusinessDay) {
        // Check if current time is within business hours
        const businessHoursStart = businessHoursAgent?.business_hours_start || '09:00';
        const businessHoursEnd = businessHoursAgent?.business_hours_end || '17:00';
        
        // Convert to 24-hour format for comparison
        const [currentHour, currentMinute] = clientTime.split(':').map(Number);
        const [startHour, startMinute] = businessHoursStart.split(':').map(Number);
        const [endHour, endMinute] = businessHoursEnd.split(':').map(Number);
        
        const currentMinutes = currentHour * 60 + currentMinute;
        const startMinutes = startHour * 60 + startMinute;
        const endMinutes = endHour * 60 + endMinute;
        
        isBusinessHours = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }
    
    // Select the appropriate agent
    const selectedAgent = isBusinessHours ? businessHoursAgent : afterHoursAgent;
    
    if (!selectedAgent) {
        console.error('❌ No agent available for time-based routing');
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say('Sorry, no agents are available at this time. Please call back during business hours.');
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    console.log(`🕒 Time-based routing to ${isBusinessHours ? 'business hours' : 'after hours'} agent:`, selectedAgent.name);
    
    // Store call session
    const sessionData = {
        clientConfig,
        selectedAgent,
        callType: 'inbound',
        fromNumber,
        toNumber,
        startTime: new Date().toISOString()
    };
    
    await storeCallSession(callSid, sessionData);
    callSessionStore.set(callSid, sessionData);
    
    // Connect to the selected agent
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Start a stream to capture audio
    const start = twiml.start();
    start.stream({
        url: `${WEBSOCKET_URL}?callSid=${callSid}`,
        track: 'both_tracks'
    });
    
    // Use agent-specific greeting
    const greeting = selectedAgent.greeting || 'Hello! I am your AI assistant. How can I help you today?';
    
    twiml.say({
        voice: 'alice',
        language: selectedAgent.language_code || 'en-US'
    }, greeting);
    
    // Keep the call alive
    twiml.pause({ length: 60 });
    
    res.type('text/xml');
    res.send(twiml.toString());
}

// Twilio webhook for call status
app.post('/webhook/status', (req, res) => {
    console.log('📊 Call status update:', req.body);
    res.sendStatus(200);
});

// Recording status webhook
app.post('/webhook/recording-status', (req, res) => {
    console.log('🎙️ Recording status update:', req.body);
    res.sendStatus(200);
});

// Voicemail webhook
app.post('/webhook/voicemail', (req, res) => {
    console.log('📝 Voicemail received:', req.body);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Thank you for your message. We will get back to you as soon as possible.');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
});

// Voicemail transcription webhook
app.post('/webhook/voicemail-transcription', (req, res) => {
    console.log('📝 Voicemail transcription received:', req.body);
    res.sendStatus(200);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        gemini: process.env.GEMINI_API_KEY ? 'configured' : 'missing',
        supabase: process.env.SUPABASE_URL ? 'configured' : 'missing',
        port: PORT,
        version: '1.0.0'
    });
});

// Test endpoint for Twilio integration
app.get('/test/twilio', async (req, res) => {
    try {
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
            throw new Error('Twilio credentials not configured');
        }
        
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        
        // Test Twilio connection
        const account = await client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
        
        res.json({
            status: 'success',
            twilio: {
                connected: true,
                account_sid: account.sid,
                account_status: account.status,
                webhook_url: `${WEBHOOK_URL}/webhook/voice`,
                stream_url: `${WEBSOCKET_URL}`
            }
        });
    } catch (error) {
        console.error('❌ Twilio test failed:', error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Test endpoint for Gemini integration
app.get('/test/gemini', async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('Gemini API key not configured');
        }
        
        res.json({
            status: 'success',
            gemini: {
                connected: true,
                api_key_configured: true,
                model: 'models/gemini-2.0-flash-live-001',
                voice: process.env.VOICE_NAME || 'Puck',
                language: process.env.LANGUAGE_CODE || 'en-US'
            }
        });
    } catch (error) {
        console.error('❌ Gemini test failed:', error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Test endpoint for Supabase integration
app.get('/test/supabase', async (req, res) => {
    try {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Supabase credentials not configured');
        }
        
        // Test Supabase connection by fetching a count of profiles
        const { count, error } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true });
        
        if (error) {
            throw new Error(`Supabase connection error: ${error.message}`);
        }
        
        res.json({
            status: 'success',
            supabase: {
                connected: true,
                url: process.env.SUPABASE_URL,
                profiles_count: count
            }
        });
    } catch (error) {
        console.error('❌ Supabase test failed:', error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Start the server
httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 WebSocket URL: ${WEBSOCKET_URL}`);
    console.log(`🔗 Webhook URL: ${WEBHOOK_URL}/webhook/voice`);
    console.log(`🩺 Health check: ${WEBHOOK_URL}/health`);
});