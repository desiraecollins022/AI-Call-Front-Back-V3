#!/bin/bash

# AI Call Center - One-Command Deployment Wrapper
# This script ensures all prerequisites are met before running the main deployment script

echo "🚀 AI Call Center - One-Command Deployment"
echo "=========================================="

# Check if running with sudo/root
if [ "$EUID" -ne 0 ] && [ -z "$GITHUB_ACTIONS" ]; then
  echo "⚠️  This script may need elevated privileges to install global dependencies."
  echo "If you encounter permission errors, please run with sudo."
  echo ""
fi

# Check Node.js version
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed. Please install Node.js v18 or higher."
  exit 1
fi

NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js v18 or higher is required. Current version: $(node -v)"
  exit 1
fi

echo "✅ Node.js version $(node -v) detected"

# Check npm
if ! command -v npm &> /dev/null; then
  echo "❌ npm is not installed. Please install npm."
  exit 1
fi

echo "✅ npm version $(npm -v) detected"

# Install global dependencies if needed
echo "🔍 Checking global dependencies..."

INSTALL_GLOBALS=false

if ! command -v pm2 &> /dev/null; then
  echo "⚠️  PM2 not found. Will install globally."
  INSTALL_GLOBALS=true
fi

if ! command -v serve &> /dev/null; then
  echo "⚠️  serve not found. Will install globally."
  INSTALL_GLOBALS=true
fi

if ! command -v tsc &> /dev/null; then
  echo "⚠️  TypeScript not found. Will install globally."
  INSTALL_GLOBALS=true
fi

if [ "$INSTALL_GLOBALS" = true ]; then
  echo "📦 Installing global dependencies..."
  npm install -g pm2 serve typescript
  
  if [ $? -ne 0 ]; then
    echo "❌ Failed to install global dependencies. Try running with sudo."
    exit 1
  fi
  
  echo "✅ Global dependencies installed successfully"
fi

# Create logs directory
mkdir -p logs frontend/logs

# Make sure one-command-deploy.sh is executable
chmod +x one-command-deploy.sh

# Ensure Supabase dependency is installed
npm install @supabase/supabase-js --silent

# Run the main deployment script
echo "🚀 Starting main deployment process..."
echo ""
./one-command-deploy.sh

# Check if deployment was successful
if [ $? -eq 0 ]; then
  echo ""
  echo "✨ Deployment completed successfully! ✨"
  echo ""
  echo "📱 Access your AI Call Center at:"
  echo "🌐 Frontend: https://work-1-uqgmjligulgfvwib.prod-runtime.all-hands.dev"
  echo "🔧 Backend: https://work-2-uqgmjligulgfvwib.prod-runtime.all-hands.dev"
  echo ""
  echo "📋 For more information, see:"
  echo "- README.md - General documentation"
  echo "- TWILIO_SETUP.md - Configure Twilio for phone calls"
  echo "- PRODUCTION_READY.md - Production status and features"
else
  echo ""
  echo "❌ Deployment encountered issues."
  echo "Please check the logs above for details."
  echo "For troubleshooting, see DEPLOYMENT.md"
fi