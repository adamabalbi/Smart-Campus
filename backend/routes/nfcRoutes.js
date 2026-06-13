const express = require("express");
const router = express.Router();

const {
  authenticateByCard,
  validatePinWithCard,
  rechargeByNFC,
  payByNFC,
  getReadersStatus
} = require("../controllers/nfcController");

const { protect, authorizeRoles } = require("../middleware/authMiddleware");
const { validatePayment, validateNfcRecharge } = require("../middleware/validationMiddleware");

// ---- Routes publiques pour kiosques ----

// Test de connectivité NFC
router.get("/test", (req, res) => {
  res.json({
    message: "Service NFC opérationnel",
    timestamp: new Date().toISOString()
  });
});

// Authentification par carte NFC (kiosque)
router.post("/auth", authenticateByCard);

// Validation PIN avec carte NFC
router.post("/validate-pin", validatePinWithCard);

// Recharge via NFC (kiosque autonome)
router.post("/recharge", validateNfcRecharge, rechargeByNFC);

// Paiement d'un service interne via NFC (cantine, bibliothèque, imprimerie)
router.post("/pay", validatePayment, payByNFC);

// ---- Routes protégées pour administration ----

// Statut des lecteurs connectés
router.get("/readers/status",
  protect,
  authorizeRoles("super_admin", "admin", "payment_agent"),
  getReadersStatus
);

// Historique des logs NFC (avec pagination)
router.get("/logs",
  protect,
  authorizeRoles("super_admin", "admin"),
  async (req, res) => {
    try {
      const NFCLog = require("../models/NFCLog");
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const skip = (page - 1) * limit;

      const filter = {};

      // Filtres optionnels
      if (req.query.action) filter.action = req.query.action;
      if (req.query.success !== undefined) filter.success = req.query.success === 'true';
      if (req.query.deviceId) filter.deviceId = req.query.deviceId;

      // Filtre par période
      if (req.query.startDate || req.query.endDate) {
        filter.timestamp = {};
        if (req.query.startDate) filter.timestamp.$gte = new Date(req.query.startDate);
        if (req.query.endDate) filter.timestamp.$lte = new Date(req.query.endDate);
      }

      const logs = await NFCLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit);

      const total = await NFCLog.countDocuments(filter);

      res.json({
        success: true,
        data: {
          logs,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error) {
      console.error("Erreur récupération logs NFC:", error);
      res.status(500).json({
        message: "Erreur serveur lors de la récupération des logs"
      });
    }
  }
);

// Statistiques NFC
router.get("/stats",
  protect,
  authorizeRoles("super_admin", "admin"),
  async (req, res) => {
    try {
      const NFCLog = require("../models/NFCLog");
      const Card = require("../models/Card");

      const timeWindow = req.query.period === 'day' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      const since = new Date(Date.now() - timeWindow);

      // Statistiques générales
      const totalCards = await Card.countDocuments({ nfcEnabled: true });
      const activeCards = await Card.countDocuments({
        nfcEnabled: true,
        status: 'active',
        lastNfcRead: { $gte: since }
      });

      // Statistiques d'activité
      const activityStats = await NFCLog.aggregate([
        {
          $match: { timestamp: { $gte: since } }
        },
        {
          $group: {
            _id: {
              action: "$action",
              success: "$success"
            },
            count: { $sum: 1 }
          }
        }
      ]);

      // Statistiques par lecteur
      const readerStats = await NFCLog.aggregate([
        {
          $match: { timestamp: { $gte: since } }
        },
        {
          $group: {
            _id: "$deviceId",
            totalReads: { $sum: 1 },
            successfulReads: {
              $sum: { $cond: [{ $eq: ["$success", true] }, 1, 0] }
            },
            lastActivity: { $max: "$timestamp" }
          }
        }
      ]);

      // Activité suspecte
      const suspiciousActivity = await NFCLog.getSuspiciousActivity(timeWindow);

      res.json({
        success: true,
        data: {
          overview: {
            totalCards,
            activeCards,
            period: req.query.period || 'week'
          },
          activity: activityStats,
          readers: readerStats,
          security: {
            suspiciousActivity: suspiciousActivity.length,
            details: suspiciousActivity.slice(0, 10) // Top 10
          }
        }
      });

    } catch (error) {
      console.error("Erreur statistiques NFC:", error);
      res.status(500).json({
        message: "Erreur serveur lors du calcul des statistiques"
      });
    }
  }
);

// Gestion des cartes NFC
router.get("/cards",
  protect,
  authorizeRoles("super_admin", "admin"),
  async (req, res) => {
    try {
      const Card = require("../models/Card");

      const filter = { nfcEnabled: true };
      if (req.query.status) filter.status = req.query.status;

      const cards = await Card.find(filter)
        .populate('studentId', 'matricule nom prenom')
        .select('-uid -uidHash -pinHash') // Sécurité : exclure données sensibles
        .sort({ lastNfcRead: -1 });

      res.json({
        success: true,
        data: { cards }
      });

    } catch (error) {
      console.error("Erreur récupération cartes NFC:", error);
      res.status(500).json({
        message: "Erreur serveur lors de la récupération des cartes"
      });
    }
  }
);

// Activer/désactiver NFC sur une carte
router.patch("/cards/:cardId/nfc",
  protect,
  authorizeRoles("super_admin", "admin"),
  async (req, res) => {
    try {
      const { enabled } = req.body;
      const Card = require("../models/Card");

      const card = await Card.findById(req.params.cardId);
      if (!card) {
        return res.status(404).json({
          message: "Carte non trouvée"
        });
      }

      card.nfcEnabled = enabled;
      if (!enabled) {
        card.pinValidated = false; // Reset validation si désactivation
      }
      await card.save();

      res.json({
        success: true,
        message: `NFC ${enabled ? 'activé' : 'désactivé'} pour la carte`,
        data: { cardId: card._id, nfcEnabled: card.nfcEnabled }
      });

    } catch (error) {
      console.error("Erreur modification NFC carte:", error);
      res.status(500).json({
        message: "Erreur serveur lors de la modification"
      });
    }
  }
);

// Reset des échecs NFC d'une carte
router.post("/cards/:cardId/reset-failures",
  protect,
  authorizeRoles("super_admin", "admin"),
  async (req, res) => {
    try {
      const Card = require("../models/Card");

      const card = await Card.findById(req.params.cardId);
      if (!card) {
        return res.status(404).json({
          message: "Carte non trouvée"
        });
      }

      card.nfcFailures = 0;
      card.pinAttempts = 0;
      card.pinBlockedUntil = null;
      await card.save();

      res.json({
        success: true,
        message: "Échecs NFC réinitialisés",
        data: { cardId: card._id }
      });

    } catch (error) {
      console.error("Erreur reset échecs NFC:", error);
      res.status(500).json({
        message: "Erreur serveur lors de la réinitialisation"
      });
    }
  }
);

module.exports = router;