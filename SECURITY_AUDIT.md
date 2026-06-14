# Audit & durcissement sécurité — Smart Campus Platform (v2)
### Master Sécurité des Systèmes d'Information

Audit du backend `smart-campus-platform/backend/`. Chaque axe documente le
constat, le risque, la référence (CWE/OWASP) et le statut après correction.

## Synthèse

| Axe | Fichier(s) | Constat | Risque | Réf. (CWE / OWASP) | Priorité | Statut |
|-----|-----------|---------|--------|--------------------|----------|--------|
| 1 | `utils/generateOTP.js` | OTP généré avec `Math.random()` (PRNG non cryptographique) | OTP prédictible → contournement de la 2FA | CWE-338 / OWASP A02 (Crypto Failures), ASVS 2.1 | **Critique** | ✅ Corrigé |
| 2 | `controllers/walletController.js`, `cardController.js`, `studentSpaceController.js` (+ tous les controllers) | Logs DEBUG exposant UID, PIN hash, email agent, solde ; `console.error` directs | Fuite d'infos sensibles en production, exposition PII | CWE-532 / OWASP A09 (Logging Failures) | **Élevé** | ✅ Corrigé |
| 3 | `controllers/authController.js`, `models/User.js` | Pas de verrouillage de compte après N échecs (rate-limit par IP seulement) | Force-brute distribuée (multi-IP) sur un même compte | CWE-307 / OWASP A07 (Auth Failures), ASVS 2.2 | **Élevé** | ✅ Corrigé |
| 4 | `models/Card.js`, `controllers/walletController.js` | Recherche carte par UID **en clair** (`Card.findOne({ uid })`) au lieu du hash | Contournement du mécanisme de hash ; UID en clair clonable | CWE-312 / OWASP A02 | **Élevé** | ✅ Corrigé (recherche via `uidHash`) |
| 5 | `controllers/walletController.js`, `nfcController.js`, `studentSpaceController.js` | `Transaction.create` puis `wallet.save` non atomiques | Incohérence financière si crash entre les deux étapes ; double-débit possible | CWE-362 / OWASP A04 (Insecure Design) | **Élevé** | ✅ Corrigé (recharges agent/borne) · ⚠️ Partiel (voir notes) |
| 6 | `middleware/turnstileMiddleware.js` | Vérification Turnstile **fail-open** en cas d'erreur | Désactivation silencieuse de l'anti-bot si Cloudflare indispo | CWE-636 (Not Failing Securely) | **Moyen** | ✅ Corrigé (`TURNSTILE_STRICT_MODE`) |
| 7 | `models/AccessLog.js`, `models/NFCLog.js` | Pas de politique de conservation des données de déplacement | Non-conformité RGPD (données de localisation) | OWASP A04 / RGPD art. 5.1.e | **Moyen** | ✅ Corrigé (TTL 90 j) |
| 8 | `middleware/validationMiddleware.js`, `controllers/authController.js` | `min:1` au login ; pas de complexité au changement ; coût bcrypt figé | Mots de passe faibles acceptés ; hachage non ajustable | CWE-521 / OWASP A07, ASVS 2.1 | **Moyen** | ✅ Corrigé |
| 9 | `backend/server.js` | `helmet({contentSecurityPolicy:false})` puis CSP réactivé par route | Incohérence possible de la CSP selon l'ordre des routes | CWE-693 / OWASP A05 (Misconfiguration) | **Moyen** | ✅ Corrigé (CSP globale unique) |
| 10 | `controllers/accessController.js`, `models/AccessSpace.js` | `checkAccess` sans device de confiance → énumération possible par un agent | Cartographie des accès d'autres étudiants | CWE-639 / OWASP A01 (Broken Access Control) | **Moyen** | 📝 Documenté (non corrigé) |

---

## Détail par axe

### Axe 1 — OTP cryptographiquement sûr ✅
`generateOTP.js` utilise désormais `crypto.randomInt(100000, 1000000)` (CSPRNG)
au lieu de `Math.random()`. L'OTP n'est plus prédictible.

### Axe 2 — Journalisation sécurisée ✅
- Suppression de **17** `console.log` DEBUG dans `walletController.js` (exposaient
  UID, PIN hash, email agent, solde).
- Remplacement de **tous** les `console.error`/`console.warn` des controllers par
  `secureLogger.logError` (qui masque la stack en production).
- Vérification : `grep -rn "console.log\|console.error" backend/controllers/` → **aucun résultat**.

### Axe 3 — Verrouillage de compte ✅
- `models/User.js` : ajout de `loginAttempts` et `lockedUntil`.
- `loginUser()` : après 5 échecs, verrouillage 30 min (HTTP 423) ; compteur
  remis à zéro en cas de succès. Complète le rate-limit par IP (protège contre
  le force-brute distribué par compte).

### Axe 4 — Recherche par hash de l'UID ✅
`walletController` (`getWalletByCardUID`, `rechargeByAgent`, `rechargeByKiosk`)
recherche désormais via `uidHash` (SHA-256) au lieu de l'UID en clair.
**Suite recommandée (migration)** : supprimer le champ `uid` en clair de
`Card.js` une fois toutes les lectures basculées sur `uidHash`.

### Axe 5 — Atomicité des transactions ✅ / ⚠️
- **Corrigé** : `rechargeByAgent` et `rechargeByKiosk` utilisent une **session
  MongoDB** (`session.withTransaction`) ; la transaction passe de `pending` à
  `validated` uniquement si `wallet.save` réussit dans la même transaction.
  (MongoDB Atlas est un replica set → transactions supportées.)
- **À compléter** : appliquer le même pattern à `nfcController.payByNFC` /
  `rechargeByNFC` et aux paiements de `studentSpaceController`. **Idempotence** :
  un champ `idempotencyKey` (unique) côté `Transaction` + clé fournie par le
  client reste à câbler pour rejeter les rejeux (nécessite une évolution front).

### Axe 6 — Turnstile fail-secure ✅
En cas d'erreur d'appel à Cloudflare, si `TURNSTILE_STRICT_MODE=true` (recommandé
en prod), la requête est refusée (503) au lieu de passer.

### Axe 7 — Conservation RGPD ✅
- `NFCLog` : TTL 90 jours déjà présent (index `expireAfterSeconds`).
- `AccessLog` : ajout de `expiresAt` (now + 90 j) avec index TTL.
- Voir `RGPD_NOTE.md`. **Suite** : route admin de purge/anonymisation anticipée.

### Axe 8 — Politique de mot de passe ✅
- `validateLogin` : `min:1` → `min:8`, `max:128`.
- `changePassword()` : complexité requise (majuscule, minuscule, chiffre, spécial).
- Coût bcrypt configurable via `BCRYPT_ROUNDS` (défaut 10) — appliqué aux hachages
  de `authController`, `registrationController`, `studentController`.

### Axe 9 — CSP cohérente ✅
Suppression du double appel helmet : une **seule** configuration `helmet({
contentSecurityPolicy: { directives } })` globale. Les pages servies par Express
(`/kiosk-v2`, `/verify-email`) n'ont aucun script inline (`script-src 'self'`).

### Axe 10 — Confiance des lecteurs (énumération) 📝 Documenté
**Constat** : `POST /api/access/check` est protégé par JWT + rôle, mais ne vérifie
pas que le lecteur appelant est un device enregistré. Un agent légitime pourrait
tester des UID et cartographier les accès.
**Recommandation** (non implémentée — impact fonctionnel à valider) :
1. Champ `readerToken` (clé API par lecteur) dans `AccessSpace.js`, vérifié dans
   `checkAccess` en plus du JWT ; **ou**
2. Liste `registeredReaders` (IP/token autorisés) dans `Settings`.
**Risque résiduel** : Moyen — limité par l'authentification + rôle + le
rate-limiting, mais l'énumération par un compte agent compromis reste possible.

---

## Variables d'environnement ajoutées
Voir `backend/.env.example` : `BCRYPT_ROUNDS`, `TURNSTILE_STRICT_MODE`.
En production (Render) : `TURNSTILE_STRICT_MODE=true` recommandé.
