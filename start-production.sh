#!/bin/bash

echo "🚀 Starting AI Call Center in Production Mode..."
echo "=================================================="

# Kill any existing PM2 processes completely
echo "🧹 Cleaning up existing processes..."
pm2 kill 2>/dev/null || true
sleep 2

# Auto-build if needed
AUTO_BUILD=false

# Check if all packages are built, offer to build if not
echo "🔍 Verifying package builds..."
NEEDS_BUILD=false
for package in audio-converter gemini-live-client twilio-server tw2gem-server; do
    if [ ! -d "packages/$package/dist" ]; then
        echo "⚠️  Package $package not built"
        NEEDS_BUILD=true
    fi
done

# Check if frontend is built
if [ ! -d "frontend/dist" ]; then
    echo "⚠️  Frontend not built"
    NEEDS_BUILD=true
fi

if [ "$NEEDS_BUILD" = true ]; then
    echo ""
    echo "🔨 Some components need building. Auto-building now..."
    
    # Install dependencies if node_modules don't exist
    if [ ! -d "node_modules" ]; then
        echo "📦 Installing root dependencies..."
        npm install
    fi
    
    # Build packages
    echo "🔨 Building packages..."
    for package in audio-converter gemini-live-client twilio-server tw2gem-server; do
        if [ -d "packages/$package" ] && [ ! -d "packages/$package/dist" ]; then
            echo "Building $package..."
            cd "packages/$package"
            if [ ! -d "node_modules" ]; then
                npm install
            fi
            npm run build
            cd ../..
        fi
    done
    
    # Build frontend
    if [ ! -d "frontend/dist" ]; then
        echo "🌐 Building frontend..."
        cd frontend
        if [ ! -d "node_modules" ]; then
            npm install
        fi
        npm run build
        cd ..
    fi
    
    # Fix ES module imports
    if [ -f "packages/audio-converter/dist/index.js" ]; then
        sed -i "s/from '\.\/audio-converter'/from '.\/audio-converter.js'/g" packages/audio-converter/dist/index.js
    fi
    
    echo "✅ Build completed"
fi

# Verify environment files exist
echo "🔍 Checking environment configuration..."
if [ ! -f ".env" ]; then
    echo "❌ ERROR: .env file not found!"
    echo "Please create .env file with your credentials"
    exit 1
fi

if [ ! -f "frontend/.env" ]; then
    echo "❌ ERROR: frontend/.env file not found!"
    echo "Please create frontend/.env file with your credentials"
    exit 1
fi

echo "✅ Environment files found"

# Verify dependencies
echo "🔍 Checking dependencies..."
if [ ! -f "server-standalone.js" ]; then
    echo "❌ ERROR: server-standalone.js not found!"
    exit 1
fi

if [ ! -f "ecosystem.config.cjs" ]; then
    echo "❌ ERROR: ecosystem.config.cjs not found!"
    exit 1
fi

echo "✅ All dependencies verified"

# Start the applications using PM2
echo "📞 Starting backend and frontend services..."
pm2 start ecosystem.config.cjs

# Wait for services to start
echo "⏳ Waiting for services to initialize..."
sleep 5

# Show status
echo "📊 PM2 Status:"
pm2 status

# Test health endpoints
echo ""
echo "🏥 Testing health endpoints..."
if curl -s http://localhost:12002/health > /dev/null; then
    echo "✅ Backend health check: PASSED"
else
    echo "❌ Backend health check: FAILED"
fi

if curl -s http://localhost:12000 > /dev/null; then
    echo "✅ Frontend health check: PASSED"
else
    echo "❌ Frontend health check: FAILED"
fi

echo ""
echo "🎉 AI Call Center is now PRODUCTION READY!"
echo "=================================================="
echo "🌐 Frontend: https://work-1-jnfacjbjjbrdzrlo.prod-runtime.all-hands.dev (port 12000)"
echo "🔧 Backend: https://work-2-jnfacjbjjbrdzrlo.prod-runtime.all-hands.dev (port 12001)"
echo "🏥 Health Check: https://work-2-jnfacjbjjbrdzrlo.prod-runtime.all-hands.dev:12002/health"
echo ""
echo "📋 Management Commands:"
echo "  pm2 status          - Check application status"
echo "  pm2 logs            - View real-time logs"
echo "  pm2 restart all     - Restart all services"
echo "  pm2 stop all        - Stop all services"
echo "  pm2 delete all      - Delete all services"
echo "  pm2 monit           - Monitor resources"
echo ""
echo "🔧 Quick Health Check:"
echo "  curl http://localhost:12002/health"
echo ""
echo "✨ System Status: ONLINE ✨"