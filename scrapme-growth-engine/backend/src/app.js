const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const errorHandler = require('./middleware/errorHandler');

// ── Routes ───────────────────────────────────────────────────
const healthRoutes = require('./routes/healthRoutes');
const customerRoutes = require('./routes/customerRoutes');
const eventRoutes = require('./routes/eventRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const automationRoutes = require('./routes/automationRoutes');
const messageLogRoutes = require('./routes/messageLogRoutes');
const integrationRoutes = require('./routes/integrationRoutes');

// ── App ──────────────────────────────────────────────────────
const app = express();

// ── Global Middleware ────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging (skip in test to keep output clean)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('short'));
}

// ── API Routes ───────────────────────────────────────────────
app.use('/api/health', healthRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/automations', automationRoutes);
app.use('/api/message-logs', messageLogRoutes);
app.use('/api/integrations', integrationRoutes);

// ── 404 Handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ── Centralized Error Handler ────────────────────────────────
app.use(errorHandler);

module.exports = app;
