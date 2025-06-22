// Supabase Service for Multi-tenant AI Call Center
// This service handles database operations for the multi-tenant system

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Supabase client with service role key for backend operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Cache for client configurations to reduce database queries
const clientConfigCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Get client configuration by phone number
export async function getClientConfigByPhoneNumber(phoneNumber) {
  // Check cache first
  if (clientConfigCache.has(phoneNumber)) {
    const cachedConfig = clientConfigCache.get(phoneNumber);
    if (cachedConfig.expiresAt > Date.now()) {
      return cachedConfig.data;
    }
    clientConfigCache.delete(phoneNumber);
  }

  try {
    // Query database for the phone number
    const { data: phoneData, error: phoneError } = await supabase
      .from('phone_numbers')
      .select('*, profiles(*)')
      .eq('phone_number', phoneNumber)
      .single();

    if (phoneError || !phoneData) {
      console.error('Error fetching phone number config:', phoneError);
      return null;
    }

    // Get the client profile
    const clientProfile = phoneData.profiles;
    
    // Get all phone numbers for this client
    const { data: allPhoneNumbers } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('profile_id', clientProfile.id);
      
    // Get all AI agents for this client
    const { data: allAgents } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('profile_id', clientProfile.id)
      .eq('is_active', true);
      
    // Get IVR menu if using single number with IVR
    let ivrMenu = null;
    if (clientProfile.routing_strategy === 'single_number_ivr' && phoneData.is_primary) {
      const { data: ivrData } = await supabase
        .from('ivr_menus')
        .select('*, ivr_options(*)')
        .eq('profile_id', clientProfile.id)
        .eq('is_active', true)
        .single();
        
      ivrMenu = ivrData;
    }
    
    // Get external integration if any
    const { data: integrations } = await supabase
      .from('external_integrations')
      .select('*')
      .eq('profile_id', clientProfile.id)
      .eq('is_active', true);
    
    // Compile complete configuration
    const config = {
      clientId: clientProfile.id,
      clientName: clientProfile.client_name || clientProfile.full_name,
      routingStrategy: clientProfile.routing_strategy || 'single_number_ivr',
      phoneNumber: phoneData,
      allPhoneNumbers: allPhoneNumbers || [],
      agents: allAgents || [],
      ivrMenu: ivrMenu,
      externalIntegrations: integrations || [],
      recordingEnabled: clientProfile.call_recording_enabled || true,
      transcriptionEnabled: clientProfile.transcription_enabled || true,
      maxConcurrentCalls: clientProfile.max_concurrent_calls || 5,
      minutesLimit: clientProfile.monthly_minute_limit || 1000,
      minutesUsed: clientProfile.minutes_used || 0
    };
    
    // Cache the configuration
    clientConfigCache.set(phoneNumber, {
      data: config,
      expiresAt: Date.now() + CACHE_TTL
    });
    
    return config;
  } catch (error) {
    console.error('Error fetching client configuration:', error);
    return null;
  }
}

// Get agent by ID
export async function getAgentById(agentId) {
  try {
    const { data, error } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', agentId)
      .single();
      
    if (error) {
      console.error('Error fetching agent:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching agent:', error);
    return null;
  }
}

// Store call session in database
export async function storeCallSession(callSid, sessionData) {
  try {
    const { data, error } = await supabase
      .from('call_sessions')
      .insert({
        call_sid: callSid,
        profile_id: sessionData.clientConfig?.clientId,
        agent_id: sessionData.selectedAgent?.id,
        phone_number_from: sessionData.fromNumber,
        phone_number_to: sessionData.toNumber,
        session_data: sessionData
      })
      .select()
      .single();
      
    if (error) {
      console.error('Error storing call session:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error storing call session:', error);
    return null;
  }
}

// Get call session from database
export async function getCallSession(callSid) {
  try {
    const { data, error } = await supabase
      .from('call_sessions')
      .select('*')
      .eq('call_sid', callSid)
      .single();
      
    if (error) {
      console.error('Error fetching call session:', error);
      return null;
    }
    
    return data.session_data;
  } catch (error) {
    console.error('Error fetching call session:', error);
    return null;
  }
}

// Create call log
export async function createCallLog(callData) {
  try {
    const { data, error } = await supabase
      .from('call_logs')
      .insert(callData)
      .select()
      .single();
      
    if (error) {
      console.error('Error creating call log:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error creating call log:', error);
    return null;
  }
}

// Update call log
export async function updateCallLog(callLogId, updates) {
  try {
    const { data, error } = await supabase
      .from('call_logs')
      .update(updates)
      .eq('id', callLogId)
      .select()
      .single();
      
    if (error) {
      console.error('Error updating call log:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error updating call log:', error);
    return null;
  }
}

// Increment minutes used
export async function incrementMinutesUsed(profileId, minutes) {
  try {
    const { error } = await supabase.rpc('increment_minutes_used', {
      p_profile_id: profileId,
      p_minutes: minutes
    });
    
    if (error) {
      console.error('Error incrementing minutes used:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error incrementing minutes used:', error);
    return false;
  }
}

// Export the Supabase client for direct use if needed
export { supabase };