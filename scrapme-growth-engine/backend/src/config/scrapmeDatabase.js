const mongoose = require('mongoose');

let connection;

function rejectSourceWrite(next) {
  next(Object.assign(new Error('ScrapMe source connection is read-only'), { code: 'SOURCE_READ_ONLY' }));
}

function applyReadOnlyGuards(conn) {
  // Defence in depth: production credentials must have MongoDB's read role,
  // while Mongoose write APIs are rejected even if credentials are mis-scoped.
  conn.plugin((schema) => {
    schema.pre('save', rejectSourceWrite);
    schema.pre('insertMany', rejectSourceWrite);
    schema.pre(['update', 'updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'], rejectSourceWrite);
  });
}

/**
 * A deliberately separate connection to ScrapMe's transaction database.
 * This module exports source models used exclusively with find/lean calls.
 * MongoDB permissions must also grant this URI a read-only database role.
 */
async function connectScrapmeDatabase() {
  if (connection && connection.readyState === 1) return connection;

  const uri = process.env.SCRAPME_MONGO_URI;
  if (!uri) throw new Error('SCRAPME_MONGO_URI environment variable is not set');

  connection = mongoose.createConnection(uri, {
    readPreference: 'secondaryPreferred',
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
  applyReadOnlyGuards(connection);
  await connection.asPromise();
  return connection;
}

async function disconnectScrapmeDatabase() {
  if (connection) await connection.close();
  connection = undefined;
}

module.exports = { connectScrapmeDatabase, disconnectScrapmeDatabase, applyReadOnlyGuards };
