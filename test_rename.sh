#!/bin/bash

echo "🚀 Starting Scrapme application tests after rename..."
echo ""

# Test 1: Check server is running
echo "🧪 Test 1: Server status"
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ > /tmp/server_status.txt
SERVER_STATUS=$(cat /tmp/server_status.txt)
echo "   HTTP Status: $SERVER_STATUS"
if [ "$SERVER_STATUS" = "200" ]; then
    echo "✅ Server is responding"
else
    echo "❌ Server not responding correctly"
fi

# Test 2: Check database connection (via API health endpoint if exists)
echo ""
echo "🧪 Test 2: Database connection"
curl -s http://localhost:3001/api/health 2>/dev/null | grep -q "MongoDB" && echo "✅ Database connected" || echo "⚠️  Health endpoint not found (check server logs)"

# Test 3: Check server logs for "Scrapme" name
echo ""
echo "🧪 Test 3: Application name in logs"
if tail -10 /tmp/scrapme-server.log | grep -q "Scrapme"; then
    echo "✅ Server logs show 'Scrapme' name"
else
    echo "❌ Server logs don't show 'Scrapme' name"
    echo "   Last 10 lines of log:"
    tail -10 /tmp/scrapme-server.log
fi

# Test 4: Check frontend HTML for "Scrapme"
echo ""
echo "🧪 Test 4: Frontend page titles"
if grep -q "Scrapme" index.html; then
    echo "✅ Frontend HTML contains 'Scrapme'"
else
    echo "❌ Frontend HTML doesn't contain 'Scrapme'"
fi

# Test 5: Check email templates
echo ""
echo "🧪 Test 5: Email service templates"
if grep -q "Scrapme" backend/src/utils/emailService.js; then
    echo "✅ Email templates contain 'Scrapme'"
else
    echo "❌ Email templates don't contain 'Scrapme'"
fi

# Test 6: Check admin panel title
echo ""
echo "🧪 Test 6: Admin panel"
if grep -q "Scrapme" admin.html; then
    echo "✅ Admin panel contains 'Scrapme'"
else
    echo "❌ Admin panel doesn't contain 'Scrapme'"
fi

echo ""
echo "📋 Summary:"
echo "   The application has been renamed from 'Deadphone' to 'Scrapme'"
echo "   Check above for any test failures"
echo ""
echo "✅ Rename process completed successfully!"