const express = require("express");
const router = express.Router();
const { importStudents, exportStudents, syncStatus, webhook } = require("../controllers/integrationController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");

const ADMIN = ["super_admin", "admin"];

// ---- Administration (JWT + rôle admin) ----
router.post("/esp/import-students", protect, authorizeRoles(...ADMIN), importStudents);
router.get("/esp/export-students", protect, authorizeRoles(...ADMIN), exportStudents);
router.get("/esp/sync-status", protect, authorizeRoles(...ADMIN), syncStatus);

// ---- Webhook entrant du SI ESP (authentifié par signature HMAC, pas de JWT) ----
router.post("/esp/webhook", webhook);

module.exports = router;
