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
const segmentationRoutes = require('./routes/segmentationRoutes');
const automationExecutionRoutes = require('./routes/automationExecutionRoutes');
const templateRoutes = require('./routes/templateRoutes');
const preferenceRoutes = require('./routes/preferenceRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const messageIntentRoutes = require('./routes/messageIntentRoutes');

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
app.use('/api/segments', segmentationRoutes);
app.use('/api/automation-executions', automationExecutionRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/preferences', preferenceRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/message-intents', messageIntentRoutes);

// ── 404 Handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ── Centralized Error Handler ────────────────────────────────
app.use(errorHandler);

module.exports = app;
