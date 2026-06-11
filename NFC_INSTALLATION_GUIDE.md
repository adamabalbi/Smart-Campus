# 📱 Guide d'Installation NFC - ACR122U-A9

## 📋 Prérequis

### Matériel
- ✅ Lecteur ACR122U-A9 (déjà configuré)
- ✅ 3 cartes NFC/MIFARE
- 🔌 Port USB disponible
- 💻 PC sous Windows/macOS/Linux

### Logiciels
- Node.js 18+ 
- Drivers ACR122U (normalement auto-installés)

---

## 🔧 Installation

### 1. Installation des dépendances NFC

```bash
cd backend
npm install nfc-pcsc node-hid serialport ws
```

### 2. Configuration de l'environnement

Ajoutez dans votre fichier `.env` :

```env
# Service NFC
ENABLE_NFC=true
NFC_READER_TIMEOUT=5000
NFC_MAX_RETRIES=3

# Sécurité NFC  
NFC_RATE_LIMIT=30
NFC_PIN_ATTEMPTS=3
NFC_SESSION_TIMEOUT=300
```

### 3. Vérification du lecteur

```bash
# Test de connexion
node -e "console.log(require('nfc-pcsc'))"

# Si erreur, installer les drivers manuellement
```

### 4. Configuration des cartes

```javascript
// Script de configuration d'une carte
const crypto = require('crypto');

// Générer l'UID hash pour une carte
function generateCardConfig(uid) {
  return {
    uid: uid,
    uidHash: crypto.createHash('sha256').update(uid).digest('hex'),
    nfcEnabled: true,
    type: "MIFARE_CLASSIC_1K"
  };
}
```

---

## 🚀 Démarrage

### 1. Lancer le serveur avec NFC

```bash
cd backend
ENABLE_NFC=true npm start
```

### 2. Vérification du service

```bash
# Test API
curl http://localhost:5000/api/nfc/test

# Statut lecteurs
curl http://localhost:5000/api/nfc/readers/status
```

### 3. Interface kiosque

Ouvrez : `http://localhost:5000/frontend/kiosk-nfc.html`

---

## 🛠️ Configuration Avancée

### Mapping des cartes physiques

1. **Lire l'UID d'une carte :**

```bash
# Script de lecture d'UID
node scripts/read-card-uid.js
```

2. **Ajouter en base de données :**

```javascript
// Dans MongoDB
db.cards.insertOne({
  studentId: ObjectId("..."),
  uid: "1234567890ABCDEF",
  uidHash: "a1b2c3...",
  cardNumber: "CARD-001", 
  nfcEnabled: true,
  pinHash: "$2b$10$...", // PIN haché
  status: "active"
});
```

### Permissions et sécurité

```javascript
// Middleware de sécurité kiosque
const kioskSecurity = {
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // 100 requêtes par IP
  },
  pinAttempts: 3,
  blockDuration: 15 // minutes
};
```

---

## 🔍 Tests et Débogage

### 1. Test des cartes

```bash
# Mode développement avec logs détaillés
DEBUG=nfc* npm start
```

### 2. Simulation pour développement

```javascript
// Simuler une carte pour tests
POST http://localhost:5000/api/nfc/auth
Content-Type: application/json

{
  "uid": "1234567890ABCDEF",
  "readerId": "test-reader"
}
```

### 3. Monitoring

```javascript
// Dashboard NFC en temps réel
http://localhost:5000/frontend/dashboard.html#nfc-stats
```

---

## 📊 Utilisation en Production

### 1. Déploiement sécurisé

- 🔐 HTTPS obligatoire
- 🛡️ Firewall pour isoler le kiosque
- 📝 Logging complet activé
- 🔄 Backup automatique des logs

### 2. Surveillance

- 📈 Métriques d'utilisation
- 🚨 Alertes sur échecs répétés
- 💾 Archivage des logs (90 jours)

### 3. Maintenance

```bash
# Nettoyage des logs
node scripts/cleanup-nfc-logs.js --days=30

# Statistiques d'usage
node scripts/nfc-usage-report.js --month=11
```

---

## ⚠️ Dépannage

### Erreurs communes

| Erreur | Cause | Solution |
|--------|-------|----------|
| `Reader not found` | Lecteur non connecté | Vérifier USB/drivers |
| `Card read timeout` | Carte mal positionnée | Repositionner la carte |
| `Permission denied` | Droits insuffisants | `sudo` ou groupe dialout |
| `Service unavailable` | Service NFC arrêté | Redémarrer le serveur |

### Logs utiles

```bash
# Logs du service NFC
tail -f logs/nfc-service.log

# Logs des transactions
tail -f logs/transactions.log

# Erreurs système
dmesg | grep -i usb
```

---

## 🔧 Scripts Utiles

### 1. Configuration d'une nouvelle carte

```bash
# Créer le script
cat > scripts/setup-new-card.js << 'EOF'
const mongoose = require('mongoose');
const Card = require('../models/Card');
const bcrypt = require('bcryptjs');

async function setupCard(studentId, uid, pin) {
  const card = new Card({
    studentId: studentId,
    uid: uid,
    cardNumber: `CARD-${Date.now()}`,
    pinHash: bcrypt.hashSync(pin, 10),
    nfcEnabled: true,
    status: 'active'
  });
  
  await card.save();
  console.log('Carte configurée:', card._id);
}
EOF

# Utilisation
node scripts/setup-new-card.js STUDENT_ID UID PIN
```

### 2. Test de performance

```bash
# Script de test de charge
node scripts/nfc-load-test.js --cards=10 --transactions=100
```

---

## 📞 Support

En cas de problème :

1. 📋 Vérifier les logs : `/logs/nfc-*.log`
2. 🔧 Tester la connectivité : `/api/nfc/test`
3. 📊 Consulter les statistiques : `/api/nfc/stats`
4. 🆘 Contacter le support avec les détails d'erreur

---

## 🎯 Fonctionnalités Disponibles

- ✅ **Authentification NFC** : Lecture automatique des cartes
- ✅ **Validation PIN** : Sécurité double facteur  
- ✅ **Recharge kiosque** : Interface tactile intuitive
- ✅ **Audit complet** : Logs de toutes les interactions
- ✅ **Surveillance temps réel** : Dashboard admin
- ✅ **Gestion des échecs** : Blocage automatique des cartes
- ✅ **Mode hors ligne** : Fonctionnement en autonomie
- ✅ **API REST** : Intégration avec autres systèmes