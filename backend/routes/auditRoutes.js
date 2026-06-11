const express = require("express");
const router  = express.Router();

const { getAuditLogs, getAuditActions } = require("../controllers/auditController");
const { protect, authorizeRoles }       = require("../middleware/authMiddleware");

router.get("/",        protect, authorizeRoles("super_admin", "admin"), getAuditLogs);
router.get("/actions", protect, authorizeRoles("super_admin", "admin"), getAuditActions);

module.exports = router;
