const express = require("express");
const router  = express.Router();

const { getStats }                 = require("../controllers/statsController");
const { protect, authorizeRoles }  = require("../middleware/authMiddleware");

router.get("/", protect, authorizeRoles("super_admin", "admin"), getStats);

module.exports = router;
