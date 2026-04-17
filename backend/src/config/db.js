const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  // If a real MongoDB URI is configured, use it
  if (uri && uri !== 'mongodb://localhost:27017/scrapme') {
    try {
      await mongoose.connect(uri);
      console.log('✅ MongoDB connected (persistent)');
      return;
    } catch (err) {
      console.error('❌ MongoDB connection failed:', err.message);
      console.error('   Falling back to in-memory database...');
    }
  }

  // Try local MongoDB
  try {
    await mongoose.connect('mongodb://localhost:27017/scrapme', { serverSelectionTimeoutMS: 3000 });
    console.log('✅ MongoDB connected (local)');
    return;
  } catch {
    // Local MongoDB not available either
  }

  // Fallback: in-memory MongoDB
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    console.log('⚠️  MongoDB connected (in-memory — data will reset on restart)');
    console.log('   → Set MONGO_URI in .env to a MongoDB Atlas URI for persistent data');
  } catch (err) {
    console.error('❌ All MongoDB options failed:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
