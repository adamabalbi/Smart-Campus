// Logique du kiosque de recharge NFC (/kiosk-v2)
// Externalisé depuis server.js pour être compatible avec une Content-Security-Policy
// stricte : aucun script ni gestionnaire d'événement inline.

// Variables globales
let currentCard = null;
let currentStudent = null;
let currentWallet = null;
let selectedAmount = 0;
let websocket = null;
let nfcConnected = false;
let selectedKiosk = null;

// Les 8 bornes de recharge du campus (traçabilité)
const kiosks = [
  { id: 'BORNE-01', label: 'Bibliothèque centrale' },
  { id: 'BORNE-02', label: 'Restaurant universitaire (RU)' },
  { id: 'BORNE-03', label: 'Hall Bâtiment A' },
  { id: 'BORNE-04', label: 'Hall Bâtiment B' },
  { id: 'BORNE-05', label: 'Faculté des Sciences' },
  { id: 'BORNE-06', label: 'Faculté de Droit' },
  { id: 'BORNE-07', label: 'Résidence universitaire' },
  { id: 'BORNE-08', label: 'Entrée principale / Accueil' }
];

// Génère les boutons de bornes (data-action au lieu de onclick inline)
function renderKioskList() {
  const list = document.getElementById('kioskList');
  list.innerHTML = kiosks.map(k =>
    '<button class="btn" style="text-align:left;" data-action="chooseKiosk" data-id="' + k.id + '">' + k.label + '</button>'
  ).join('');
}

// Sélection d'une borne → passage à l'attente de carte
function chooseKiosk(id) {
  selectedKiosk = kiosks.find(k => k.id === id);
  document.getElementById('selectedKioskBadge').innerHTML =
    '<i class="fa-solid fa-location-dot"></i> Borne : <strong>' + selectedKiosk.label + '</strong> ' +
    '<a href="#" data-action="changeKiosk" style="color:#fff; text-decoration:underline; font-size:0.85rem; margin-left:0.5rem;">changer</a>';
  showStep('waiting');
}

// Revenir à la sélection de borne
function changeKiosk() {
  selectedKiosk = null;
  showStep('selectKiosk');
}

// Mapping PIN par UID
const pinMap = {
  'a89fb4ef': '1234',
  'b8d4e0ef': '5678',
  'b840cdef': '9999'
};

// Connexion WebSocket pour détection automatique des cartes
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  console.log('Connexion WebSocket:', wsUrl);

  websocket = new WebSocket(wsUrl);

  websocket.onopen = () => {
    console.log('WebSocket connecté');
    updateNFCStatus('Lecteur NFC connecté - En attente de carte', true);

    // Ping périodique pour maintenir la connexion
    setInterval(() => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  };

  websocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('Événement WebSocket:', data);

      switch (data.type) {
        case 'cardDetected':
          handlePhysicalCard(data.uid, data.cardType);
          break;

        case 'cardRemoved':
          console.log('Carte physique retirée');
          break;

        case 'status':
          if (data.nfcEnabled) {
            updateNFCStatus('Service NFC actif', true);
          } else {
            updateNFCStatus('Service NFC désactivé', false);
          }
          break;

        case 'pong':
          // Réponse au ping - connexion OK
          break;
      }
    } catch (error) {
      console.error('Erreur parsing WebSocket:', error);
    }
  };

  websocket.onclose = () => {
    console.log('WebSocket déconnecté');
    updateNFCStatus('Connexion perdue - Reconnexion...', false);

    // Tentative de reconnexion après 3 secondes
    setTimeout(connectWebSocket, 3000);
  };

  websocket.onerror = (error) => {
    console.error('Erreur WebSocket:', error);
    updateNFCStatus('Erreur de connexion NFC', false);
  };
}

// Mise à jour du statut NFC dans l'interface
function updateNFCStatus(message, connected) {
  nfcConnected = connected;
  const statusEl = document.getElementById('nfcStatusText');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.style.color = connected ? '#44ff44' : '#ff6b6b';
  }
}

// Gestion des cartes physiques détectées
async function handlePhysicalCard(uid, cardType) {
  console.log('Carte physique détectée:', uid, cardType);

  // Ne traiter que si on est en attente
  if (currentCard !== null) {
    console.log('Transaction déjà en cours, carte ignorée');
    return;
  }

  updateNFCStatus(`Lecture carte ${uid.substring(0, 8)}...`, true);

  try {
    const response = await fetch('/api/nfc/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: uid, readerId: 'acr122u-physical' })
    });

    const data = await response.json();
    console.log('Réponse auth carte physique:', data);

    if (data.success) {
      currentCard = { uid: uid, ...data.data.card };
      currentStudent = data.data.student;
      currentWallet = data.data.wallet;

      updateNFCStatus(`Carte identifiée: ${currentStudent.prenom}`, true);

      // Afficher infos étudiant
      document.getElementById('studentInfo').innerHTML = `
        <h3>${currentStudent.prenom} ${currentStudent.nom}</h3>
        <p><strong>Matricule:</strong> ${currentStudent.matricule}</p>
        <p><strong>Filière:</strong> ${currentStudent.filiere}</p>
        <p><strong>Niveau:</strong> ${currentStudent.niveau}</p>
      `;

      showStep('pin');
      document.getElementById('pinInput').focus();

    } else {
      updateNFCStatus('Carte non reconnue', false);
      showError(data.message || 'Carte non reconnue');
      setTimeout(() => {
        updateNFCStatus('En attente de carte', true);
      }, 3000);
    }

  } catch (error) {
    console.error('Erreur auth carte physique:', error);
    updateNFCStatus('Erreur de connexion', false);
    showError('Erreur de connexion: ' + error.message);
  }
}

// Fonction pour afficher une étape
function showStep(stepName) {
  console.log('Affichage étape:', stepName);

  // Masquer toutes les étapes
  document.querySelectorAll('.step').forEach(step => {
    step.classList.remove('active');
    step.classList.add('hidden');
  });

  // Afficher l'étape demandée
  const targetStep = document.getElementById(stepName);
  if (targetStep) {
    targetStep.classList.remove('hidden');
    targetStep.classList.add('active');
  } else {
    console.error('Étape non trouvée:', stepName);
  }
}

// Simulation de carte (boutons de test)
async function simulateCard(uid, studentName) {
  console.log('Simulation carte:', uid, studentName);

  try {
    const response = await fetch('/api/nfc/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: uid, readerId: 'kiosk-test' })
    });

    const data = await response.json();
    console.log('Réponse API:', data);

    if (data.success) {
      currentCard = { uid: uid, ...data.data.card };
      currentStudent = data.data.student;
      currentWallet = data.data.wallet;

      // Afficher infos étudiant
      document.getElementById('studentInfo').innerHTML = `
        <h3>${currentStudent.prenom} ${currentStudent.nom}</h3>
        <p><strong>Matricule:</strong> ${currentStudent.matricule}</p>
        <p><strong>Filière:</strong> ${currentStudent.filiere}</p>
        <p><strong>Niveau:</strong> ${currentStudent.niveau}</p>
      `;

      showStep('pin');
      document.getElementById('pinInput').focus();

    } else {
      showError(data.message || 'Carte non reconnue');
    }

  } catch (error) {
    console.error('Erreur:', error);
    showError('Erreur de connexion: ' + error.message);
  }
}

// Validation du PIN via API
async function validatePin() {
  const pin = document.getElementById('pinInput').value;
  const errorDiv = document.getElementById('pinError');

  if (pin.length !== 4) {
    errorDiv.textContent = 'Le PIN doit contenir 4 chiffres';
    errorDiv.style.display = 'block';
    return;
  }

  console.log('Validation PIN via API...');

  try {
    const response = await fetch('/api/nfc/validate-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: currentCard.uid,
        pin: pin,
        readerId: 'kiosk-test'
      })
    });

    const data = await response.json();
    console.log('Réponse validation PIN:', data);

    if (data.success) {
      errorDiv.style.display = 'none';
      console.log('PIN validé côté serveur');

      // Afficher le solde
      document.getElementById('currentBalance').textContent =
        (currentWallet?.balance || 0).toLocaleString('fr-FR');

      showStep('amount');
    } else {
      errorDiv.textContent = data.message || 'PIN incorrect';
      errorDiv.style.display = 'block';
      document.getElementById('pinInput').value = '';
      document.getElementById('pinInput').focus();

      if (data.blocked) {
        setTimeout(() => {
          showError('Carte bloquée après 3 tentatives incorrectes');
        }, 2000);
      }
    }

  } catch (error) {
    console.error('Erreur validation PIN:', error);
    errorDiv.textContent = 'Erreur de connexion';
    errorDiv.style.display = 'block';
  }
}

// Sélection du montant (l'élément cliqué est passé par le gestionnaire délégué)
function selectAmount(amount, btnEl) {
  selectedAmount = amount;

  // Reset des boutons
  document.querySelectorAll('.amount-btn').forEach(btn => {
    btn.classList.remove('selected');
  });

  // Sélectionner le bouton cliqué
  if (btnEl) btnEl.classList.add('selected');

  // Activer le bouton confirmer
  const confirmBtn = document.getElementById('confirmBtn');
  confirmBtn.disabled = false;
  confirmBtn.style.opacity = '1';
  confirmBtn.style.cursor = 'pointer';
}

// Confirmation de la recharge
async function confirmRecharge() {
  if (!selectedAmount) {
    alert('Veuillez sélectionner un montant');
    return;
  }

  showStep('processing');

  try {
    const response = await fetch('/api/nfc/recharge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: currentCard.uid,
        amount: selectedAmount,
        readerId: selectedKiosk ? selectedKiosk.id : 'kiosk-test',
        metadata: {
          kioskId: selectedKiosk ? selectedKiosk.id : 'kiosk-test',
          location: selectedKiosk ? selectedKiosk.label : 'Non précisée'
        }
      })
    });

    const data = await response.json();
    console.log('Réponse recharge:', data);

    if (data.success) {
      showReceipt(data.data.receipt);
      showStep('success');

      // Auto-retour après 20 secondes (laisse le temps de lire/imprimer)
      setTimeout(() => {
        restart();
      }, 20000);
    } else {
      throw new Error(data.message || 'Erreur de recharge');
    }

  } catch (error) {
    console.error('Erreur recharge:', error);
    showError('Erreur: ' + error.message);
  }
}

// Remplit le reçu affiché
function showReceipt(r) {
  if (!r) return;
  document.getElementById('rcNumber').textContent    = r.receiptNumber;
  document.getElementById('rcDate').textContent      = new Date(r.date).toLocaleString('fr-FR');
  document.getElementById('rcKiosk').textContent     = r.location;
  document.getElementById('rcStudent').textContent   = r.studentName;
  document.getElementById('rcMatricule').textContent = r.matricule;
  document.getElementById('rcAmount').textContent    = r.amount.toLocaleString('fr-FR') + ' XOF';
  document.getElementById('rcBefore').textContent    = r.balanceBefore.toLocaleString('fr-FR') + ' XOF';
  document.getElementById('rcAfter').textContent     = r.balanceAfter.toLocaleString('fr-FR') + ' XOF';
}

// Impression du reçu
function printReceipt() {
  const content = document.getElementById('receiptBox').outerHTML;
  const w = window.open('', '', 'width=400,height=600');
  w.document.write('<html><head><title>Reçu Smart Campus</title></head><body>' + content + '</body></html>');
  w.document.close();
  w.print();
}

// Affichage d'erreur
function showError(message) {
  document.getElementById('errorMessage').textContent = message;
  showStep('error');

  // Auto-retour après 5 secondes
  setTimeout(() => {
    restart();
  }, 5000);
}

// Redémarrage
function restart() {
  console.log('Redémarrage');

  // Reset des variables
  currentCard = null;
  currentStudent = null;
  currentWallet = null;
  selectedAmount = 0;

  // Reset de l'interface
  document.getElementById('pinInput').value = '';
  document.getElementById('pinError').style.display = 'none';

  document.querySelectorAll('.amount-btn').forEach(btn => {
    btn.classList.remove('selected');
  });

  const confirmBtn = document.getElementById('confirmBtn');
  confirmBtn.disabled = true;
  confirmBtn.style.opacity = '0.5';
  confirmBtn.style.cursor = 'not-allowed';

  // Remettre le statut NFC en attente
  if (nfcConnected) {
    updateNFCStatus('En attente de carte', true);
  }

  // Revenir à l'attente de carte si une borne est déjà choisie,
  // sinon redemander la sélection de borne
  showStep(selectedKiosk ? 'waiting' : 'selectKiosk');
}

// Gestionnaire de clics délégué (remplace tous les onclick inline)
function handleDelegatedClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;

  const action = el.dataset.action;
  switch (action) {
    case 'chooseKiosk':    chooseKiosk(el.dataset.id); break;
    case 'changeKiosk':    e.preventDefault(); changeKiosk(); break;
    case 'simulateCard':   simulateCard(el.dataset.uid, el.dataset.name); break;
    case 'validatePin':    validatePin(); break;
    case 'selectAmount':   selectAmount(parseInt(el.dataset.amount, 10), el); break;
    case 'confirmRecharge': confirmRecharge(); break;
    case 'printReceipt':   printReceipt(); break;
    case 'restart':        restart(); break;
  }
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initialisation kiosque NFC');

  // Gestionnaire de clics délégué pour toute la page
  document.addEventListener('click', handleDelegatedClick);

  // Générer la liste des bornes
  renderKioskList();

  // Connexion WebSocket pour détection automatique
  connectWebSocket();

  // Auto-submit PIN sur 4 chiffres
  document.getElementById('pinInput').addEventListener('input', function() {
    if (this.value.length === 4) {
      setTimeout(validatePin, 200);
    }
  });

  console.log('Kiosque NFC prêt');
});
