require('dotenv').config();

const app = require('./src/app');
const { connectDatabase } = require('./src/config/database');

const PORT = process.env.PORT || 4500;

async function start() {
  try {
    await connectDatabase();
    app.listen(PORT, () => {
      console.log(`[Growth Engine] Server running on port ${PORT}`);
      console.log(`[Growth Engine] Health: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('[Growth Engine] Failed to start:', err.message);
    process.exit(1);
  }
}

// ── Graceful Shutdown ────────────────────────────────────────
process.on('SIGINT', async () => {
  console.log('\n[Growth Engine] Shutting down gracefully…');
  const { disconnectDatabase } = require('./src/config/database');
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  const { disconnectDatabase } = require('./src/config/database');
  await disconnectDatabase();
  process.exit(0);
});

start();
