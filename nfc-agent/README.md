# Smart Campus — Agent NFC local

Petit service Node.js qui tourne **sur chaque poste/kiosque physique** équipé
d'un lecteur **ACR122U** (USB). Il lit les cartes NFC et pousse chaque lecture
vers le backend cloud, qui la rediffuse aux navigateurs kiosques.

```
ACR122U (USB) ──> nfc-agent (ce service, local) ──HTTPS──> backend cloud ──WSS──> kiosques (navigateur)
```

Le lecteur USB **ne peut pas** tourner sur le cloud (Render/Railway) : il
faut un accès matériel direct. C'est tout l'intérêt de cet agent séparé.

---

## Prérequis matériel & drivers

### Lecteur
- Lecteur **ACS ACR122U** branché en USB.

### Drivers PCSC selon l'OS
- **macOS** : PCSC est intégré (aucune installation). Si un souci, débrancher/rebrancher le lecteur.
- **Linux (Debian/Ubuntu)** :
  ```bash
  sudo apt-get update
  sudo apt-get install -y pcscd libpcsclite-dev libusb-1.0-0-dev
  sudo systemctl enable --now pcscd
  ```
  Si le module noyau `pn533`/`nfc` capture le lecteur, le mettre en liste noire :
  ```bash
  echo -e "blacklist pn533\nblacklist pn533_usb\nblacklist nfc" | sudo tee /etc/modprobe.d/blacklist-nfc.conf
  sudo reboot
  ```
- **Windows** : drivers ACR122U fournis par ACS (généralement auto-installés).

### Node.js
- **Node.js 18+** (le `fetch` natif est utilisé).

---

## Installation

```bash
cd nfc-agent
npm install
cp .env.example .env
# puis éditez .env (voir ci-dessous)
```

### Variables d'environnement (`.env`)

| Variable          | Description                                                            |
|-------------------|-----------------------------------------------------------------------|
| `BACKEND_URL`     | URL du backend cloud, ex. `https://smart-campus-api.onrender.com` (sans `/` final). En local : `http://localhost:5000`. |
| `NFC_AGENT_TOKEN` | Token machine **identique** à celui configuré côté backend (`NFC_AGENT_TOKEN`). |
| `AGENT_ID`        | Nom du poste (logs), ex. `kiosk-hall-batiment-a`. Optionnel.           |

> Le token se génère côté backend :
> `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
> puis on met la **même valeur** dans le `.env` du backend et dans celui de l'agent.

---

## Démarrage

```bash
npm start
```

Sortie attendue :
```
🏫 Smart Campus — Agent NFC
   Poste     : kiosk-hall-batiment-a
   Backend   : https://smart-campus-api.onrender.com
✅ Service NFC démarré — en attente d'un lecteur ACR122U...
📖 Lecteur connecté: ACS ACR122U PICC Interface
```

Approchez une carte : `📥 Carte détectée ... → 📤 cardDetected envoyé au backend`.

---

## Lancer au démarrage du poste (optionnel)

- **Linux (systemd)** : créez `/etc/systemd/system/nfc-agent.service` pointant
  vers `node /chemin/nfc-agent/agent.js` avec `Restart=always`.
- **macOS** : un `launchd` plist, ou simplement `pm2 start agent.js --name nfc-agent`.

---

## Dépannage

| Symptôme                                   | Piste                                                                 |
|--------------------------------------------|----------------------------------------------------------------------|
| `Impossible d'initialiser le lecteur NFC`  | Lecteur non branché / drivers PCSC absents (voir section drivers).    |
| `Backend a refusé l'événement (401)`       | `NFC_AGENT_TOKEN` différent entre l'agent et le backend.             |
| `Échec d'envoi au backend`                 | `BACKEND_URL` incorrect, ou backend Render en veille (réessaie).      |
| Lecteur non détecté sous Linux             | Blacklister `pn533`/`nfc` (voir drivers Linux).                       |
