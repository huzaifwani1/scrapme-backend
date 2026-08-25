const mongoose = require('mongoose');

/**
 * Connect to MongoDB.
 * Uses MONGODB_URI from environment — must NEVER be the production ScrapMe database.
 */
async function connectDatabase() {
  const uri = process.env.GROWTH_ENGINE_MONGO_URI || process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('GROWTH_ENGINE_MONGO_URI environment variable is not set');
  }

  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    console.log('[Growth Engine] MongoDB connected');
  });

  mongoose.connection.on('error', (err) => {
    console.error('[Growth Engine] MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.log('[Growth Engine] MongoDB disconnected');
  });

  await mongoose.connect(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  return mongoose.connection;
}

/**
 * Gracefully close the database connection.
 */
async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase };
