const API = (window.SMART_CAMPUS_CONFIG && window.SMART_CAMPUS_CONFIG.API_BASE_URL) || "http://localhost:5000/api";

const token = localStorage.getItem("token");
const me = JSON.parse(localStorage.getItem("user") || "null");

// Vérification d'autorisation
if (!token || !me || me.role !== "payment_agent") {
  window.location.href = "index.html";
}

async function req(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json();
  if (res.status === 401) {
    localStorage.clear();
    window.location.href = "index.html";
  }
  return { ok: res.ok, data };
}

function showMsg(id, text, type = "error") {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = text;
  el.classList.remove("hidden");
  if (type === "success") setTimeout(() => el.classList.add("hidden"), 4000);
}

function clearMsg(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add("hidden"); el.textContent = ""; }
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' XOF';
}

function formatDateTime(date) {
  return new Date(date).toLocaleString('fr-FR');
}

// Initialisation
document.getElementById("sbName").textContent = `${me.prenom} ${me.nom}`;

// Gestion des onglets
document.querySelectorAll(".nav-item[data-tab]").forEach(item => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    item.classList.add("active");
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    document.getElementById(`tab-${item.dataset.tab}`)?.classList.add("active");

    if (item.dataset.tab === "history") {
      loadHistory();
    }
    if (item.dataset.tab === "account") loadAccount();
  });
});

// Déconnexion
document.getElementById("logoutBtn").addEventListener("click", async () => {
  try { await req("/auth/logout", { method: "POST" }); } catch {}
  localStorage.clear();
  window.location.href = "index.html";
});

// =============================================================
// RECHARGE PORTEFEUILLE
// =============================================================

let currentWallet = null;
let currentCard = null;
let currentStudent = null;

// Recherche de carte
document.addEventListener('DOMContentLoaded', function() {
  const searchBtn = document.getElementById("searchCardBtn");
  const cardUIDInput = document.getElementById("cardUID");

  console.log("🔧 DEBUG: Bouton recherche:", searchBtn);
  console.log("🔧 DEBUG: Champ UID:", cardUIDInput);

  if (searchBtn) {
    searchBtn.addEventListener("click", searchCard);
    console.log("✅ Event listener attaché au bouton");
  } else {
    console.error("❌ Bouton searchCardBtn non trouvé");
  }

  if (cardUIDInput) {
    cardUIDInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") searchCard();
    });
  }

  const scanBtn = document.getElementById("scanCardBtn");
  if (scanBtn) scanBtn.addEventListener("click", scanCard);
});

// =============================================================
// SCAN NFC DE LA CARTE (lecteur ACR122U via WebSocket)
// =============================================================

let scanSocket = null;
let scanActive = false;

function setScanHint(text, color) {
  const el = document.getElementById("scanHint");
  if (el) { el.textContent = text; el.style.color = color || "var(--muted)"; }
}

function scanCard() {
  // Annuler un scan déjà en cours
  if (scanActive) {
    scanActive = false;
    if (scanSocket) scanSocket.close();
    setScanHint("Scan annulé. Cliquez sur Scanner ou saisissez l'UID.", "var(--muted)");
    return;
  }

  setScanHint("📡 Approchez la carte de l'étudiant du lecteur ACR122U...", "var(--primary)");
  scanActive = true;

  scanSocket = new WebSocket((window.SMART_CAMPUS_CONFIG && window.SMART_CAMPUS_CONFIG.WS_BASE_URL) || "ws://localhost:5000");

  scanSocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "cardDetected" && scanActive) {
        document.getElementById("cardUID").value = data.uid;
        setScanHint(`✅ Carte détectée : ${data.uid}`, "#22c55e");
        scanActive = false;
        scanSocket.close();
        // Lancer automatiquement la recherche de la carte
        searchCard();
      }
    } catch (err) {
      console.error("Erreur message WebSocket scan:", err);
    }
  };

  scanSocket.onerror = () => {
    setScanHint("🔴 Lecteur NFC indisponible (serveur lancé avec ENABLE_NFC=true ?)", "#ef4444");
    scanActive = false;
  };

  // Timeout de sécurité : 20 secondes
  setTimeout(() => {
    if (scanActive) {
      scanActive = false;
      if (scanSocket) scanSocket.close();
      setScanHint("⏱️ Délai dépassé. Cliquez à nouveau sur Scanner.", "#f59e0b");
    }
  }, 20000);
}

async function searchCard() {
  console.log("🔍 DEBUG: Fonction searchCard() appelée");
  const uid = document.getElementById("cardUID").value.trim().toUpperCase();
  console.log("🔍 DEBUG: UID saisi:", uid);

  // Validation de l'UID
  if (!uid) {
    showMsg("searchCardMsg", "Veuillez saisir l'UID de la carte.");
    return;
  }

  // Vérifier que l'UID est au format hexadécimal valide (8-14 caractères)
  if (!/^[0-9A-F]{8,14}$/.test(uid)) {
    showMsg("searchCardMsg", "UID invalide. Format attendu: 8-14 caractères hexadécimaux (ex: 04A1B2C3D4E5F6).");
    return;
  }

  clearMsg("searchCardMsg");

  const btn = document.getElementById("searchCardBtn");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "🔄 Recherche...";

  const { ok, data } = await req(`/wallets/card/${uid}`);

  btn.disabled = false;
  btn.textContent = originalText;

  if (!ok) {
    showMsg("searchCardMsg", data.message);
    resetRechargeForm();
    return;
  }

  currentWallet = data.wallet;
  currentCard = data.card;
  currentStudent = currentWallet.studentId;

  // Afficher les informations de l'étudiant
  displayStudentInfo();
  showMsg("searchCardMsg", "✅ Carte trouvée avec succès !", "success");
}

function displayStudentInfo() {
  const infoCard = document.getElementById("studentInfoCard");
  const formCard = document.getElementById("rechargeFormCard");

  // Afficher les informations
  document.getElementById("studentName").textContent =
    `${currentStudent.prenom} ${currentStudent.nom}`;
  document.getElementById("studentMatricule").textContent = currentStudent.matricule;
  document.getElementById("studentEmail").textContent = currentStudent.email;

  // Statut de la carte
  const statusEl = document.getElementById("cardStatus");
  const statusClass = currentCard.status === "active" ? "badge-active" : "badge-blocked";
  statusEl.innerHTML = `<span class="badge ${statusClass}">${currentCard.status}</span>`;

  // Solde actuel
  document.getElementById("currentBalance").textContent = formatCurrency(currentWallet.balance);

  // Afficher les cartes
  infoCard.style.display = "block";

  if (currentCard.status === "active" && currentWallet.status === "active") {
    formCard.style.display = "block";
  } else {
    formCard.style.display = "none";
    showMsg("searchCardMsg", "Carte ou portefeuille inactif. Recharge impossible.", "error");
  }
}

// Calcul automatique du nouveau solde
document.getElementById("rechargeAmount").addEventListener("input", updateSummary);

function updateSummary() {
  const amount = parseFloat(document.getElementById("rechargeAmount").value) || 0;
  const currentBalance = currentWallet ? currentWallet.balance : 0;
  const newBalance = currentBalance + amount;

  if (amount > 0) {
    document.getElementById("summaryCurrentBalance").textContent = formatCurrency(currentBalance);
    document.getElementById("summaryAmount").textContent = formatCurrency(amount);
    document.getElementById("summaryNewBalance").textContent = formatCurrency(newBalance);
    document.getElementById("rechargeSummary").style.display = "block";
  } else {
    document.getElementById("rechargeSummary").style.display = "none";
  }
}

// Formulaire de recharge
document.getElementById("rechargeForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const amount = parseFloat(document.getElementById("rechargeAmount").value);
  const pin = document.getElementById("studentPIN").value.trim();
  const uid = document.getElementById("cardUID").value.trim();

  if (!amount || !pin || !uid) {
    showMsg("rechargeFormMsg", "Veuillez remplir tous les champs.");
    return;
  }

  if (amount < 100 || amount > 100000) {
    showMsg("rechargeFormMsg", "Montant invalide (100 - 100,000 XOF).");
    return;
  }

  clearMsg("rechargeFormMsg");

  const btn = document.getElementById("validateRechargeBtn");
  btn.disabled = true;
  btn.textContent = "Traitement...";

  const { ok, data } = await req("/wallets/recharge/agent", {
    method: "POST",
    body: JSON.stringify({ uid, amount, pin }),
  });

  btn.disabled = false;
  btn.textContent = "Valider la recharge";

  if (!ok) {
    showMsg("rechargeFormMsg", data.message);
    return;
  }

  // Afficher le reçu
  displayReceipt(data);
});

// Affichage du reçu
function displayReceipt(transactionData) {
  const receiptCard = document.getElementById("receiptCard");

  document.getElementById("receiptTransactionId").textContent = transactionData.transaction.id;
  document.getElementById("receiptDate").textContent = formatDateTime(transactionData.transaction.createdAt);
  document.getElementById("receiptStudentName").textContent = `${currentStudent.prenom} ${currentStudent.nom}`;
  document.getElementById("receiptMatricule").textContent = currentStudent.matricule;
  document.getElementById("receiptAmount").textContent = formatCurrency(transactionData.transaction.amount);
  document.getElementById("receiptOldBalance").textContent = formatCurrency(transactionData.transaction.balanceBefore);
  document.getElementById("receiptNewBalance").textContent = formatCurrency(transactionData.transaction.balanceAfter);
  document.getElementById("receiptAgent").textContent = `${me.prenom} ${me.nom}`;

  // Masquer le formulaire et afficher le reçu
  document.getElementById("studentInfoCard").style.display = "none";
  document.getElementById("rechargeFormCard").style.display = "none";
  receiptCard.style.display = "block";
}

// Boutons du reçu
document.getElementById("printReceiptBtn").addEventListener("click", () => {
  window.print();
});

document.getElementById("newRechargeBtn").addEventListener("click", resetRechargeForm);

// Réinitialisation du formulaire
document.getElementById("resetFormBtn").addEventListener("click", resetRechargeForm);

function resetRechargeForm() {
  // Réinitialiser les variables
  currentWallet = null;
  currentCard = null;
  currentStudent = null;

  // Réinitialiser le formulaire
  document.getElementById("cardUID").value = "";
  document.getElementById("rechargeAmount").value = "";
  document.getElementById("studentPIN").value = "";

  // Masquer les cartes
  document.getElementById("studentInfoCard").style.display = "none";
  document.getElementById("rechargeFormCard").style.display = "none";
  document.getElementById("receiptCard").style.display = "none";
  document.getElementById("rechargeSummary").style.display = "none";

  // Effacer les messages
  clearMsg("searchCardMsg");
  clearMsg("rechargeFormMsg");

  // Focus sur le champ UID
  document.getElementById("cardUID").focus();
}

// =============================================================
// HISTORIQUE
// =============================================================

async function loadHistory() {
  const el = document.getElementById("historyTable");
  el.innerHTML = `<div class="state-msg">Chargement...</div>`;

  try {
    const filterDate = document.getElementById("filterDate").value;
    // Vue globale : toutes les recharges (agent + bornes). Pas de filtre de canal.
    let query = "?type=recharge";
    if (filterDate) {
      query += `&date=${filterDate}`;
    }

    // Charger toutes les recharges du système
    const { ok, data } = await req(`/wallets/agent-history${query}`);

    if (!ok) {
      el.innerHTML = `<div class="state-msg">Erreur lors du chargement : ${data.message}</div>`;
      return;
    }

    const transactions = data.transactions || [];

    if (!transactions.length) {
      el.innerHTML = `<div class="state-msg">Aucune recharge${filterDate ? ' pour cette date' : ''}.</div>`;
      return;
    }

    el.innerHTML = `
      <table>
        <thead><tr>
          <th>Date</th><th>Canal</th><th>Source / Lieu</th><th>Étudiant</th><th>Matricule</th><th>Montant</th><th>Nouveau solde</th><th>N° reçu</th><th>Statut</th>
        </tr></thead>
        <tbody>
          ${transactions.map(t => {
            const canalBadge = t.channel === 'kiosk'
              ? '<span class="badge badge-active">🏪 Borne</span>'
              : '<span class="badge badge-inactive">👤 Agent</span>';
            return `
            <tr>
              <td style="font-size:12px">${formatDateTime(t.createdAt)}</td>
              <td>${canalBadge}</td>
              <td style="font-size:12px">${t.source || '—'}</td>
              <td>${t.studentName || '—'}</td>
              <td>${t.studentMatricule || '—'}</td>
              <td style="color: var(--success);">${formatCurrency(t.amount)}</td>
              <td><strong>${formatCurrency(t.balanceAfter)}</strong></td>
              <td style="font-size:11px">${t.receiptNumber || '—'}</td>
              <td><span class="badge badge-${t.status === 'validated' ? 'active' : 'blocked'}">${t.status === 'validated' ? 'Validé' : 'Échoué'}</span></td>
            </tr>
          `;}).join("")}
        </tbody>
      </table>`;

  } catch (error) {
    console.error("Erreur loadHistory:", error);
    el.innerHTML = `<div class="state-msg">Erreur de connexion lors du chargement.</div>`;
  }
}

document.getElementById("loadHistoryBtn").addEventListener("click", loadHistory);

// =============================================================
// MON COMPTE
// =============================================================

function loadAccount() {
  document.getElementById("accountName").textContent = `${me.prenom} ${me.nom}`;
  document.getElementById("accountEmail").textContent = me.email;

  // Réinitialiser le formulaire
  document.getElementById("currentPassword").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";
  clearMsg("passwordMsg");
}

// Gestionnaire pour le changement de mot de passe
document.getElementById("changePasswordBtn").addEventListener("click", async () => {
  clearMsg("passwordMsg");

  const currentPassword = document.getElementById("currentPassword").value.trim();
  const newPassword = document.getElementById("newPassword").value.trim();
  const confirmPassword = document.getElementById("confirmPassword").value.trim();

  // Validations
  if (!currentPassword || !newPassword || !confirmPassword) {
    showMsg("passwordMsg", "Veuillez remplir tous les champs.");
    return;
  }

  if (newPassword !== confirmPassword) {
    showMsg("passwordMsg", "Les nouveaux mots de passe ne correspondent pas.");
    return;
  }

  if (newPassword.length < 6) {
    showMsg("passwordMsg", "Le nouveau mot de passe doit contenir au moins 6 caractères.");
    return;
  }

  // Appel API
  const { ok, data } = await req("/auth/change-password", {
    method: "PATCH",
    body: JSON.stringify({
      oldPassword: currentPassword,
      newPassword: newPassword,
    }),
  });

  if (!ok) {
    showMsg("passwordMsg", data.message);
    return;
  }

  showMsg("passwordMsg", "Mot de passe changé avec succès !", "success");

  // Réinitialiser le formulaire
  document.getElementById("currentPassword").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";

  // Mettre à jour les données utilisateur si nécessaire
  if (data.user) {
    const updatedUser = { ...me, ...data.user };
    localStorage.setItem("user", JSON.stringify(updatedUser));
  }
});

// Initialisation - focus sur le champ UID
document.getElementById("cardUID").focus();