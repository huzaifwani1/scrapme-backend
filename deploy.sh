#!/bin/bash

# Scrapme Deployment Script
# This script helps deploy the Scrapme application to production

set -e  # Exit on error

echo "🚀 Scrapme Deployment Script"
echo "============================="

# Check if we're in the right directory
if [ ! -f "backend/server.js" ]; then
    echo "❌ Error: Must run from project root directory"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version)
echo "✓ Node.js version: $NODE_VERSION"

# Check if .env.production exists
if [ ! -f "backend/.env.production" ]; then
    echo "⚠️  Warning: backend/.env.production not found"
    echo "Creating from template..."
    cp backend/.env.production.example backend/.env.production
    echo "⚠️  Please edit backend/.env.production with your production values before deployment!"
    exit 1
fi

# Install dependencies
echo "📦 Installing backend dependencies..."
cd backend
npm ci --only=production

# Set production environment
export NODE_ENV=production

# Start the server with PM2 (if available) or node
echo "🔄 Starting production server..."
if command -v pm2 &> /dev/null; then
    echo "✓ PM2 detected - using PM2 for process management"
    pm2 delete scrapme-backend 2>/dev/null || true
    pm2 start server.js --name scrapme-backend --time
    pm2 save
    echo "✅ Application started with PM2"
    echo "📊 Check status: pm2 status scrapme-backend"
    echo "📋 View logs: pm2 logs scrapme-backend"
else
    echo "⚠️  PM2 not installed - starting with node (not recommended for production)"
    echo "💡 Install PM2: npm install -g pm2"
    nohup node server.js > scrapme-production.log 2>&1 &
    echo $! > scrapme.pid
    echo "✅ Application started (PID: $(cat scrapme.pid))"
    echo "📋 View logs: tail -f scrapme-production.log"
fi

cd ..

echo ""
echo "🎉 Deployment completed!"
echo ""
echo "📋 Next steps:"
echo "1. Configure your reverse proxy (Nginx/Apache) to point to port 3001"
echo "2. Set up SSL certificates (Let's Encrypt)"
echo "3. Configure domain DNS to point to your server"
echo "4. Monitor application logs for any issues"
echo ""
echo "🔗 Frontend URL: http://localhost:3001 (or your domain)"
echo "🔗 Admin panel: http://localhost:3001/admin.html"
echo ""
echo "⚠️  IMPORTANT: Change default admin credentials before making the site public!"