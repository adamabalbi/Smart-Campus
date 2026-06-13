# Déploiement — Smart Campus Platform

Guide pas à pas pour déployer la plateforme en **architecture hybride** (cloud
gratuit + agent NFC local), imposée par le lecteur **ACR122U** qui exige un
accès matériel USB impossible sur le cloud.

## Architecture cible

```
                          ┌─────────────────────────────┐
                          │   MongoDB Atlas (cloud)      │
                          └──────────────▲──────────────┘
                                         │
   Frontend (Netlify)  ──HTTPS/WSS──►  Backend API + WS (Render)  ──HTTP──►  AI-service (Render, Flask)
   pages statiques                      Node/Express                          détection paiements suspects
        ▲                                    ▲
        │ navigateur                         │ HTTPS POST /api/nfc/ingest (token machine)
        │                                    │
   Kiosque (navigateur) ◄──WSS── (rediffusion) ──  nfc-agent (LOCAL, poste avec ACR122U USB)
```

| Composant     | Hébergement            | Pourquoi                                            |
|---------------|------------------------|-----------------------------------------------------|
| MongoDB       | Atlas (déjà configuré) | Base managée gratuite                               |
| `backend/`    | Render (web service)   | API + WebSocket, accès Atlas                        |
| `ai-service/` | Render (web service)   | Modèle ML de détection                              |
| `frontend/`   | Netlify (statique)     | HTML/CSS/JS, gratuit                                 |
| `nfc-agent/`  | **Local** (kiosques)   | Lecteur USB ACR122U inutilisable sur le cloud       |

> ⚠️ **Render free tier "sleep"** : un service gratuit s'endort après ~15 min
> d'inactivité. Le **premier appel après veille prend ~30–60 s** (réveil).
> C'est normal ; les appels suivants sont rapides.

---

## 0. Prérequis

- Comptes gratuits : [MongoDB Atlas](https://cloud.mongodb.com),
  [Render](https://render.com), [Netlify](https://netlify.com).
- Le code poussé sur un dépôt GitHub.
- Générer les secrets :
  ```bash
  # JWT_SECRET
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  # NFC_AGENT_TOKEN (même valeur backend + agent)
  node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
  ```

---

## 1. MongoDB Atlas (déjà fait — rappel)

1. Cluster créé, utilisateur DB créé.
2. **Network Access → Add IP → `0.0.0.0/0`** (autoriser le cloud Render).
3. Récupérer l'URI : *Connect → Drivers* →
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/smart_campus_db?retryWrites=true&w=majority`
4. Cette URI ira dans `MONGO_URI` du backend.

---

## 2. Backend sur Render

1. Render → **New → Web Service** → connecter le dépôt GitHub.
2. Configuration :
   - **Root Directory** : `backend`
   - **Runtime** : Node
   - **Build Command** : `npm install`
   - **Start Command** : `node server.js` (ou laisser le `Procfile`)
3. **Environment** → ajouter les variables (voir `backend/.env.example`) :
   | Variable | Valeur |
   |----------|--------|
   | `MONGO_URI` | URI Atlas |
   | `JWT_SECRET` | secret généré |
   | `CORS_ORIGIN` | URL Netlify du frontend (étape 4), ex. `https://smart-campus.netlify.app` |
   | `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASS` / `EMAIL_FROM` | SMTP |
   | `ENABLE_NFC` | `false` (pas de lecteur sur le cloud) |
   | `NFC_AGENT_TOKEN` | token généré (à remettre dans le nfc-agent) |
   | `AI_URL` | URL Render de l'ai-service (étape 3) |
   - **Ne pas** définir `PORT` (Render le fournit ; le code lit `process.env.PORT`).
4. Déployer. Noter l'URL, ex. `https://smart-campus-api.onrender.com`.
5. Test : `https://smart-campus-api.onrender.com/api/auth/test` doit répondre.

---

## 3. AI-service sur Render

1. Render → **New → Web Service** → même dépôt.
2. Configuration :
   - **Root Directory** : `ai-service`
   - **Runtime** : Python 3
   - **Build Command** : `pip install -r requirements.txt`
   - **Start Command** : `gunicorn app:app --bind 0.0.0.0:$PORT` (ou le `Procfile`)
3. **Environment** (voir `ai-service/.env.example`) :
   - `AI_CORS_ORIGINS` = URL du backend (ou `*`).
   - `MODEL_PATH` *optionnel* : le service trouve seul le `.joblib` (racine du repo).
4. Le modèle `smart_campus_random_forest_model.joblib` (2,1 Mo) est **commité à la
   racine du repo** et déployé automatiquement. `scikit-learn==1.6.1` est épinglé
   (obligatoire pour charger le modèle).
5. Déployer. Noter l'URL, ex. `https://smart-campus-ai.onrender.com`.
6. Test : `https://smart-campus-ai.onrender.com/health` → `{"status":"ok","model_loaded":true}`.
7. **Retour étape 2** : mettre cette URL dans `AI_URL` du backend, puis re-déployer le backend.

---

## 4. Frontend sur Netlify

1. **Éditer `frontend/config.js`** : remplacer `PROD_BACKEND_ORIGIN` par l'URL
   du backend Render (étape 2), ex. :
   ```js
   const PROD_BACKEND_ORIGIN = "https://smart-campus-api.onrender.com";
   ```
   Committer/pousser ce changement.
2. Netlify → **Add new site → Import from Git** (ou *Deploy manually* en glissant
   le dossier `frontend/`).
   - `netlify.toml` (racine) publie déjà le dossier `frontend/`.
3. Déployer. Noter l'URL, ex. `https://smart-campus.netlify.app`.
4. **Retour étape 2** : mettre cette URL dans `CORS_ORIGIN` du backend, re-déployer.

> Le `config.js` détecte automatiquement local vs prod : en local il pointe vers
> `http://localhost:5000`, en prod vers `PROD_BACKEND_ORIGIN`. Aucun autre fichier
> à modifier.

---

## 5. nfc-agent sur chaque poste/kiosque (local)

Sur chaque machine équipée d'un lecteur **ACR122U** :

```bash
cd nfc-agent
npm install
cp .env.example .env
```
Éditer `.env` :
```ini
BACKEND_URL=https://smart-campus-api.onrender.com
NFC_AGENT_TOKEN=<même token que le backend>
AGENT_ID=kiosk-hall-batiment-a
```
Puis :
```bash
npm start
```

Détails drivers (macOS/Linux/Windows) et lancement au démarrage : voir
[`nfc-agent/README.md`](nfc-agent/README.md).

> Le navigateur du kiosque ouvre la page frontend (Netlify). Quand une carte est
> approchée, `nfc-agent` POST vers `/api/nfc/ingest` → le backend rediffuse via
> WebSocket → la page kiosque réagit.

---

## 6. Test de bout en bout

1. **Login** : ouvrir l'URL Netlify → se connecter (admin) → OTP par email reçu.
2. **Carte étudiant** : créer/valider un étudiant et sa carte depuis le dashboard.
3. **NFC** : sur un poste avec `nfc-agent` lancé, approcher la carte → la page
   kiosque détecte la carte.
4. **Wallet** : effectuer une recharge / un paiement → le solde se met à jour.
5. **IA** : un paiement suspect génère une alerte (onglet Alertes). Si l'ai-service
   dormait, le 1er appel peut être lent (~30 s) puis ré-actif.

---

## Variables d'environnement — récapitulatif

Chaque service a son `.env.example`. **Ne jamais committer de `.env` réel** ;
configurer les valeurs dans les dashboards Render / Netlify.

| Service     | Fichier de référence        | Où configurer en prod        |
|-------------|-----------------------------|------------------------------|
| backend     | `backend/.env.example`      | Render → Environment         |
| ai-service  | `ai-service/.env.example`   | Render → Environment         |
| nfc-agent   | `nfc-agent/.env.example`    | `.env` local sur le poste    |
| frontend    | `frontend/config.js`        | éditer + redéployer Netlify  |

---

## Développement local (rappel — rétrocompatible)

Rien ne change en local : valeurs par défaut intégrées.

```bash
# Backend  (NFC intégré activé via .env : ENABLE_NFC=true)
cd backend && npm install && node server.js          # http://localhost:5000

# AI-service
cd ai-service && pip install -r requirements.txt
python app.py                                         # http://localhost:5001

# Frontend : ouvrir avec un serveur statique (Live Server, port 5500)
#  → config.js détecte localhost et pointe vers http://localhost:5000
```

En local, le NFC reste intégré au backend (`ENABLE_NFC=true`) ; l'agent séparé
n'est nécessaire qu'en architecture cloud.
