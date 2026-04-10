const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const connectDB = require('./src/config/db');
const { errorHandler, notFound } = require('./src/middleware/errorHandler');
const {
  generalLimiter,
  authLimiter,
  adminLoginLimiter,
  passwordResetLimiter
} = require('./src/middleware/rateLimit');

connectDB();

const app = express();

// TEMPORARY CORS configuration for debugging - allow all origins
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// Apply general rate limiting to all API routes
app.use('/api', generalLimiter);

// Serve frontend static files from project root
app.use(express.static(path.join(__dirname, '..')));

// API Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/requests', require('./src/routes/requests'));
app.use('/api/admin', require('./src/routes/admin'));

// 404 handler for API routes
app.use('/api/*', notFound);

// Fallback: serve index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Error handler (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Scrapme running at http://localhost:${PORT}`);
});
