// Espace enseignant — gestion des présences (liste live + alertes + export).
const API = (window.SMART_CAMPUS_CONFIG && window.SMART_CAMPUS_CONFIG.API_BASE_URL) || "http://localhost:5000/api";
const WS_URL = (window.SMART_CAMPUS_CONFIG && window.SMART_CAMPUS_CONFIG.WS_BASE_URL) || "ws://localhost:5000";
const token = localStorage.getItem("token");
if (!token) window.location.href = "index.html";

const STATUS_FR = { present: "Présent", late: "Retard", absent: "Absent", excused: "Excusé" };
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
  sel.innerHTML = courses.map((c) => `<option value="${c._id}" data-code="${c.code}">${c.code} — ${c.name}</option>`).join("");
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
      <td>${a.matricule}</td>
      <td>${a.prenom} ${a.nom}</td>
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
      <td>${a.student ? a.student.matricule : "—"}</td>
      <td>${a.student ? a.student.prenom + " " + a.student.nom : "—"}</td>
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
document.getElementById("logoutBtn").onclick = () => { localStorage.clear(); window.location.href = "index.html"; };

document.getElementById("dateInput").value = todayStr();
loadCourses();
connectWS();
