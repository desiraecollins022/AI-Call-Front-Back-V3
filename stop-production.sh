#!/bin/bash

echo "🛑 Stopping AI Call Center..."
echo "=============================="

# Stop all PM2 processes
pm2 stop all

# Show final status
echo "📊 Final Status:"
pm2 status

echo ""
echo "✅ AI Call Center stopped successfully!"
echo ""
echo "🔄 To restart: ./start-production.sh"
echo "🗑️  To completely remove: pm2 delete all && pm2 kill"