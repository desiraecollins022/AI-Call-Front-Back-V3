#!/bin/bash

# AI Call Center - Simple Deploy (Production Ready)
# This script deploys the working AI Call Center configuration

set -e

echo "🚀 AI Call Center - Simple Deploy"
echo "================================="

# Check if .env exists and has required variables
if [ ! -f .env ]; then
    echo "❌ .env file not found. Creating template..."
    cat > .env << 'EOF'
# Backend Environment Variables
NODE_ENV=production
PORT=12001
HEALTH_PORT=12002

# Gemini AI Configuration (REQUIRED)
GEMINI_API_KEY=your_gemini_api_key_here

# Twilio Configuration (REQUIRED)
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=your_phone_number_here

# Supabase Configuration (Optional)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
EOF
    echo "📝 Please edit .env file with your API keys and run again"
    exit 1
fi

# Load environment variables
source .env

# Validate required variables
echo "🔍 Validating environment variables..."
if [ -z "$GEMINI_API_KEY" ] || [ "$GEMINI_API_KEY" = "your_gemini_api_key_here" ]; then
    echo "❌ GEMINI_API_KEY not set in .env file"
    exit 1
fi

if [ -z "$TWILIO_ACCOUNT_SID" ] || [ "$TWILIO_ACCOUNT_SID" = "your_account_sid_here" ]; then
    echo "❌ TWILIO_ACCOUNT_SID not set in .env file"
    exit 1
fi

echo "✅ Environment variables validated"

# Install dependencies
echo "📦 Installing dependencies..."
npm install --silent

# Build packages
echo "🔨 Building packages..."
npm run build

# Start server
echo "🚀 Starting AI Call Center..."
node server-standalone.js &
SERVER_PID=$!

# Wait for server to start
sleep 5

# Test system
echo "🧪 Testing system..."
if curl -s "http://localhost:${PORT}/test/system" > /dev/null; then
    echo "✅ System test passed"
else
    echo "❌ System test failed"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi

echo ""
echo "🎉 AI Call Center Successfully Deployed!"
echo "========================================"
echo "📞 Phone Number: ${TWILIO_PHONE_NUMBER}"
echo "🔗 Webhook URL: https://your-domain.com/webhook/voice"
echo "🎵 WebSocket URL: wss://your-domain.com"
echo "🏥 Health Check: http://localhost:${HEALTH_PORT}/health"
echo "🧪 System Tests: http://localhost:${PORT}/test/system"
echo ""
echo "🔧 Server PID: $SERVER_PID"
echo "📊 Server running on port ${PORT}"
echo ""
echo "📋 Configure Twilio webhook URL in your console:"
echo "   https://your-domain.com/webhook/voice"
echo ""
echo "✨ Ready for production calls! ✨"

# Keep server running
wait $SERVER_PID