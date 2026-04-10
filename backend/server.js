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

// Configure CORS with whitelist approach for both development and production
const corsOptions = {
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Define allowed origins - always include local development URLs
const allowedOrigins = [
  'http://localhost:8080',
  'http://localhost:3001',
  'http://localhost:5000'
];

// Add production frontend URL from environment variable if it exists
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

// Add any additional production domains based on environment
if (process.env.NODE_ENV === 'production') {
  // Optionally add hardcoded production domains if needed
  // Example: allowedOrigins.push('https://yourdomain.com');
  // But we rely on FRONTEND_URL environment variable for flexibility
}

// Custom origin validation function
corsOptions.origin = function (origin, callback) {
  // Allow requests with no origin (e.g., mobile apps, curl, Postman)
  if (!origin) return callback(null, true);

  // Check if the origin is in the allowed list
  if (allowedOrigins.includes(origin)) {
    callback(null, true);
  } else {
    console.warn(`CORS blocked origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  }
};

app.use(cors(corsOptions));
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
