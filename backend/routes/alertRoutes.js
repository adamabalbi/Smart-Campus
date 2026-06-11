const express = require("express");
const router = express.Router();
const Alert = require("../models/Alert");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");
const { logAudit } = require("../services/auditService");

// Liste des alertes (admin)
router.get(
  "/",
  protect,
  authorizeRoles("super_admin", "admin"),
  async (req, res) => {
    try {
      const { status, page = 1, limit = 50 } = req.query;
      const filter = {};
      if (status) filter.status = status;

      const alerts = await Alert.find(filter)
        .populate("studentId", "nom prenom matricule")
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Alert.countDocuments(filter);
      const newCount = await Alert.countDocuments({ status: "new" });

      const formatted = alerts.map((a) => ({
        ...a.toObject(),
        studentName: a.studentId ? `${a.studentId.prenom} ${a.studentId.nom}` : "—",
        studentMatricule: a.studentId ? a.studentId.matricule : "—",
      }));

      return res.json({
        alerts: formatted,
        newCount,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error("Erreur liste alertes:", error);
      return res.status(500).json({ message: "Erreur serveur." });
    }
  }
);

// Mettre à jour le statut d'une alerte (admin)
router.patch(
  "/:id/status",
  protect,
  authorizeRoles("super_admin", "admin"),
  async (req, res) => {
    try {
      const { status } = req.body;
      if (!["new", "reviewed", "dismissed"].includes(status)) {
        return res.status(400).json({ message: "Statut invalide." });
      }
      const previous = await Alert.findById(req.params.id);
      if (!previous) return res.status(404).json({ message: "Alerte introuvable." });
      const alert = await Alert.findByIdAndUpdate(req.params.id, { status }, { new: true });

      await logAudit({ req, action: "alert_status_updated", targetType: "Alert", targetId: alert._id, description: `Alerte ${alert._id} : ${previous.status} → ${status}`, oldValue: { status: previous.status }, newValue: { status } });

      return res.json({ message: "Alerte mise à jour.", alert });
    } catch (error) {
      return res.status(500).json({ message: "Erreur serveur." });
    }
  }
);

module.exports = router;
