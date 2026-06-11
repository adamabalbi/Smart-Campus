const { body, validationResult } = require("express-validator");

// Middleware pour vérifier les erreurs de validation
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "Données invalides",
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// Validations pour l'authentification
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email invalide'),
  body('password')
    .isLength({ min: 1 })
    .withMessage('Mot de passe requis')
    .isLength({ max: 128 })
    .withMessage('Mot de passe trop long'),
  handleValidationErrors
];

const validateOTP = [
  body('userId')
    .isMongoId()
    .withMessage('ID utilisateur invalide'),
  body('otpCode')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Code OTP invalide (6 chiffres requis)'),
  handleValidationErrors
];

// Validations pour les transactions financières
const validatePayment = [
  body('uid')
    .isLength({ min: 4, max: 32 })
    .isAlphanumeric()
    .withMessage('UID de carte invalide'),
  body('pin')
    .isLength({ min: 4, max: 6 })
    .isNumeric()
    .withMessage('PIN invalide (4-6 chiffres)'),
  body('amount')
    .isFloat({ min: 1, max: 1000000 })
    .withMessage('Montant invalide (1-1000000)'),
  body('service')
    .optional()
    .isLength({ max: 50 })
    .isAlpha('fr-FR', { ignore: '_-' })
    .withMessage('Service invalide'),
  handleValidationErrors
];

const validateRecharge = [
  body('uid')
    .isLength({ min: 4, max: 32 })
    .isAlphanumeric()
    .withMessage('UID de carte invalide'),
  body('pin')
    .isLength({ min: 4, max: 6 })
    .isNumeric()
    .withMessage('PIN invalide (4-6 chiffres)'),
  body('amount')
    .isFloat({ min: 100, max: 500000 })
    .withMessage('Montant de recharge invalide (100-500000)'),
  handleValidationErrors
];

// Validations pour la création de comptes
const validateUserCreation = [
  body('nom')
    .isLength({ min: 2, max: 50 })
    .matches(/^[a-zA-ZÀ-ÿ\s-']+$/)
    .withMessage('Nom invalide (2-50 caractères, lettres uniquement)'),
  body('prenom')
    .isLength({ min: 2, max: 50 })
    .matches(/^[a-zA-ZÀ-ÿ\s-']+$/)
    .withMessage('Prénom invalide (2-50 caractères, lettres uniquement)'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 100 })
    .withMessage('Email invalide'),
  body('role')
    .isIn(['admin', 'security_agent', 'payment_agent', 'librarian', 'service_scolarite', 'charge_cantine', 'charge_imprimerie'])
    .withMessage('Rôle invalide'),
  handleValidationErrors
];

const validateAccess = [
  body('uid')
    .isLength({ min: 4, max: 32 })
    .isAlphanumeric()
    .withMessage('UID de carte invalide'),
  body('spaceKey')
    .isLength({ min: 2, max: 50 })
    .isAlphanumeric('en-US', { ignore: '_-' })
    .withMessage('Clé d\'espace invalide'),
  handleValidationErrors
];

module.exports = {
  validateLogin,
  validateOTP,
  validatePayment,
  validateRecharge,
  validateUserCreation,
  validateAccess,
  handleValidationErrors
};