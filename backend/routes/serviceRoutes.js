const express = require("express");
const router = express.Router();
const Service = require("../models/Service");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");

// Liste des services (public — utilisé par les pages de service et l'admin)
// On ne renvoie que les documents valides (avec une clé définie).
router.get("/", async (req, res) => {
  try {
    const services = await Service.find({ key: { $exists: true, $ne: null } })
      .sort({ label: 1 });
    return res.json({ services });
  } catch (error) {
    console.error("Erreur liste services:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
});

// État d'un service précis (public — vérification au chargement d'une page)
router.get("/:key", async (req, res) => {
  try {
    const svc = await Service.findOne({ key: req.params.key });
    if (!svc) return res.status(404).json({ message: "Service introuvable." });
    return res.json({ service: svc });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
});

// Activer / désactiver un service (admin / super_admin)
router.patch(
  "/:key/status",
  protect,
  authorizeRoles("super_admin", "admin"),
  async (req, res) => {
    try {
      const { status } = req.body;
      if (!["active", "inactive"].includes(status)) {
        return res.status(400).json({ message: "Statut invalide (active ou inactive)." });
      }
      const svc = await Service.findOneAndUpdate(
        { key: req.params.key },
        { status },
        { new: true }
      );
      if (!svc) return res.status(404).json({ message: "Service introuvable." });
      return res.json({
        message: `Service ${svc.label} ${status === "active" ? "activé" : "désactivé"}.`,
        service: svc,
      });
    } catch (error) {
      console.error("Erreur maj statut service:", error);
      return res.status(500).json({ message: "Erreur serveur." });
    }
  }
);

module.exports = router;
