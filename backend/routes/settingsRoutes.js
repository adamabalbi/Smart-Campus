const express = require("express");
const router  = express.Router();

const { getSettings, updateSettings } = require("../controllers/settingsController");
const { protect, authorizeRoles }     = require("../middleware/authMiddleware");

router.get("/",   protect, authorizeRoles("super_admin"), getSettings);
router.patch("/", protect, authorizeRoles("super_admin"), updateSettings);

module.exports = router;
