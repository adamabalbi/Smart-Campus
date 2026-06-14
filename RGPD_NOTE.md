# Note de conformité RGPD — Smart Campus Platform

Note synthétique sur le traitement des données personnelles dans la plateforme
(à intégrer au mémoire de master). Le RGPD s'applique par analogie ; au Sénégal,
la **loi n° 2008-12 sur la protection des données personnelles (CDP)** est la
référence locale équivalente.

## 1. Inventaire des données personnelles traitées

| Donnée | Modèle / fichier | Catégorie | Sensibilité |
|--------|------------------|-----------|-------------|
| Nom, prénom, email, téléphone | `models/User.js`, `models/Student.js` | Identité / contact | Standard |
| Matricule, filière, niveau, département | `models/Student.js` | Données académiques | Standard |
| Mot de passe (haché bcrypt) | `models/User.js` | Authentifiant | Sensible (jamais en clair) |
| PIN de carte (haché bcrypt) | `models/Card.js` | Authentifiant | Sensible |
| UID carte RFID/NFC + `uidHash` | `models/Card.js` | Identifiant technique | Sensible (clonable) |
| Solde, transactions, recharges, paiements | `models/Wallet.js`, `models/Transaction.js` | Données financières | Sensible |
| **Logs d'accès aux espaces** (qui, où, quand) | `models/AccessLog.js` | **Données de localisation/déplacement** | **Sensible** |
| **Logs NFC** (lectures de carte) | `models/NFCLog.js` | Données de déplacement | Sensible |
| Journal d'audit (actions admin) | `models/AuditLog.js` | Traçabilité | Standard |
| OTP, sessions | `models/OTPVerification.js`, `models/Session.js` | Sécurité | Sensible, éphémère |

## 2. Base légale de chaque traitement

| Traitement | Base légale |
|-----------|-------------|
| Gestion du compte étudiant, carte, scolarité | **Exécution de la mission** de l'établissement (relation étudiant) |
| Portefeuille électronique, paiements | **Exécution du contrat** (service de paiement interne) |
| Contrôle d'accès / logs NFC | **Intérêt légitime** (sécurité des bâtiments et des personnes) |
| Journal d'audit, OTP, sessions | **Obligation de sécurité** (intégrité du SI) |
| Emails (OTP, notifications) | **Exécution du service** |

## 3. Durées de conservation recommandées

| Type de donnée | Durée recommandée | Mécanisme dans le code |
|----------------|-------------------|------------------------|
| Compte, profil étudiant | Durée de la scolarité + archivage légal | Suppression manuelle (cascade `deleteStudent`) |
| Transactions financières | 5–10 ans (obligations comptables) | Conservé (pas de purge auto) |
| **Logs d'accès (`AccessLog`)** | **90 jours** | ✅ Index TTL `expiresAt` |
| **Logs NFC (`NFCLog`)** | **90 jours** | ✅ Index TTL sur `timestamp` |
| OTP | Minutes (expiration) | `expiresAt` |
| Sessions / journal d'audit | À définir (ex. 1 an pour l'audit) | À compléter |

## 4. Droits des étudiants et routes associées

| Droit | État | Route / mécanisme |
|-------|------|-------------------|
| **Accès** (consulter ses données) | ✅ Existant | `GET /api/student-space/me` (profil, carte, wallet, transactions) |
| **Rectification** (corriger) | ⚠️ Partiel | `PATCH /api/student-space/me` (téléphone). Autres champs via l'administration. |
| **Effacement** (suppression) | ⚠️ Admin only | `DELETE /api/students/:id` (cascade User/Card/Wallet/CardApplication). Pas de self-service. |
| **Portabilité** | ❌ À créer | Export structuré (JSON) des données de l'étudiant à prévoir. |
| **Limitation / opposition** | ❌ À créer | Procédure manuelle via l'administration. |

## 5. Points de non-conformité identifiés & recommandations

1. **Pas de route de purge/anonymisation anticipée** des logs.
   → *Recommandation* : créer `DELETE /api/admin/purge-logs` (anonymisation à la
   demande, en complément du TTL automatique).
2. **Pas d'export self-service** (droit à la portabilité).
   → *Recommandation* : endpoint `GET /api/student-space/export` renvoyant un JSON.
3. **UID de carte stocké en clair** (`Card.uid`) en plus du hash.
   → *Recommandation* : migration pour ne conserver que `uidHash` (cf. Axe 4).
4. **Conservation des transactions financières** non bornée dans le code.
   → *Recommandation* : politique d'archivage/anonymisation après la durée légale.
5. **Information des personnes** : aucune mention d'information (politique de
   confidentialité) côté inscription.
   → *Recommandation* : ajouter un lien « Politique de confidentialité » et une
   case de consentement sur le formulaire d'inscription.

## 6. Mesures techniques de protection déjà en place
- Mots de passe et PIN **hachés** (bcrypt), jamais stockés en clair.
- **OTP** (2FA) à la connexion, généré par CSPRNG.
- **JWT** signés, sessions révocables, **rate-limiting** + **verrouillage de compte**.
- **Turnstile** anti-bot sur connexion/inscription.
- **TLS** (HTTPS) en production (Render/Netlify).
- **Journal d'audit** de toutes les actions sensibles.
- **TTL** sur les logs de déplacement (minimisation de la conservation).
