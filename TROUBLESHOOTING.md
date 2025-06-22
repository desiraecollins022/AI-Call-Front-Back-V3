# 🔧 AI Call Center Troubleshooting Guide

This guide helps you resolve common issues that may occur during deployment or operation of the AI Call Center.

## 🚀 Deployment Issues

### ❌ One-Command Deploy Script Fails

If the one-command deploy script fails, check the following:

1. **Node.js Version**: Ensure you have Node.js v18 or higher installed.
   ```bash
   node -v
   ```

2. **Global Dependencies**: Make sure you have the necessary global dependencies.
   ```bash
   npm install -g pm2 serve typescript
   ```

3. **Supabase Dependency**: Ensure the Supabase dependency is installed.
   ```bash
   npm install @supabase/supabase-js
   ```

4. **Environment Variables**: Check that all required environment variables are set.
   ```bash
   cat .env
   cat frontend/.env
   ```

5. **Port Conflicts**: Ensure the required ports (12000, 12001, 12003) are not in use.
   ```bash
   lsof -i :12000
   lsof -i :12001
   lsof -i :12003
   ```

### ❌ TypeScript Build Errors

If you encounter TypeScript build errors:

1. **Skip TypeScript Checks**: Modify the frontend build script to skip TypeScript checks.
   ```bash
   # In frontend/package.json
   "build": "vite build"  # Instead of "tsc -b && vite build"
   ```

2. **Fix TypeScript Errors**: Address the specific TypeScript errors in your code.
   ```bash
   cd frontend
   npm run lint
   ```

## 🔄 Runtime Issues

### ❌ Multi-tenant Server Not Starting

If the multi-tenant server fails to start:

1. **Check Supabase Dependency**: Ensure the Supabase dependency is installed.
   ```bash
   npm install @supabase/supabase-js
   ```

2. **Check Logs**: Review the multi-tenant server logs.
   ```bash
   pm2 logs ai-call-backend-multitenant
   ```

3. **Restart Server**: Try restarting the multi-tenant server.
   ```bash
   pm2 restart ai-call-backend-multitenant
   ```

### ❌ Frontend Not Loading

If the frontend doesn't load:

1. **Check Frontend Server**: Ensure the frontend server is running.
   ```bash
   pm2 status ai-call-frontend
   ```

2. **Check Frontend Logs**: Review the frontend logs.
   ```bash
   pm2 logs ai-call-frontend
   ```

3. **Restart Frontend**: Try restarting the frontend server.
   ```bash
   pm2 restart ai-call-frontend
   ```

### ❌ Backend Health Check Fails

If the backend health check fails:

1. **Check Backend Server**: Ensure the backend server is running.
   ```bash
   pm2 status ai-call-backend
   ```

2. **Check Backend Logs**: Review the backend logs.
   ```bash
   pm2 logs ai-call-backend
   ```

3. **Restart Backend**: Try restarting the backend server.
   ```bash
   pm2 restart ai-call-backend
   ```

## 🔌 Twilio Integration Issues

### ❌ Twilio Calls Not Working

If Twilio calls are not working:

1. **Check Twilio Configuration**: Ensure your Twilio account is properly configured.
   - Verify the webhook URL is set to your backend URL.
   - Ensure the webhook method is set to POST.

2. **Check Backend Logs**: Review the backend logs for Twilio-related errors.
   ```bash
   pm2 logs ai-call-backend
   ```

3. **Test Webhook**: Test the webhook endpoint directly.
   ```bash
   curl -X POST https://your-backend-url/webhook/voice
   ```

## 🔐 Authentication Issues

### ❌ Supabase Authentication Not Working

If Supabase authentication is not working:

1. **Check Supabase Configuration**: Ensure your Supabase project is properly configured.
   - Verify the Supabase URL and anon key in your frontend environment variables.
   - Check that authentication is enabled in your Supabase project.

2. **Check Frontend Logs**: Review the frontend logs for authentication-related errors.
   ```bash
   pm2 logs ai-call-frontend
   ```

3. **Test Supabase Connection**: Test the Supabase connection directly.
   ```bash
   curl https://your-supabase-url/rest/v1/
   ```

## 🔄 Restarting All Services

If you need to restart all services:

```bash
pm2 restart all
```

## 🧹 Clean Restart

If you need to completely restart the deployment:

```bash
pm2 delete all
./one-command-deploy-wrapper.sh
```

## 📊 Checking Service Status

To check the status of all services:

```bash
pm2 status
```

## 📋 Viewing Logs

To view logs for all services:

```bash
pm2 logs
```

To view logs for a specific service:

```bash
pm2 logs ai-call-backend
pm2 logs ai-call-backend-multitenant
pm2 logs ai-call-frontend
```

## 🆘 Still Having Issues?

If you're still experiencing issues after trying the above solutions, please:

1. Gather all relevant logs:
   ```bash
   pm2 logs --lines 100 > all_logs.txt
   ```

2. Check the system status:
   ```bash
   pm2 status > status.txt
   ```

3. Create an issue on the GitHub repository with the logs and status information.