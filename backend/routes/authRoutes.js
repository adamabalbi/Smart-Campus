const express = require("express");
const router = express.Router();

const {
  loginUser,
  verifyOTP,
  logoutUser,
  createUserByAdmin,
  getUsers,
  updateUserStatus,
  updateUserRole,
  deleteUser,
  changePassword,
} = require("../controllers/authController");

const {
  protect,
  authorizeRoles,
} = require("../middleware/authMiddleware");

const {
  validateLogin,
  validateOTP,
  validateUserCreation
} = require("../middleware/validationMiddleware");

const { verifyTurnstile } = require("../middleware/turnstileMiddleware");

router.get("/test", (req, res) => {
  res.json({
    message: "Route authentification fonctionnelle",
  });
});

// Connexion avec OTP (protégée par Turnstile anti-robot)
router.post("/login", verifyTurnstile, validateLogin, loginUser);
router.post("/verify-otp", validateOTP, verifyOTP);
router.post("/logout", protect, logoutUser);
router.patch("/change-password", protect, changePassword);

// Route protégée : profil utilisateur connecté
router.get("/profile", protect, (req, res) => {
  res.json({
    message: "Profil utilisateur récupéré avec succès.",
    user: req.user,
  });
});

// Route protégée réservée à l'administrateur
router.get("/admin-only", protect, authorizeRoles("admin"), (req, res) => {
  res.json({
    message: "Bienvenue administrateur. Accès autorisé.",
  });
});

// Gestion des utilisateurs
router.post(
  "/users",
  protect,
  authorizeRoles("super_admin", "admin"),
  validateUserCreation,
  createUserByAdmin
);

router.get(
  "/users",
  protect,
  authorizeRoles("super_admin", "admin"),
  getUsers
);

router.patch(
  "/users/:userId/status",
  protect,
  authorizeRoles("super_admin", "admin"),
  updateUserStatus
);

router.patch(
  "/users/:userId/role",
  protect,
  authorizeRoles("super_admin", "admin"),
  updateUserRole
);

router.delete(
  "/users/:userId",
  protect,
  authorizeRoles("super_admin", "admin"),
  deleteUser
);

module.exports = router;