const express = require("express");
const router  = express.Router();

const {
  submitRegistration,
  verifyEmail,
  getRegistrations,
  approveRegistration,
  rejectRegistration,
} = require("../controllers/registrationController");

const { protect, authorizeRoles } = require("../middleware/authMiddleware");
const { verifyTurnstile } = require("../middleware/turnstileMiddleware");

// Routes publiques (inscription protégée par Turnstile anti-robot)
router.post("/",                       verifyTurnstile, submitRegistration);
router.get("/verify-email/:token",     verifyEmail);

// Routes protégées (admin + super_admin)
router.get(
  "/",
  protect,
  authorizeRoles("super_admin", "admin"),
  getRegistrations
);

router.patch(
  "/:id/approve",
  protect,
  authorizeRoles("super_admin", "admin"),
  approveRegistration
);

router.patch(
  "/:id/reject",
  protect,
  authorizeRoles("super_admin", "admin"),
  rejectRegistration
);

module.exports = router;
