// Supervision des accès — agent de sécurité.
// Affiche l'occupation temps réel (REST + WebSocket), les alertes de capacité
// et l'historique des accès. Réutilise le token JWT stocké en localStorage.

const API = (window.SMART_CAMPUS_CONFIG && window.SMART_CAMPUS_CONFIG.API_BASE_URL) || "http://localhost:5000/api";
const WS_URL = (window.SMART_CAMPUS_CONFIG && window.SMART_CAMPUS_CONFIG.WS_BASE_URL) || "ws://localhost:5000";
const token = localStorage.getItem("token");

if (!token) window.location.href = "index.html";

const spaces = new Map(); // key -> { label, spaceType, capacity, currentOccupancy }

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  if (res.status === 401 || res.status === 403) { localStorage.clear(); window.location.href = "index.html"; return; }
  return res;
}

const SPACE_TYPE_FR = {
  entrance: "Entrée", classroom: "Salle de cours", lab: "Laboratoire", library: "Bibliothèque",
  cafeteria: "Cantine", office: "Bureau", department: "Département", admin: "Administration",
};

function classFor(rate, full) {
  if (full) return "full";
  if (rate != null && rate >= 80) return "warn";
  return "";
}

function renderSpaces() {
  const grid = document.getElementById("spacesGrid");
  const alertsBox = document.getElementById("alertsBox");
  if (spaces.size === 0) { grid.innerHTML = '<p style="opacity:.7;">Aucun espace actif.</p>'; return; }

  const alerts = [];
  grid.innerHTML = "";
  [...spaces.values()].sort((a, b) => a.label.localeCompare(b.label)).forEach((s) => {
    const cap = s.capacity || 0;
    const occ = s.currentOccupancy || 0;
    const rate = cap > 0 ? Math.round((occ / cap) * 100) : null;
    const full = cap > 0 && occ >= cap;
    const cls = classFor(rate, full);
    if (full) alerts.push(`${s.label} : capacité atteinte (${occ}/${cap})`);
    else if (rate != null && rate >= 80) alerts.push(`${s.label} : ${rate}% (${occ}/${cap})`);

    const card = document.createElement("div");
    card.className = "space-card " + cls;
    card.innerHTML = `
      <div class="space-type">${SPACE_TYPE_FR[s.spaceType] || s.spaceType}</div>
      <h3>${s.label}</h3>
      <div class="occ-num">${occ}${cap > 0 ? ` <span style="font-size:1rem;opacity:.6;">/ ${cap}</span>` : ""}</div>
      ${cap > 0 ? `<div class="bar ${cls}"><span style="width:${Math.min(100, rate)}%"></span></div>` : '<div style="font-size:.85rem;opacity:.6;">Sans limite de capacité</div>'}
      <span class="reset-link" data-key="${s.key}">Réinitialiser à 0</span>`;
    grid.appendChild(card);
  });

  document.querySelectorAll(".reset-link").forEach((el) => {
    el.onclick = async () => {
      if (!confirm("Réinitialiser l'occupation de cet espace ?")) return;
      await api(`/access/occupancy/${el.dataset.key}/reset`, { method: "POST" });
      loadOccupancy();
    };
  });

  if (alerts.length) {
    alertsBox.style.display = "block";
    alertsBox.innerHTML = `<strong><i class="fa-solid fa-triangle-exclamation"></i> Alertes capacité</strong><ul style="margin:.5rem 0 0 1rem;">${alerts.map((a) => `<li>${a}</li>`).join("")}</ul>`;
  } else {
    alertsBox.style.display = "none";
  }
}

async function loadOccupancy() {
  const res = await api("/access/occupancy");
  if (!res || !res.ok) return;
  const { spaces: list } = await res.json();
  spaces.clear();
  const sel = document.getElementById("filterSpace");
  const current = sel.value;
  sel.innerHTML = '<option value="">Tous les espaces</option>';
  list.forEach((s) => {
    spaces.set(s.key, s);
    sel.insertAdjacentHTML("beforeend", `<option value="${s.key}">${s.label}</option>`);
  });
  sel.value = current;
  renderSpaces();
}

const REASON_FR = {
  ok: "Accès autorisé", card_not_found: "Carte inconnue", card_blocked: "Carte bloquée",
  student_inactive: "Étudiant inactif", space_not_found: "Espace introuvable", space_inactive: "Espace indisponible",
  access_not_allowed: "Accès non autorisé", outside_allowed_time: "Hors horaire",
  department_not_allowed: "Département non autorisé", level_not_allowed: "Niveau non autorisé",
  capacity_exceeded: "Capacité atteinte", pin_required: "PIN requis", pin_invalid: "PIN incorrect",
  scolarite_not_ok: "Scolarité non régularisée",
};

async function loadLogs() {
  const space = document.getElementById("filterSpace").value;
  const decision = document.getElementById("filterDecision").value;
  const qs = new URLSearchParams({ limit: 30 });
  if (space) qs.set("spaceKey", space);
  if (decision) qs.set("decision", decision);
  const res = await api("/access/logs?" + qs.toString());
  if (!res || !res.ok) return;
  const { logs } = await res.json();
  const body = document.getElementById("logsBody");
  if (!logs.length) { body.innerHTML = '<tr><td colspan="6" style="opacity:.7;">Aucun accès enregistré.</td></tr>'; return; }
  body.innerHTML = logs.map((l) => `
    <tr>
      <td>${new Date(l.timestamp).toLocaleTimeString("fr-FR")}</td>
      <td>${l.studentName || "—"}<br><span style="opacity:.6;font-size:.8rem;">${l.studentMatricule || ""}</span></td>
      <td>${l.spaceLabel || l.spaceKey || "—"}</td>
      <td>${l.direction === "out" ? "Sortie" : "Entrée"}</td>
      <td><span class="tag ${l.decision === "authorized" ? "ok" : "ko"}">${l.decision === "authorized" ? "Autorisé" : "Refusé"}</span></td>
      <td>${REASON_FR[l.reason] || l.reason}</td>
    </tr>`).join("");
}

// --- WebSocket : mises à jour d'occupation en direct ---
function connectWS() {
  const dot = document.getElementById("wsDot");
  const txt = document.getElementById("wsText");
  let ws;
  try { ws = new WebSocket(WS_URL); } catch { txt.textContent = "WebSocket indisponible"; return; }

  ws.onopen = () => { dot.classList.remove("off"); txt.textContent = "Temps réel connecté"; };
  ws.onclose = () => { dot.classList.add("off"); txt.textContent = "Reconnexion…"; setTimeout(connectWS, 4000); };
  ws.onerror = () => { dot.classList.add("off"); txt.textContent = "Erreur WebSocket"; };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "occupancyUpdate") {
        const s = spaces.get(msg.spaceKey) || {};
        spaces.set(msg.spaceKey, {
          key: msg.spaceKey, label: msg.spaceLabel || s.label, spaceType: msg.spaceType || s.spaceType,
          capacity: msg.capacity, currentOccupancy: msg.currentOccupancy,
        });
        renderSpaces();
        loadLogs(); // rafraîchir l'historique sur événement d'accès
      }
    } catch { /* ignore */ }
  };
}

document.getElementById("logoutBtn").onclick = () => { localStorage.clear(); window.location.href = "index.html"; };
document.getElementById("refreshLogs").onclick = loadLogs;
document.getElementById("filterSpace").onchange = loadLogs;
document.getElementById("filterDecision").onchange = loadLogs;

loadOccupancy();
loadLogs();
connectWS();
setInterval(loadOccupancy, 30000); // filet de sécurité si WS coupé
