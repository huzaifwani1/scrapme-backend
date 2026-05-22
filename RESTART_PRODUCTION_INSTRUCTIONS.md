# Restart Production Backend - Pricing Update Fix

## Problem Confirmed
The production backend at `https://scrapme-backend.onrender.com` is still using OLD pricing:
- **32GB**: ₹300 (should be ₹250)
- **64GB**: ₹500 (should be ₹450)  
- **128GB**: ₹700 (should be ₹600)

Test order created at `2026-05-06T14:15:55Z` shows:
- Order ID: `69fb4d1beb2d01eb00bfe48d`
- Storage: 32GB
- Price: ₹300 (OLD)
- PriceNum: 300 (OLD)

## Root Cause
The code changes in `backend/src/controllers/requestController.js` are correct, but the production server hasn't been restarted to load the updated code. Node.js servers keep code in memory until restarted.

## Solution: Restart Render Service

### Option 1: Manual Restart via Render Dashboard
1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Navigate to your `scrapme-backend` service
3. Click on "Manual Deploy" in the top right
4. Select "Clear build cache & deploy"
5. Wait for deployment to complete (2-3 minutes)

### Option 2: Redeploy via Git (if connected)
If your Render service is connected to GitHub:
1. Push any small change to trigger redeploy:
   ```bash
   git add backend/src/controllers/requestController.js
   git commit -m "chore: trigger redeploy for pricing update"
   git push origin main
   ```
2. Render will automatically redeploy

### Option 3: Use Render CLI (if configured)
```bash
# Install Render CLI
npm install -g render-cli

# Restart service
render services restart scrapme-backend
```

## Verification Steps After Restart

1. **Test new order creation**:
   ```bash
   # Run the production test
   cd /Users/gadgetzone/Desktop/scrapme/backend
   node ../test_production_backend.js
   ```
   Should show: `✅ PRODUCTION backend is using NEW prices!`

2. **Check admin panel**:
   - Create a new 32GB order via frontend
   - Verify admin panel shows ₹250 (not ₹300)
   - Create a new 128GB order, verify shows ₹600 (not ₹700)

3. **Verify old orders unchanged**:
   - Historical orders should still show original prices
   - No data modification occurs

## Technical Details

### Files Updated (Already Correct)
- [`backend/src/controllers/requestController.js:4`](backend/src/controllers/requestController.js:4)
  ```javascript
  const PRICES = { '32GB': 250, '64GB': 450, '128GB': 600, '256GB': 1200, '512GB': 1500, '1TB': 2400 };
  ```
- [`app.js:424`](app.js:424) - Frontend pricing map

### Database Schema
- `price`: String (formatted, e.g., "₹250") - used by admin panel
- `priceNum`: Number (250) - numeric value
- Both fields updated simultaneously for new orders

### Admin Panel Display
- Uses `r.price` (formatted string) from database
- Correctly displays whatever is stored in database
- No code changes needed in admin panel

## Expected Outcome After Restart
- **NEW orders**: Receive updated prices (32GB→250, 64GB→450, 128GB→600)
- **OLD orders**: Retain original prices (no data modification)
- **Admin panel**: Shows correct prices for new orders immediately

## Troubleshooting
If restart doesn't work:
1. Check Render deployment logs for errors
2. Verify `requestController.js` file content on Render
3. Clear browser cache for admin panel
4. Test with incognito window

## Quick Test Script
Run this to verify production backend status:
```bash
cd /Users/gadgetzone/Desktop/scrapme/backend
node ../test_production_backend.js
```

Expected output after successful restart:
```
✅ PRODUCTION backend is using NEW prices!