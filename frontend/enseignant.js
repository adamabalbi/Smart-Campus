// Espace enseignant — gestion des présences (liste live + alertes + export).
const API = (window.SMART_CAMPUS_CONFIG && window.SMART_CAMPUS_CONFIG.API_BASE_URL) || "http://localhost:5000/api";
const WS_URL = (window.SMART_CAMPUS_CONFIG && window.SMART_CAMPUS_CONFIG.WS_BASE_URL) || "ws://localhost:5000";
const token = localStorage.getItem("token");
if (!token) window.location.href = "index.html";

const STATUS_FR = { present: "Présent", late: "Retard", absent: "Absent", excused: "Excusé" };
// Échappe le HTML avant insertion via innerHTML (anti-XSS stocké).
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));
let currentCourseId = null;
let currentCourseCode = null;

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  if (res.status === 401 || res.status === 403) {
    if (res.status === 401) { localStorage.clear(); window.location.href = "index.html"; }
  }
  return res;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

async function loadCourses() {
  const res = await api("/courses");
  if (!res || !res.ok) return;
  const { courses } = await res.json();
  const sel = document.getElementById("courseSelect");
  if (!courses.length) { sel.innerHTML = '<option value="">Aucun cours assigné</option>'; return; }
  sel.innerHTML = courses.map((c) => `<option value="${esc(c._id)}" data-code="${esc(c.code)}">${esc(c.code)} — ${esc(c.name)}</option>`).join("");
  currentCourseId = courses[0]._id;
  currentCourseCode = courses[0].code;
  loadLive();
}

async function loadLive() {
  if (!currentCourseId) return;
  const date = document.getElementById("dateInput").value || todayStr();
  const res = await api(`/attendance/course/${currentCourseId}?date=${date}`);
  if (!res || !res.ok) { document.getElementById("liveBody").innerHTML = '<tr><td colspan="4">Erreur.</td></tr>'; return; }
  const data = await res.json();
  document.getElementById("liveStats").innerHTML = `
    <div class="stat"><div class="num">${data.total}</div><div>Inscrits</div></div>
    <div class="stat"><div class="num" style="color:#8FBE7A;">${data.present}</div><div>Présents</div></div>
    <div class="stat"><div class="num" style="color:#E0918F;">${data.absent}</div><div>Absents</div></div>`;
  const body = document.getElementById("liveBody");
  body.innerHTML = data.attendance.map((a) => `
    <tr>
      <td>${esc(a.matricule)}</td>
      <td>${esc(a.prenom)} ${esc(a.nom)}</td>
      <td><span class="tag t-${a.status}">${STATUS_FR[a.status]}</span></td>
      <td>${a.checkInTime ? new Date(a.checkInTime).toLocaleTimeString("fr-FR") : "—"}</td>
    </tr>`).join("");
}

async function loadAlerts() {
  if (!currentCourseId) return;
  const res = await api(`/attendance/alerts?courseId=${currentCourseId}`);
  if (!res || !res.ok) return;
  const { alerts } = await res.json();
  const body = document.getElementById("alertsBody");
  if (!alerts.length) { body.innerHTML = '<tr><td colspan="5" style="opacity:.7;">Aucun étudiant sous le seuil. 👍</td></tr>'; return; }
  body.innerHTML = alerts.map((a) => `
    <tr>
      <td>${a.student ? esc(a.student.matricule) : "—"}</td>
      <td>${a.student ? esc(a.student.prenom) + " " + esc(a.student.nom) : "—"}</td>
      <td>${a.total}</td>
      <td>${a.attended}</td>
      <td style="color:#E0918F;font-weight:700;">${a.rate}%</td>
    </tr>`).join("");
}

// Export CSV (avec en-tête Authorization → via blob)
async function exportCsv() {
  if (!currentCourseId) return;
  const date = document.getElementById("dateInput").value || todayStr();
  const res = await api(`/attendance/course/${currentCourseId}/export?date=${date}`);
  if (!res || !res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `presence_${currentCourseCode}_${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// WebSocket : pointages en direct
function connectWS() {
  const dot = document.getElementById("wsDot");
  const txt = document.getElementById("wsText");
  let ws;
  try { ws = new WebSocket(WS_URL); } catch { txt.textContent = "WS indisponible"; return; }
  ws.onopen = () => { dot.classList.remove("off"); txt.textContent = "Temps réel actif"; };
  ws.onclose = () => { dot.classList.add("off"); txt.textContent = "Reconnexion…"; setTimeout(connectWS, 4000); };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "attendanceUpdate" && msg.courseId === currentCourseId) {
        loadLive(); // rafraîchir la liste sur nouveau pointage
      }
    } catch { /* ignore */ }
  };
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
    if (tab.dataset.tab === "alerts") loadAlerts();
  };
});

document.getElementById("courseSelect").onchange = (e) => {
  currentCourseId = e.target.value;
  currentCourseCode = e.target.selectedOptions[0].dataset.code;
  loadLive();
};
document.getElementById("refreshLive").onclick = loadLive;
document.getElementById("exportBtn").onclick = exportCsv;
// --- Changement de mot de passe ---
const pwdModal = document.getElementById("pwdModal");
document.getElementById("pwdBtn").onclick = () => {
  document.getElementById("oldPwd").value = "";
  document.getElementById("newPwd").value = "";
  document.getElementById("confirmPwd").value = "";
  document.getElementById("pwdMsg").innerHTML = "";
  pwdModal.style.display = "flex";
};
document.getElementById("pwdClose").onclick = () => { pwdModal.style.display = "none"; };
document.getElementById("pwdSubmit").onclick = async () => {
  const oldPassword = document.getElementById("oldPwd").value;
  const newPassword = document.getElementById("newPwd").value;
  const confirm = document.getElementById("confirmPwd").value;
  const msg = document.getElementById("pwdMsg");
  if (!oldPassword || !newPassword) { msg.innerHTML = '<p style="color:#EAD3D0;">Tous les champs sont requis.</p>'; return; }
  if (newPassword !== confirm) { msg.innerHTML = '<p style="color:#EAD3D0;">Les deux nouveaux mots de passe ne correspondent pas.</p>'; return; }
  // fetch direct (pas via api()) : un mauvais mot de passe actuel renvoie 401,
  // qui ne doit PAS déconnecter l'utilisateur.
  const res = await fetch(API + "/auth/change-password", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    msg.innerHTML = '<p style="color:#8FBE7A;"><i class="fa-solid fa-circle-check"></i> Mot de passe modifié avec succès.</p>';
    setTimeout(() => { pwdModal.style.display = "none"; }, 1500);
  } else {
    msg.innerHTML = `<p style="color:#EAD3D0;">${esc(data.message || "Échec de la modification.")}</p>`;
  }
};

document.getElementById("logoutBtn").onclick = () => { localStorage.clear(); window.location.href = "index.html"; };

document.getElementById("dateInput").value = todayStr();
loadCourses();
connectWS();
