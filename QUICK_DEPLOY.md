# 🚀 AI Call Center - Quick Deploy Guide

## Single Command Deployment

Deploy the entire AI Call Center with one command:

```bash
./one-command-deploy.sh
```

## Prerequisites

1. **Environment Variables** - Set these in your `.env` file:
```bash
# Required - Gemini AI
GEMINI_API_KEY=your_gemini_api_key

# Required - Twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_phone_number

# Optional - Supabase (for call logging)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

2. **Ports** - Ensure these ports are available:
   - `12001` - Main WebSocket server
   - `12002` - Health check server

## What the Deploy Script Does

1. ✅ Installs all dependencies (`npm install`)
2. ✅ Builds all packages (`npm run build`)
3. ✅ Validates environment variables
4. ✅ Runs system tests
5. ✅ Starts the production server
6. ✅ Displays webhook URLs for Twilio configuration

## Production URLs

After deployment, configure these URLs in your Twilio Console:

- **Webhook URL**: `https://your-domain.com/webhook/voice`
- **WebSocket URL**: `wss://your-domain.com`

## System Status

Check system health at: `https://your-domain.com/test/system`

Expected response:
```json
{
  "overall_status": "pass",
  "score": "4/4",
  "tests": {
    "twilio": {"status": "pass"},
    "gemini": {"status": "pass"},
    "audio": {"status": "pass"},
    "websocket": {"status": "pass"}
  }
}
```

## Troubleshooting

- **Port conflicts**: Change `PORT` in `.env`
- **API key issues**: Verify `GEMINI_API_KEY` is valid
- **Twilio errors**: Check `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
- **Audio issues**: Ensure WebSocket URL is accessible

## Architecture

```
Phone Call → Twilio → WebSocket → Audio Converter → Gemini Live API
                                      ↓
Phone Call ← Twilio ← WebSocket ← Audio Converter ← Gemini Response
```

## Features

- 🎯 Real-time AI conversations
- 🔊 High-quality audio processing (5ms latency)
- 🤖 Gemini 2.0 Flash Live model
- 📞 Production-ready Twilio integration
- 🔄 Bidirectional audio streaming
- 📊 Health monitoring and system tests