const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Session = require("../models/Session");

// Vérifie si l'utilisateur est connecté avec un token valide
const protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        message: "Accès refusé. Aucun token fourni.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const session = await Session.findOne({ token, status: "active" });

    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({
        message: "Session expirée ou révoquée. Veuillez vous reconnecter.",
      });
    }

    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.status(401).json({
        message: "Utilisateur introuvable.",
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        message: "Compte bloqué ou désactivé.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Token invalide ou expiré.",
    });
  }
};

// Vérifie si l'utilisateur a le bon rôle
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Utilisateur non authentifié.",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Accès interdit. Rôle insuffisant.",
      });
    }

    next();
  };
};

module.exports = {
  protect,
  authorizeRoles,
};