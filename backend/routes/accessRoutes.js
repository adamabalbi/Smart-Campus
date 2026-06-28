const express = require("express");
const router = express.Router();
const {
  checkAccess,
  checkAccessMulti,
  getSpaces,
  updateSpaceStatus,
  updateSpaceRules,
  getAccessLogs,
  getOccupancy,
  resetOccupancy,
} = require("../controllers/accessController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");
const { validateAccess } = require("../middleware/validationMiddleware");

// Vérification d'accès (agent de sécurité — via scan NFC)
router.post("/check", validateAccess, checkAccess);

// Vérification d'accès multi-niveaux (département + niveau + horaire + capacité + PIN)
router.post("/check-multi", validateAccess, checkAccessMulti);

// Occupation temps réel de tous les espaces (agent sécurité / admin)
router.get(
  "/occupancy",
  protect,
  authorizeRoles("super_admin", "admin", "security_agent"),
  getOccupancy
);

// Réinitialiser l'occupation d'un espace (agent sécurité / admin)
router.post(
  "/occupancy/:key/reset",
  protect,
  authorizeRoles("super_admin", "admin", "security_agent"),
  resetOccupancy
);

// Liste des espaces (public : page agent + admin)
router.get("/spaces", getSpaces);

// Activer / désactiver un espace (admin)
router.patch(
  "/spaces/:key/status",
  protect,
  authorizeRoles("super_admin", "admin"),
  updateSpaceStatus
);

// Modifier les règles d'un espace (admin)
router.patch(
  "/spaces/:key",
  protect,
  authorizeRoles("super_admin", "admin"),
  updateSpaceRules
);

// Historique des accès (agent sécurité / admin)
router.get(
  "/logs",
  protect,
  authorizeRoles("super_admin", "admin", "security_agent"),
  getAccessLogs
);

module.exports = router;
