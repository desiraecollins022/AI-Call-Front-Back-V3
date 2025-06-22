# 🚀 AI Call Center - Production Ready (Multi-Tenant)

## 🎯 ONE COMMAND DEPLOY (Fresh Clone Ready)

```bash
./one-command-deploy-wrapper.sh
```

**That's it!** This single command will:
- ✅ Install all global dependencies (PM2, serve, TypeScript)
- ✅ Create environment files with production credentials
- ✅ Fix all package.json files for ES modules
- ✅ Install ALL dependencies (root + packages + frontend)
- ✅ Build ALL packages with TypeScript compilation
- ✅ Build frontend with Vite
- ✅ Fix ES module import paths
- ✅ Create production server and PM2 configuration
- ✅ Start frontend and backend services (including multi-tenant server)
- ✅ Run comprehensive health checks
- ✅ **ZERO human intervention required!**

## 🚨 IMPORTANT: Deployment Verification

After running the one-command deploy script, verify that all services are running correctly:

1. **Main Backend**: 
   - Health check: `curl http://localhost:12001/health`
   - Expected response: `{"status":"healthy","timestamp":"...","gemini":"configured","port":12001,"version":"1.0.0"}`

2. **Multi-tenant Backend**: 
   - Health check: `curl http://localhost:12003/health`
   - Expected response: `{"status":"healthy","timestamp":"...","gemini":"configured","supabase":"configured","port":12003,"version":"1.0.0"}`

3. **Frontend**: 
   - Access: `http://localhost:12000`
   - Should load the login page

## Alternative (If Already Built)

```bash
./start-production.sh
```

Use this if packages are already built and you just want to start services.

## 🌟 Multi-Tenant Features

This AI Call Center now supports multi-tenant capabilities, allowing you to:

- 🏢 **Support Multiple Clients**: Each with their own configuration, agents, and phone numbers
- 📞 **Flexible Call Routing**:
  - Single number with IVR menu
  - Multiple dedicated numbers
  - Integration with existing phone systems
  - Time-based routing (business hours vs. after hours)
- 🤖 **Customizable AI Agents**: Create different agents for various departments and use cases
- 📊 **Usage Tracking**: Monitor minutes used per client for billing purposes
- 🔒 **Data Isolation**: Complete separation of data between tenants

### Database Schema

The multi-tenant functionality is supported by these database tables:
- `ai_agents`: Store different AI agents with customizable voices and instructions
- `phone_numbers`: Manage multiple phone numbers per client
- `ivr_menus` and `ivr_options`: Configure IVR menus for call routing
- `external_integrations`: Connect with existing phone systems
- `call_sessions`: Track active calls with client-specific settings
- `call_logs`: Record detailed call history per client

## 🌐 Live URLs

- **Frontend**: https://work-1-uqgmjligulgfvwib.prod-runtime.all-hands.dev
- **Backend**: https://work-2-uqgmjligulgfvwib.prod-runtime.all-hands.dev
- **Health Check**: https://work-2-uqgmjligulgfvwib.prod-runtime.all-hands.dev/health
- **Multi-tenant Backend**: https://work-3-uqgmjligulgfvwib.prod-runtime.all-hands.dev
- **Multi-tenant Health Check**: https://work-3-uqgmjligulgfvwib.prod-runtime.all-hands.dev/health

A complete AI-powered calling system with Twilio ↔ Gemini Live integration. This repository contains both the backend server and frontend dashboard in a single, organized structure.

## 🏗 Repository Structure

```
ai-calling-system/
├── 📁 frontend/           # React Dashboard (Vercel-ready)
│   ├── src/              # React components and pages
│   ├── package.json      # Frontend dependencies
│   ├── vercel.json       # Vercel deployment config
│   └── README.md         # Frontend-specific docs
├── 📁 packages/          # TW2GEM Core Packages
│   ├── tw2gem-server/    # Main Twilio ↔ Gemini server
│   ├── gemini-live-client/ # Gemini Live API client
│   ├── twilio-server/    # Twilio WebSocket handler
│   └── audio-converter/  # Audio format conversion
├── server.js             # Backend entry point
├── package.json          # Backend dependencies
├── render.yaml           # Render deployment config
└── README.md             # This file
```

## 🚀 Quick Start

### Option 1: Full Local Development

```bash
# Clone the repository
git clone https://github.com/diamondgray669/AI-Call-Front-Back.git
cd AI-Call-Front-Back

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..

# Set up environment variables
cp .env.example .env
cp frontend/.env.example frontend/.env
# Edit both .env files with your actual values

# Start backend (Terminal 1)
npm start

# Start frontend (Terminal 2)
cd frontend
npm run dev
```

### Option 2: Separate Deployment (Recommended for Production)

Deploy backend and frontend to different platforms for optimal performance:

#### Backend → Render
```bash
# Backend will be deployed from root directory
# Render will run: npm install && npm start
```

#### Frontend → Vercel
```bash
# Frontend will be deployed from /frontend directory
# Vercel will auto-detect Vite configuration
```

## 🔧 Environment Variables

### Backend (.env)
```env
GEMINI_API_KEY=your_gemini_api_key_here
NODE_ENV=production
PORT=3000
```

### Frontend (frontend/.env)
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_API_URL=https://your-backend-url.onrender.com
VITE_APP_NAME=AI Call Center
```

## 🚀 Deployment Options

### Option A: Separate Deployment (Recommended)

**Backend to Render:**
1. Connect this repository to Render
2. Set build command: `npm install`
3. Set start command: `npm start`
4. Set environment variables
5. Deploy

**Frontend to Vercel:**
1. Connect this repository to Vercel
2. Set root directory to `frontend`
3. Vercel auto-detects Vite configuration
4. Set environment variables
5. Deploy

### Option B: Full Stack on Single Platform

**Deploy to Render (Full Stack):**
1. Modify `package.json` to build frontend
2. Serve frontend from Express server
3. Single deployment with both services

## 📊 Features

### Backend Features
- **Twilio Integration**: WebSocket handling for phone calls
- **Gemini Live API**: Real-time AI conversation
- **Audio Processing**: Format conversion and streaming
- **Health Monitoring**: Status endpoints and logging
- **CORS Configuration**: Secure cross-origin requests

### Frontend Features
- **Real-time Dashboard**: Live call monitoring
- **User Authentication**: Supabase Auth integration
- **Call Analytics**: Comprehensive reporting
- **Settings Management**: API key configuration
- **Responsive Design**: Mobile-friendly interface

## 🔒 Security

- **Environment Variables**: Secure API key storage
- **CORS Protection**: Configured for production
- **Supabase RLS**: Row-level security policies
- **Input Validation**: Sanitized user inputs
- **Encrypted Storage**: Secure API key encryption

## 🛠 Development

### Backend Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev  # or npm start

# Backend runs on http://localhost:3000
```

### Frontend Development
```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Frontend runs on http://localhost:5173
```

### Full Stack Development
```bash
# Terminal 1: Backend
npm start

# Terminal 2: Frontend
cd frontend && npm run dev

# Backend: http://localhost:3000
# Frontend: http://localhost:5173
```

## 📋 Available Scripts

### Root (Backend)
- `npm start` - Start production server
- `npm run dev` - Start development server
- `npm install` - Install backend dependencies

### Frontend
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## 🔧 Configuration

### Supabase Setup
1. Create project at [Supabase](https://supabase.com)
2. Run SQL schema from `frontend/README.md`
3. Configure authentication settings
4. Get project URL and anon key

### Twilio Setup
1. Get Twilio account and phone number
2. Configure webhook URL to your backend
3. Set webhook method to POST
4. Test phone number configuration

### Gemini API Setup
1. Get API key from Google AI Studio
2. Add to backend environment variables
3. Configure model settings if needed

## 🎯 Deployment Strategies

### Strategy 1: Microservices (Recommended)
- **Backend**: Render (Node.js optimized)
- **Frontend**: Vercel (React/Vite optimized)
- **Database**: Supabase (managed PostgreSQL)
- **Benefits**: Optimal performance, independent scaling

### Strategy 2: Monolith
- **Full Stack**: Single platform (Render/Railway)
- **Database**: Supabase
- **Benefits**: Simpler deployment, single domain

### Strategy 3: Hybrid
- **Backend**: Self-hosted/VPS
- **Frontend**: Vercel/Netlify
- **Database**: Supabase
- **Benefits**: Cost control, flexibility

## 🔍 Monitoring

### Backend Monitoring
- Health check: `GET /health`
- Status endpoint: `GET /status`
- Server logs and error tracking

### Frontend Monitoring
- Browser console for client errors
- Network tab for API issues
- Vercel analytics and logs

## 🆘 Troubleshooting

### Common Issues

1. **CORS Errors**
   - Check backend CORS configuration
   - Verify frontend API URL
   - Ensure both services are running

2. **Authentication Issues**
   - Check Supabase configuration
   - Verify environment variables
   - Review RLS policies

3. **Twilio Connection Issues**
   - Verify webhook URL
   - Check WebSocket connection
   - Ensure backend is accessible

4. **Build Failures**
   - Check Node.js version compatibility
   - Verify all dependencies are installed
   - Review environment variables

### Debug Mode

Enable debug logging:

**Backend:**
```env
NODE_ENV=development
DEBUG=true
```

**Frontend:**
```env
VITE_DEBUG=true
```

## 🔗 Related Repositories

- **Backend Only**: [AI-Call-Backend](https://github.com/diamondgray669/AI-Call-Backend)
- **Frontend Only**: [AI-Call-Frontend](https://github.com/diamondgray669/AI-Call-Frontend)
- **Combined**: [AI-Call-Front-Back](https://github.com/diamondgray669/AI-Call-Front-Back) (this repo)

## 🎉 Quick Deploy Buttons

### Deploy Backend to Render
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/diamondgray669/AI-Call-Front-Back)

### Deploy Frontend to Vercel
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/diamondgray669/AI-Call-Front-Back&project-name=ai-call-frontend&root-directory=frontend)

---

## 🎯 Next Steps

1. **Set up Supabase** - Create database and configure authentication
2. **Deploy Backend** - Use Render or your preferred Node.js platform
3. **Deploy Frontend** - Use Vercel or your preferred static hosting
4. **Configure Twilio** - Set webhook URL to your deployed backend
5. **Test System** - Make a test call to verify everything works

Your AI calling system will be ready for production use! 🚀