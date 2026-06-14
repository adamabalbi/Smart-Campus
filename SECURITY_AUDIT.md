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
| 4 | `models/Card.js`, `controllers/walletController.js`, `cardController.js` | Recherche carte par UID **en clair** + UID stocké en clair | Contournement du hash ; UID clonable ; fuite si base compromise | CWE-312 / OWASP A02 | **Élevé** | ✅ Corrigé + **migration faite** (champ `uid` retiré de la base) |
| 5 | `controllers/walletController.js`, `nfcController.js` | `Transaction.create` puis `wallet.save` non atomiques | Incohérence financière si crash entre les deux étapes ; double-débit possible | CWE-362 / OWASP A04 (Insecure Design) | **Élevé** | ✅ Corrigé (recharges + paiements NFC atomiques + **idempotence**) |
| 6 | `middleware/turnstileMiddleware.js` | Vérification Turnstile **fail-open** en cas d'erreur | Désactivation silencieuse de l'anti-bot si Cloudflare indispo | CWE-636 (Not Failing Securely) | **Moyen** | ✅ Corrigé (`TURNSTILE_STRICT_MODE`) |
| 7 | `models/AccessLog.js`, `models/NFCLog.js` | Pas de politique de conservation des données de déplacement | Non-conformité RGPD (données de localisation) | OWASP A04 / RGPD art. 5.1.e | **Moyen** | ✅ Corrigé (TTL 90 j) |
| 8 | `middleware/validationMiddleware.js`, `controllers/authController.js` | `min:1` au login ; pas de complexité au changement ; coût bcrypt figé | Mots de passe faibles acceptés ; hachage non ajustable | CWE-521 / OWASP A07, ASVS 2.1 | **Moyen** | ✅ Corrigé |
| 9 | `backend/server.js` | `helmet({contentSecurityPolicy:false})` puis CSP réactivé par route | Incohérence possible de la CSP selon l'ordre des routes | CWE-693 / OWASP A05 (Misconfiguration) | **Moyen** | ✅ Corrigé (CSP globale unique) |
| 10 | `controllers/accessController.js`, `models/AccessSpace.js` | `checkAccess` sans device de confiance → énumération possible par un agent | Cartographie des accès d'autres étudiants | CWE-639 / OWASP A01 (Broken Access Control) | **Moyen** | ✅ Corrigé (`readerToken` optionnel par espace) |

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

### Axe 4 — Recherche par hash de l'UID + migration ✅
- Toutes les lectures (`walletController`, `cardController`, `nfcController`,
  `accessController`) utilisent `uidHash` (SHA-256).
- **Migration effectuée** : le champ `uid` en clair a été **retiré du modèle
  `Card.js`** (remplacé par un *virtual setter* qui calcule `uidHash` sans
  stocker l'UID), l'index `uid_1` a été supprimé, et le champ `uid` a été
  `$unset` de tous les documents `cards` existants. L'UID n'est plus exposé
  dans les réponses API ni l'interface (dashboard/étudiant).

### Axe 5 — Atomicité + idempotence ✅
- **Sessions MongoDB** (`session.withTransaction`) sur `rechargeByAgent`,
  `rechargeByKiosk`, **`payByNFC` et `rechargeByNFC`** : la transaction passe de
  `pending` à `validated` uniquement si `wallet.save` réussit dans la même
  transaction atomique (Atlas = replica set → transactions supportées).
- **Idempotence** : champ `idempotencyKey` (index unique sparse) sur
  `Transaction`. Le frontend (kiosque, paiement de service) génère une clé
  (`crypto.randomUUID`) par opération ; si une transaction avec cette clé existe
  déjà, le backend renvoie l'existante **sans re-débiter** (anti double-débit /
  rejeu). Validé par test : 2 appels même clé → 1 seul débit.

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

### Axe 10 — Confiance des lecteurs (énumération) ✅
- Champ **`readerToken`** ajouté à `AccessSpace.js` (configurable par l'admin via
  `PATCH /api/access/spaces/:key`).
- Dans `checkAccess` : si un espace a un `readerToken` configuré, la requête doit
  le fournir (en-tête `X-Reader-Token` ou champ `readerToken`), sinon **401**.
- **Rétrocompatible** : les espaces sans `readerToken` ne sont pas affectés
  (la protection s'active espace par espace, à la configuration d'un jeton).
**Mise en service** : l'admin définit un `readerToken` par espace, puis chaque
terminal/lecteur de cet espace envoie ce jeton. Tant qu'aucun jeton n'est défini,
le comportement actuel (JWT + rôle + rate-limit) reste inchangé.

---

## Variables d'environnement ajoutées
Voir `backend/.env.example` : `BCRYPT_ROUNDS`, `TURNSTILE_STRICT_MODE`.
En production (Render) : `TURNSTILE_STRICT_MODE=true` recommandé.
