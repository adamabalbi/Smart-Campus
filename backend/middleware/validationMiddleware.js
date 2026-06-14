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
    .withMessage('Email invalide')
    .trim(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Mot de passe invalide (8 caractères minimum)')
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

// Recharge via borne/agent : le PIN est fourni dans la requête
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

// Recharge NFC (kiosque) : le PIN a déjà été validé à une étape précédente,
// donc il n'est pas transmis ici — on valide uniquement l'UID et le montant.
const validateNfcRecharge = [
  body('uid')
    .isLength({ min: 4, max: 32 })
    .isAlphanumeric()
    .withMessage('UID de carte invalide'),
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
    .withMessage('Email invalide')
    .trim()
    .isLength({ max: 100 }),
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
  validateNfcRecharge,
  validateUserCreation,
  validateAccess,
  handleValidationErrors
};