const express = require("express");
const router = express.Router();
const {
  getMyFees,
  getStudentFees,
  upsertFee,
  pay,
  payInstallment,
  getReceipt,
  updateStatus,
  getStats,
  listFees,
} = require("../controllers/scholarshipController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");

// Rôles habilités à gérer la scolarité financière
const FINANCE = ["super_admin", "admin", "finance_agent", "service_scolarite"];

// ---- Routes publiques kiosque/NFC (authentification par carte + PIN) ----
// L'étudiant paie SES propres frais avec sa carte : pas de JWT, la carte+PIN
// font foi (un étudiant ne peut payer que via sa propre carte).
router.post("/pay", pay);
router.post("/pay-installment", payInstallment);

// ---- Étudiant connecté ----
router.get("/my-fees", protect, getMyFees);

// ---- Reçu (propriétaire ou rôle financier) ----
router.get("/receipt/:id", protect, getReceipt);

// ---- Administration / agent financier ----
router.get("/stats", protect, authorizeRoles(...FINANCE), getStats);
router.get("/list", protect, authorizeRoles(...FINANCE), listFees);
router.post("/fees", protect, authorizeRoles(...FINANCE), upsertFee);
router.get("/student/:id", protect, authorizeRoles(...FINANCE), getStudentFees);
router.patch("/:id/status", protect, authorizeRoles(...FINANCE), updateStatus);

module.exports = router;
