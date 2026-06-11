const mongoose = require("mongoose");

const nfcLogSchema = new mongoose.Schema(
  {
    cardUid: {
      type: String,
      required: true,
      index: true // Hash de l'UID pour recherche
    },
    action: {
      type: String,
      enum: ["read", "auth", "pin_validation", "recharge", "payment"],
      required: true,
      index: true
    },
    success: {
      type: Boolean,
      required: true,
      index: true
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    deviceId: {
      type: String, // ID du lecteur NFC
      default: null,
      index: true
    },
    location: {
      type: String, // Point de lecture (kiosque, agent, etc.)
      default: null
    },
    errorCode: {
      type: String, // Code d'erreur si échec
      default: null
    },
    metadata: {
      // Données additionnelles contextuelles
      amount: Number,
      newBalance: Number,
      transactionId: mongoose.Schema.Types.ObjectId,
      ipAddress: String,
      userAgent: String,
      sessionId: String,
      retryCount: Number,
      processingTime: Number // en ms
    },
    severity: {
      type: String,
      enum: ["info", "warning", "error", "critical"],
      default: function() {
        if (!this.success) {
          return this.action === 'auth' ? 'warning' : 'error';
        }
        return 'info';
      }
    }
  },
  {
    timestamps: false // On utilise timestamp custom
  }
);

// Index composé pour les requêtes fréquentes
nfcLogSchema.index({ cardUid: 1, timestamp: -1 });
nfcLogSchema.index({ deviceId: 1, timestamp: -1 });
nfcLogSchema.index({ action: 1, success: 1, timestamp: -1 });
nfcLogSchema.index({ timestamp: -1 }); // Pour purge automatique

// Index TTL pour purge automatique des logs (90 jours)
nfcLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

// Méthodes statiques utiles
nfcLogSchema.statics.getFailureCount = function(cardUid, action, timeWindow = 3600000) {
  const since = new Date(Date.now() - timeWindow);
  return this.countDocuments({
    cardUid: cardUid,
    action: action,
    success: false,
    timestamp: { $gte: since }
  });
};

nfcLogSchema.statics.getDeviceActivity = function(deviceId, timeWindow = 3600000) {
  const since = new Date(Date.now() - timeWindow);
  return this.aggregate([
    {
      $match: {
        deviceId: deviceId,
        timestamp: { $gte: since }
      }
    },
    {
      $group: {
        _id: "$action",
        total: { $sum: 1 },
        successful: {
          $sum: { $cond: [{ $eq: ["$success", true] }, 1, 0] }
        },
        failed: {
          $sum: { $cond: [{ $eq: ["$success", false] }, 1, 0] }
        }
      }
    }
  ]);
};

nfcLogSchema.statics.getSuspiciousActivity = function(timeWindow = 3600000) {
  const since = new Date(Date.now() - timeWindow);
  return this.aggregate([
    {
      $match: {
        timestamp: { $gte: since },
        success: false
      }
    },
    {
      $group: {
        _id: {
          cardUid: "$cardUid",
          deviceId: "$deviceId"
        },
        failureCount: { $sum: 1 },
        actions: { $addToSet: "$action" },
        lastFailure: { $max: "$timestamp" }
      }
    },
    {
      $match: {
        failureCount: { $gte: 3 } // 3+ échecs = suspect
      }
    },
    {
      $sort: { failureCount: -1, lastFailure: -1 }
    }
  ]);
};

// Middleware pour logging automatique
nfcLogSchema.post('save', function(doc) {
  if (!doc.success && doc.action === 'auth') {
    console.warn(`🚨 Échec authentification NFC: ${doc.cardUid} sur ${doc.deviceId}`);
  }
});

module.exports = mongoose.model("NFCLog", nfcLogSchema, "nfc_logs");