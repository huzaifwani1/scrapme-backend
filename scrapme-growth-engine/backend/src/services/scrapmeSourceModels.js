const { Schema } = require('mongoose');

// Read projections of the actual ScrapMe source schemas. Raw Mongoose models
// remain private to this module; callers receive only a frozen `find` façade.
// Together with a read-only MongoDB role, this prevents sync code from issuing
// writes to the ScrapMe connection by accident.
function getScrapmeSourceModels(connection) {
  const User = connection.models.User || connection.model('User', new Schema({
    name: String, email: String, phone: String,
  }, { timestamps: true, strict: false }));

  const Request = connection.models.Request || connection.model('Request', new Schema({
    userId: Schema.Types.ObjectId, userEmail: String, status: String, phone: String,
    influencerId: Schema.Types.ObjectId, referralCode: String,
  }, { timestamps: true, strict: false }));

  const PickupOrder = connection.models.PickupOrder || connection.model('PickupOrder', new Schema({
    orderId: String, requestId: Schema.Types.ObjectId, status: String, finalPrice: Number,
    startedAt: Date, pickedUpAt: Date, completedAt: Date,
  }, { timestamps: true, strict: false }));

  const asReadOnly = (model) => Object.freeze({
    find(filter = {}) {
      return model.find(filter).lean();
    },
  });

  return Object.freeze({
    User: asReadOnly(User),
    Request: asReadOnly(Request),
    PickupOrder: asReadOnly(PickupOrder),
  });
}

module.exports = { getScrapmeSourceModels };
