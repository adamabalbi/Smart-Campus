const bcrypt = require("bcryptjs");
const { logError } = require("../utils/secureLogger");
const jwt = require("jsonwebtoken");
const generateTempPassword = require("../utils/generateTempPassword");

const User = require("../models/User");
const OTPVerification = require("../models/OTPVerification");
const Session = require("../models/Session");

// Coût bcrypt configurable sans redéploiement (Render env). Défaut 10.
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "10", 10);

const generateOTP = require("../utils/generateOTP");
const sendEmail = require("../utils/sendEmail");
const { getSettings } = require("../utils/getSettings");
const { logAudit } = require("../services/auditService");

// Fonction pour créer un token JWT
const generateToken = async (userId, role) => {
  const s = await getSettings();
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: `${s.session.jwtExpiryHours}h` }
  );
};

// 1. Connexion : email + mot de passe puis envoi OTP
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email et mot de passe obligatoires.",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      await logAudit({ req, action: "login_failed", targetType: "User", description: `Tentative de connexion — email inconnu : ${email}`, status: "failure" });
      return res.status(401).json({
        message: "Email ou mot de passe incorrect.",
      });
    }

    if (user.status !== "active") {
      await logAudit({ req, actor: user, action: "login_failed", targetType: "User", targetId: user._id, description: `Connexion refusée — compte ${user.status} (${email})`, status: "failure" });
      return res.status(403).json({
        message: "Compte bloqué ou désactivé.",
      });
    }

    // Verrouillage temporaire après trop d'échecs (anti force-brute par compte)
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil - new Date()) / 60000);
      await logAudit({ req, actor: user, action: "login_failed", targetType: "User", targetId: user._id, description: `Connexion refusée — compte verrouillé (${email})`, status: "failure" });
      return res.status(423).json({
        message: `Compte temporairement verrouillé suite à trop de tentatives. Réessayez dans ${minutes} minute(s).`,
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      const MAX_ATTEMPTS = 5;
      const LOCK_MINUTES = 30;
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      let locked = false;
      if (user.loginAttempts >= MAX_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
        user.loginAttempts = 0;
        locked = true;
      }
      await user.save();
      await logAudit({ req, actor: user, action: "login_failed", targetType: "User", targetId: user._id, description: `Mot de passe incorrect (${email})${locked ? " — compte verrouillé 30 min" : ""}`, status: "failure" });
      if (locked) {
        return res.status(423).json({
          message: "Trop de tentatives échouées. Compte verrouillé pendant 30 minutes.",
        });
      }
      return res.status(401).json({
        message: "Email ou mot de passe incorrect.",
      });
    }

    // Succès : réinitialiser le compteur de tentatives
    if (user.loginAttempts !== 0 || user.lockedUntil) {
      user.loginAttempts = 0;
      user.lockedUntil = null;
      await user.save();
    }

    const otpCode = generateOTP();

    const s = await getSettings();
    const expiresAt = new Date(Date.now() + s.otp.expiryMinutes * 60 * 1000);

    await OTPVerification.create({
      userId: user._id,
      email: user.email,
      otpCode,
      status: "pending",
      attempts: 0,
      expiresAt,
    });

    await sendEmail({
      to: user.email,
      subject: "Code de vérification Smart Campus",
      text: `Votre code OTP est : ${otpCode}. Ce code expire dans 5 minutes.`,
    });

    return res.status(200).json({
      message: "Identifiants valides. Un code OTP a été envoyé par email.",
      userId: user._id,
      email: user.email,
      otpRequired: true,
    });
  } catch (error) {
    logError("Erreur loginUser ", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la connexion.",
    });
  }
};

// 3. Vérification OTP
const verifyOTP = async (req, res) => {
  try {
    const { userId, otpCode } = req.body;

    if (!userId || !otpCode) {
      return res.status(400).json({
        message: "userId et code OTP obligatoires.",
      });
    }

    const otpRecord = await OTPVerification.findOne({
      userId,
      status: "pending",
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return res.status(404).json({
        message: "Aucun code OTP valide trouvé.",
      });
    }

    if (otpRecord.expiresAt < new Date()) {
      otpRecord.status = "expired";
      await otpRecord.save();

      return res.status(400).json({
        message: "Code OTP expiré.",
      });
    }

    const s = await getSettings();

    if (otpRecord.attempts >= s.otp.maxAttempts) {
      otpRecord.status = "failed";
      await otpRecord.save();

      return res.status(403).json({
        message: "Nombre maximal de tentatives dépassé.",
      });
    }

    if (otpRecord.otpCode !== otpCode) {
      otpRecord.attempts += 1;
      await otpRecord.save();

      return res.status(401).json({
        message: "Code OTP incorrect.",
        attempts: otpRecord.attempts,
      });
    }

    otpRecord.status = "verified";
    await otpRecord.save();

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "Utilisateur introuvable.",
      });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = await generateToken(user._id, user.role);

    await Session.create({
      userId: user._id,
      token,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      status: "active",
      expiresAt: new Date(Date.now() + s.session.jwtExpiryHours * 60 * 60 * 1000),
    });

    await logAudit({ req, actor: user, action: "login", targetType: "User", targetId: user._id, description: `Connexion réussie (${user.email}, rôle ${user.role})` });

    return res.status(200).json({
      message: "Authentification réussie.",
      token,
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
      }
    });
  } catch (error) {
    logError("Erreur verifyOTP ", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la vérification OTP.",
    });
  }
};

// 4. Déconnexion utilisateur
const logoutUser = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(400).json({
        message: "Aucun token fourni pour la déconnexion.",
      });
    }

    const session = await Session.findOne({ token, status: "active" });

    if (!session) {
      return res.status(404).json({
        message: "Session active introuvable.",
      });
    }

    session.status = "revoked";
    await session.save();

    const sessionUser = await User.findById(session.userId).select("role email");
    await logAudit({ req, actor: sessionUser, action: "logout", targetType: "User", targetId: session.userId, description: `Déconnexion${sessionUser ? ` (${sessionUser.email})` : ""}` });

    return res.status(200).json({
      message: "Déconnexion réussie. Session invalidée.",
    });
  } catch (error) {
    logError("Erreur logoutUser ", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la déconnexion.",
    });
  }
};
// 5. Création d'un utilisateur par l'administrateur avec envoi d'un vrai mail
const createUserByAdmin = async (req, res) => {
  try {
    const { nom, prenom, email, role } = req.body;

    if (!nom || !prenom || !email || !role) {
      return res.status(400).json({
        message: "Veuillez remplir tous les champs obligatoires.",
      });
    }

    const requesterRole = req.user.role;

    const allowedRolesByRequester = {
      super_admin: ["admin", "security_agent", "payment_agent", "librarian", "service_scolarite", "finance_agent", "instructor", "charge_cantine", "charge_imprimerie"],
      admin:       ["security_agent", "payment_agent", "librarian", "service_scolarite", "finance_agent", "instructor", "charge_cantine", "charge_imprimerie"],
    };

    const allowedRoles = allowedRolesByRequester[requesterRole] || [];

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        message: requesterRole === "admin"
          ? "Un admin ne peut créer que des agents. Les étudiants sont gérés dans le module dédié."
          : "Rôle non autorisé.",
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        message: "Cet email est déjà utilisé.",
      });
    }

    // Génération d'un mot de passe temporaire
    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

    const user = await User.create({
      nom,
      prenom,
      email,
      password: hashedPassword,
      role,
      status: "active",
      mustChangePassword: true,
    });

    // Envoi du mail réel à l'utilisateur
    await sendEmail({
      to: user.email,
      subject: "Création de votre compte Smart Campus",
      text: `Bonjour ${prenom} ${nom},

Votre compte Smart Campus a été créé.

Voici vos informations de connexion :

Email : ${email}
Mot de passe temporaire : ${tempPassword}
Rôle : ${role}

Pour des raisons de sécurité, il vous sera demandé de changer ce mot de passe lors de votre première utilisation.

Cordialement,
Plateforme Smart Campus`,
    });

    await logAudit({ req, action: "user_created", targetType: "User", targetId: user._id, description: `Création du compte ${email} (rôle ${role})`, newValue: { nom, prenom, email, role } });

    return res.status(201).json({
      message:
        "Utilisateur créé avec succès par l'administrateur. Un mail de connexion a été envoyé.",
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    logError("Erreur createUserByAdmin ", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la création de l'utilisateur.",
    });
  }
};

// 6. Lister les utilisateurs
const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Liste des utilisateurs récupérée avec succès.",
      count: users.length,
      users,
    });
  } catch (error) {
    logError("Erreur getUsers ", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la récupération des utilisateurs.",
    });
  }
};

// 7. Désactiver ou bloquer un utilisateur
const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;
    const requester = req.user;

    const allowedStatuses = ["active", "blocked", "disabled"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Statut invalide. Valeurs possibles : active, blocked, disabled.",
      });
    }

    const target = await User.findById(userId);

    if (!target) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    if (requester.role === "admin") {
      if (target.role === "super_admin") {
        return res.status(403).json({ message: "Un admin ne peut pas modifier le statut d'un super-admin." });
      }
      if (target.role === "admin") {
        return res.status(403).json({ message: "Un admin ne peut pas modifier le statut d'un autre admin." });
      }
    }

    const oldStatus = target.status;
    target.status = status;
    await target.save();

    await logAudit({ req, action: "user_status_updated", targetType: "User", targetId: target._id, description: `Statut de ${target.email} : ${oldStatus} → ${status}`, oldValue: { status: oldStatus }, newValue: { status } });

    return res.status(200).json({
      message: "Statut utilisateur mis à jour avec succès.",
      user: {
        id: target._id,
        nom: target.nom,
        prenom: target.prenom,
        email: target.email,
        role: target.role,
        status: target.status,
      },
    });
  } catch (error) {
    logError("Erreur updateUserStatus ", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la mise à jour du statut.",
    });
  }
};

// 9. Modifier le rôle d'un utilisateur
const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    const requester = req.user;

    const validRoles = ["admin", "security_agent", "payment_agent", "librarian", "service_scolarite", "charge_cantine", "charge_imprimerie"];

    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Rôle invalide." });
    }

    const target = await User.findById(userId);

    if (!target) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    if (requester.role === "admin") {
      if (target._id.toString() === requester._id.toString()) {
        return res.status(403).json({ message: "Vous ne pouvez pas modifier votre propre rôle." });
      }
      if (["super_admin", "admin"].includes(target.role)) {
        return res.status(403).json({ message: "Un admin ne peut pas modifier le rôle d'un super-admin ou d'un autre admin." });
      }
      const agentRoles = ["security_agent", "payment_agent", "librarian", "service_scolarite", "charge_cantine", "charge_imprimerie"];
      if (!agentRoles.includes(role)) {
        return res.status(403).json({ message: "Un admin ne peut assigner que des rôles d'agent." });
      }
    }

    const oldRole = target.role;
    target.role = role;
    await target.save();

    await logAudit({ req, action: "user_role_updated", targetType: "User", targetId: target._id, description: `Rôle de ${target.email} : ${oldRole} → ${role}`, oldValue: { role: oldRole }, newValue: { role } });

    return res.status(200).json({
      message: "Rôle mis à jour avec succès.",
      user: {
        id: target._id,
        nom: target.nom,
        prenom: target.prenom,
        email: target.email,
        role: target.role,
        status: target.status,
      },
    });
  } catch (error) {
    logError("Erreur updateUserRole ", error);
    return res.status(500).json({ message: "Erreur serveur lors de la mise à jour du rôle." });
  }
};

// 10. Supprimer un utilisateur
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const requester = req.user;

    const target = await User.findById(userId);

    if (!target) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    if (requester.role === "admin" && target.role === "super_admin") {
      return res.status(403).json({ message: "Un admin ne peut pas supprimer un super-admin." });
    }

    if (target._id.toString() === requester._id.toString()) {
      return res.status(403).json({ message: "Vous ne pouvez pas supprimer votre propre compte." });
    }

    await User.findByIdAndDelete(userId);

    await logAudit({ req, action: "user_deleted", targetType: "User", targetId: userId, description: `Suppression du compte ${target.email} (rôle ${target.role})`, oldValue: { nom: target.nom, prenom: target.prenom, email: target.email, role: target.role } });

    return res.status(200).json({ message: "Utilisateur supprimé avec succès." });
  } catch (error) {
    logError("Erreur deleteUser ", error);
    return res.status(500).json({ message: "Erreur serveur lors de la suppression." });
  }
};

// 8. Changer le mot de passe utilisateur connecté
const changePassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        message: "Ancien mot de passe et nouveau mot de passe obligatoires.",
      });
    }

    const s = await getSettings();
    if (newPassword.length < s.password.minLength) {
      return res.status(400).json({
        message: `Le nouveau mot de passe doit contenir au moins ${s.password.minLength} caractères.`,
      });
    }

    // Politique de complexité : au moins 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial
    const complexity = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
    if (!complexity.test(newPassword)) {
      return res.status(400).json({
        message: "Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial.",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "Utilisateur introuvable.",
      });
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);

    if (!isOldPasswordValid) {
      return res.status(401).json({
        message: "Ancien mot de passe incorrect.",
      });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    user.password = hashedNewPassword;
    user.mustChangePassword = false;
    await user.save();

    await logAudit({ req, action: "password_changed", targetType: "User", targetId: user._id, description: `Changement de mot de passe (${user.email})` });

    return res.status(200).json({
      message: "Mot de passe changé avec succès.",
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    logError("Erreur changePassword ", error);
    return res.status(500).json({
      message: "Erreur serveur lors du changement de mot de passe.",
    });
  }
};

module.exports = {
  loginUser,
  verifyOTP,
  logoutUser,
  createUserByAdmin,
  getUsers,
  updateUserStatus,
  updateUserRole,
  deleteUser,
  changePassword,
};