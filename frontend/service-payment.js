// =============================================================
// Logique commune des pages de service (Cantine, Bibliothèque, Imprimerie)
// Chaque page définit window.SERVICE_CONFIG avant de charger ce script.
// =============================================================

const API = (window.SMART_CAMPUS_CONFIG && window.SMART_CAMPUS_CONFIG.API_BASE_URL) || "http://localhost:5000/api";
const CFG = window.SERVICE_CONFIG;

// État courant
let currentStudent = null;
let currentWallet = null;
let currentUID = null;
let selectedItem = null;     // { label, amount } ou { label, unit }
let scanSocket = null;
let scanActive = false;

// --- Helpers ---
function $(id) { return document.getElementById(id); }
function fmt(n) { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'; }

function setStatus(text, color) {
  const el = $("scanStatus");
  if (el) { el.textContent = text; el.style.color = color || "#666"; }
}

function showStep(id) {
  document.querySelectorAll(".svc-step").forEach(s => s.classList.add("hidden"));
  const el = $(id);
  if (el) el.classList.remove("hidden");
}

// --- Vérifie que le service est actif avant de permettre les paiements ---
async function checkServiceActive() {
  try {
    const res = await fetch(`${API}/services/${CFG.service}`);
    const data = await res.json();
    if (data.service && data.service.status !== "active") {
      blockService();
    }
  } catch (err) {
    console.warn("Impossible de vérifier l'état du service:", err);
  }
}

function blockService() {
  const container = document.querySelector(".svc-container");
  container.innerHTML = `
    <h1 class="svc-title">${CFG.icon ? '<i class="fa-solid '+CFG.icon+'"></i> ' : ''}${CFG.title}</h1>
    <div class="svc-card" style="text-align:center; padding:3rem 1.5rem;">
      <div style="font-size:4rem;"><i class="fa-solid fa-ban"></i></div>
      <h2 style="margin:1rem 0;">Service indisponible</h2>
      <p style="opacity:0.9;">Ce service est actuellement désactivé par l'administration.<br>Veuillez réessayer plus tard.</p>
    </div>`;
}

// --- Initialisation de la page ---
document.addEventListener("DOMContentLoaded", () => {
  $("pageTitle").innerHTML = (CFG.icon ? '<i class="fa-solid '+CFG.icon+'"></i> ' : '') + CFG.title;
  document.title = CFG.title + " — Smart Campus";

  // Bloquer la page si le service est désactivé
  checkServiceActive();

  // Construire la liste des services
  const unitSuffix = CFG.unitSuffix || 'page';
  const list = $("serviceList");
  list.innerHTML = CFG.items.map((it, i) => {
    const prix = CFG.mode === 'unit' ? (it.unit + ' FCFA / ' + unitSuffix) : fmt(it.amount);
    return `<button type="button" class="svc-item-btn" data-index="${i}">
              <span>${it.label}</span><strong>${prix}</strong>
            </button>`;
  }).join("");

  list.querySelectorAll(".svc-item-btn").forEach(btn =>
    btn.addEventListener("click", () => selectItem(parseInt(btn.dataset.index), btn))
  );

  $("scanBtn").addEventListener("click", scanCard);
  $("payBtn").addEventListener("click", doPayment);
  $("resetBtn").addEventListener("click", reset);

  // Champ quantité (mode unit) : nombre de pages, de plats, etc.
  if (CFG.mode === 'unit') {
    $("qtyRow").classList.remove("hidden");
    $("qtyLabel").textContent = CFG.qtyLabel || 'Quantité';
    $("qtyInput").addEventListener("input", updateAmount);
  }
});

// --- Scan de la carte ---
function scanCard() {
  if (scanActive) {
    scanActive = false;
    if (scanSocket) scanSocket.close();
    setStatus("Scan annulé.", "#666");
    return;
  }
  setStatus("Approchez la carte de l'étudiant du lecteur...", "#4F6F52");
  scanActive = true;
  scanSocket = new WebSocket((window.SMART_CAMPUS_CONFIG && window.SMART_CAMPUS_CONFIG.WS_BASE_URL) || "ws://localhost:5000");

  scanSocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "cardDetected" && scanActive) {
        scanActive = false;
        scanSocket.close();
        identifyStudent(data.uid);
      }
    } catch (err) { console.error(err); }
  };
  scanSocket.onerror = () => {
    setStatus("Lecteur NFC indisponible (serveur lancé avec ENABLE_NFC=true ?)", "#B85C5C");
    scanActive = false;
  };
  setTimeout(() => {
    if (scanActive) {
      scanActive = false;
      if (scanSocket) scanSocket.close();
      setStatus("Délai dépassé. Cliquez à nouveau sur Scanner.", "#C9A227");
    }
  }, 20000);
}

// --- Identification de l'étudiant via /api/nfc/auth ---
async function identifyStudent(uid) {
  setStatus("Lecture de la carte...", "#4F6F52");
  try {
    const res = await fetch(`${API}/nfc/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, readerId: CFG.service })
    });
    const data = await res.json();
    if (!data.success) {
      setStatus("" + (data.message || "Carte non reconnue"), "#B85C5C");
      return;
    }
    currentUID = uid;
    currentStudent = data.data.student;
    currentWallet = data.data.wallet;

    $("stUID").textContent = uid;
    $("stName").textContent = `${currentStudent.prenom} ${currentStudent.nom}`;
    $("stMatricule").textContent = currentStudent.matricule;
    $("stBalance").textContent = currentWallet ? fmt(currentWallet.balance) : "—";

    setStatus("Étudiant identifié : " + currentStudent.prenom, "#5F8D4E");
    showStep("step-pay");
  } catch (err) {
    setStatus("Erreur de connexion au serveur", "#B85C5C");
  }
}

// --- Sélection d'un service ---
function selectItem(index, btn) {
  selectedItem = CFG.items[index];
  document.querySelectorAll(".svc-item-btn").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  updateAmount();
}

// --- Calcul du montant ---
function updateAmount() {
  if (!selectedItem) { $("amountDisplay").textContent = "—"; return; }
  let amount;
  if (CFG.mode === 'unit') {
    const qty = parseInt($("qtyInput").value) || 0;
    amount = selectedItem.unit * qty;
  } else {
    amount = selectedItem.amount;
  }
  $("amountDisplay").textContent = fmt(amount);
  $("amountDisplay").dataset.value = amount;
}

// --- Paiement ---
async function doPayment() {
  const amount = parseInt($("amountDisplay").dataset.value) || 0;
  const pin = $("pinInput").value.trim();
  const msg = $("payMsg");
  msg.textContent = "";

  if (!selectedItem) { msg.textContent = "Sélectionnez un service."; return; }
  if (amount <= 0) { msg.textContent = "Montant invalide."; return; }
  if (!pin) { msg.textContent = "L'étudiant doit saisir son code PIN."; return; }

  // Libellé détaillé (avec nb de pages si imprimerie)
  let description = selectedItem.label;
  if (CFG.mode === 'unit') {
    const qty = parseInt($("qtyInput").value) || 0;
    description = `${selectedItem.label} × ${qty} ${(CFG.unitSuffix || 'unité')}(s)`;
  }

  $("payBtn").disabled = true;
  $("payBtn").textContent = "Traitement...";

  try {
    const res = await fetch(`${API}/nfc/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: currentUID,
        pin: pin,
        amount: amount,
        service: CFG.service,
        serviceLabel: CFG.title,
        description: description,
        readerId: CFG.service,
        idempotencyKey: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random())
      })
    });
    const data = await res.json();

    $("payBtn").disabled = false;
    $("payBtn").textContent = "Payer";

    if (!data.success) {
      msg.textContent = data.message || "Paiement refusé.";
      return;
    }
    showReceipt(data.data.receipt, description);
  } catch (err) {
    $("payBtn").disabled = false;
    $("payBtn").textContent = "Payer";
    msg.textContent = "Erreur de connexion au serveur.";
  }
}

// --- Reçu ---
function showReceipt(r, description) {
  $("rcNumber").textContent = r.receiptNumber;
  $("rcDate").textContent = new Date(r.date).toLocaleString('fr-FR');
  $("rcService").textContent = CFG.title;
  $("rcDetail").textContent = description;
  $("rcStudent").textContent = r.studentName;
  $("rcMatricule").textContent = r.matricule;
  $("rcAmount").textContent = fmt(r.amount);
  $("rcBefore").textContent = fmt(r.balanceBefore);
  $("rcAfter").textContent = fmt(r.balanceAfter);
  showStep("step-receipt");
}

// --- Réinitialisation ---
function reset() {
  currentStudent = null; currentWallet = null; currentUID = null; selectedItem = null;
  $("pinInput").value = "";
  if (CFG.mode === 'unit') $("qtyInput").value = "";
  $("amountDisplay").textContent = "—";
  $("amountDisplay").dataset.value = "";
  $("payMsg").textContent = "";
  setStatus("Cliquez sur Scanner et posez la carte.", "#666");
  showStep("step-scan");
}

function printReceipt() {
  const content = $("receiptBox").outerHTML;
  const w = window.open('', '', 'width=400,height=600');
  w.document.write('<html><head><title>Reçu</title></head><body>' + content + '</body></html>');
  w.document.close();
  w.print();
}