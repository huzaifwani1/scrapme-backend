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

// Configure CORS to allow requests from frontend
const corsOptions = {
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Set CORS origin based on environment
if (process.env.NODE_ENV === 'production') {
  // In production, allow specific domains
  const allowedOrigins = [
    'https://scrapme.in',
    'https://www.scrapme.in',
    'http://localhost:8080',
    'http://localhost:3001',
    'http://localhost:5000'
  ];

  // Also allow frontend URL from environment variable if set
  if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
  }

  corsOptions.origin = function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  };
} else {
  // In development, allow localhost origins
  corsOptions.origin = ['http://localhost:8080', 'http://localhost:3001', 'http://localhost:5000'];
}

app.use(cors(corsOptions));
app.use(express.json());

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
