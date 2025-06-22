#!/bin/bash

echo "🚀 AI Call Center - Complete Deployment from Scratch"
echo "====================================================="

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to install Node.js if not present
install_nodejs() {
    if ! command_exists node; then
        echo "📦 Installing Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    
    echo "✅ Node.js version: $(node --version)"
    echo "✅ NPM version: $(npm --version)"
}

# Function to install global dependencies
install_global_deps() {
    echo "🌐 Installing global dependencies..."
    
    if ! command_exists pm2; then
        npm install -g pm2
        echo "✅ PM2 installed"
    fi
    
    if ! command_exists serve; then
        npm install -g serve
        echo "✅ Serve installed"
    fi
    
    if ! command_exists typescript; then
        npm install -g typescript
        echo "✅ TypeScript installed"
    fi
}

# Function to create environment files if they don't exist
create_env_files() {
    echo "🔐 Setting up environment files..."
    
    if [ ! -f ".env" ]; then
        echo "Creating backend .env file..."
        cat > .env << 'EOF'
# Backend Environment Variables
NODE_ENV=production
PORT=12001
HEALTH_PORT=12002

# Gemini AI Configuration
GEMINI_API_KEY=AIzaSyBvbW4Ej5-Ej5-Ej5-Ej5-Ej5-Ej5-Ej5-Ej5

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Twilio Configuration
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890
EOF
        echo "⚠️  Please update .env with your actual credentials!"
    fi
    
    if [ ! -f "frontend/.env" ]; then
        echo "Creating frontend .env file..."
        mkdir -p frontend
        cat > frontend/.env << 'EOF'
# Frontend Environment Variables
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:12001
EOF
        echo "⚠️  Please update frontend/.env with your actual credentials!"
    fi
    
    echo "✅ Environment files ready"
}

# Function to install all dependencies
install_dependencies() {
    echo "📦 Installing dependencies..."
    
    # Install root dependencies
    echo "Installing root dependencies..."
    npm install
    
    # Install package dependencies
    for package in audio-converter gemini-live-client twilio-server tw2gem-server; do
        if [ -d "packages/$package" ]; then
            echo "Installing dependencies for $package..."
            cd "packages/$package"
            npm install
            cd ../..
        fi
    done
    
    # Install frontend dependencies
    if [ -d "frontend" ]; then
        echo "Installing frontend dependencies..."
        cd frontend
        npm install
        cd ..
    fi
    
    echo "✅ All dependencies installed"
}

# Function to build all packages
build_packages() {
    echo "🔨 Building all packages..."
    
    # Build each package
    for package in audio-converter gemini-live-client twilio-server tw2gem-server; do
        if [ -d "packages/$package" ]; then
            echo "Building $package..."
            cd "packages/$package"
            npm run build
            cd ../..
        fi
    done
    
    echo "✅ All packages built"
}

# Function to build frontend
build_frontend() {
    echo "🌐 Building frontend..."
    
    if [ -d "frontend" ]; then
        cd frontend
        npm run build
        cd ..
        echo "✅ Frontend built"
    else
        echo "❌ Frontend directory not found"
        exit 1
    fi
}

# Function to fix ES module imports
fix_es_modules() {
    echo "🔧 Fixing ES module imports..."
    
    # Fix audio-converter index.js
    if [ -f "packages/audio-converter/dist/index.js" ]; then
        sed -i "s/from '\.\/audio-converter'/from '.\/audio-converter.js'/g" packages/audio-converter/dist/index.js
    fi
    
    echo "✅ ES module imports fixed"
}

# Function to start services
start_services() {
    echo "🚀 Starting services..."
    
    # Kill any existing PM2 processes
    pm2 kill 2>/dev/null || true
    sleep 2
    
    # Start services
    pm2 start ecosystem.config.cjs
    
    # Wait for services to start
    sleep 5
    
    echo "✅ Services started"
}

# Function to run health checks
run_health_checks() {
    echo "🏥 Running health checks..."
    
    # Check backend
    if curl -s http://localhost:12002/health > /dev/null; then
        echo "✅ Backend health check: PASSED"
    else
        echo "❌ Backend health check: FAILED"
        return 1
    fi
    
    # Check frontend
    if curl -s http://localhost:12000 > /dev/null; then
        echo "✅ Frontend health check: PASSED"
    else
        echo "❌ Frontend health check: FAILED"
        return 1
    fi
    
    return 0
}

# Main execution
main() {
    echo "Starting complete deployment process..."
    echo ""
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ]; then
        echo "❌ Error: package.json not found. Please run this script from the project root."
        exit 1
    fi
    
    # Step 1: Install Node.js if needed
    install_nodejs
    echo ""
    
    # Step 2: Install global dependencies
    install_global_deps
    echo ""
    
    # Step 3: Create environment files
    create_env_files
    echo ""
    
    # Step 4: Install all dependencies
    install_dependencies
    echo ""
    
    # Step 5: Build all packages
    build_packages
    echo ""
    
    # Step 6: Build frontend
    build_frontend
    echo ""
    
    # Step 7: Fix ES modules
    fix_es_modules
    echo ""
    
    # Step 8: Start services
    start_services
    echo ""
    
    # Step 9: Health checks
    if run_health_checks; then
        echo ""
        echo "🎉 DEPLOYMENT SUCCESSFUL!"
        echo "========================"
        echo "🌐 Frontend: https://work-1-jnfacjbjjbrdzrlo.prod-runtime.all-hands.dev"
        echo "🔧 Backend: https://work-2-jnfacjbjjbrdzrlo.prod-runtime.all-hands.dev"
        echo "🏥 Health: https://work-2-jnfacjbjjbrdzrlo.prod-runtime.all-hands.dev:12002/health"
        echo ""
        echo "📋 Management Commands:"
        echo "  pm2 status    - Check status"
        echo "  pm2 logs      - View logs"
        echo "  pm2 restart all - Restart"
        echo "  pm2 stop all  - Stop"
        echo ""
        echo "✨ System is PRODUCTION READY! ✨"
    else
        echo ""
        echo "❌ DEPLOYMENT FAILED!"
        echo "Check the logs with: pm2 logs"
        exit 1
    fi
}

# Run main function
main