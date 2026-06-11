# Plan d'Intégration NFC - Smart Campus Platform

## Bibliothèques Requises

### Backend Node.js
```bash
npm install nfc-pcsc
npm install node-hid
npm install serialport
```

### Frontend (Optionnel - Web NFC)
```bash
# Pour les navigateurs supportant Web NFC API
# Pas besoin d'installation, API native
```

## Architecture d'Intégration

### 1. Service NFC Local (Node.js)
- **Rôle**: Interface entre le lecteur ACR122U et l'API
- **Port**: 3001 (séparé du serveur principal)
- **Communication**: WebSocket ou HTTP

### 2. Modifications Backend
- Nouveaux endpoints pour la validation NFC
- Middleware de sécurité pour les opérations NFC
- Logs d'audit pour les interactions cartes

### 3. Interface Kiosque Améliorée
- Détection automatique de carte
- Feedback visuel en temps réel
- Mode hors ligne avec synchronisation

## Sécurité NFC

### Mesures à Implémenter
1. **Chiffrement UID**: Hasher les UID de cartes en base
2. **Token temporaire**: Session limitée après lecture
3. **Rate limiting**: Limite de tentatives par minute
4. **Audit trail**: Log toutes les interactions NFC
5. **Validation PIN**: Double facteur après lecture NFC

## Structure des Données

### Modèle Card (Modifié)
```javascript
{
  uid: String,           // UID chiffré de la carte NFC
  uidHash: String,       // Hash pour validation rapide
  nfcEnabled: Boolean,   // Statut activation NFC
  lastNfcRead: Date,     // Dernière lecture NFC
  nfcFailures: Number,   // Compteur d'échecs
  // ... autres champs existants
}
```

### Log NFC
```javascript
{
  cardUid: String,
  action: String,        // 'read', 'auth', 'payment'
  success: Boolean,
  timestamp: Date,
  deviceId: String,      // ID du lecteur
  location: String,      // Point de lecture (kiosque, agent)
  errorCode: String      // En cas d'erreur
}
```