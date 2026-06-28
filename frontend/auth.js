const API = (window.SMART_CAMPUS_CONFIG && window.SMART_CAMPUS_CONFIG.API_BASE_URL) || "http://localhost:5000/api";

const _stored = JSON.parse(localStorage.getItem("user") || "null");
if (localStorage.getItem("token") && _stored) {
  const _role = _stored.role;
  if (_role === "student") window.location.href = "student.html";
  else if (_role === "service_scolarite") window.location.href = "scolarite.html";
  else if (_role === "finance_agent") window.location.href = "finance.html";
  else if (_role === "instructor") window.location.href = "enseignant.html";
  else if (_role === "payment_agent") window.location.href = "payment-agent.html";
  else window.location.href = "dashboard.html";
}

let pendingUserId = null;

const loginForm  = document.getElementById("loginForm");
const otpForm    = document.getElementById("otpForm");
const loginAlert = document.getElementById("loginAlert");
const otpAlert   = document.getElementById("otpAlert");
const otpHint    = document.getElementById("otpHint");
const loginBtn   = document.getElementById("loginBtn");
const otpBtn     = document.getElementById("otpBtn");

function alert(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginAlert.classList.add("hidden");
  loginBtn.disabled = true;
  loginBtn.textContent = "Connexion...";

  try {
    const turnstileToken = document.querySelector('#loginForm [name="cf-turnstile-response"]')?.value || "";

    const res  = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email:    document.getElementById("email").value.trim(),
        password: document.getElementById("password").value,
        turnstileToken,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      // Jeton Turnstile à usage unique : on le réinitialise pour le prochain essai
      if (window.turnstile) try { window.turnstile.reset(); } catch {}
      alert(loginAlert, data.message);
      return;
    }

    pendingUserId = data.userId;
    otpHint.textContent = `Code envoyé à ${data.email}`;
    loginForm.classList.add("hidden");
    otpForm.classList.remove("hidden");
    document.getElementById("otpCode").focus();
  } catch {
    alert(loginAlert, "Erreur réseau — vérifiez que le serveur est démarré.");
  } finally {
    loginBtn.disabled  = false;
    loginBtn.textContent = "Se connecter";
  }
});

otpForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  otpAlert.classList.add("hidden");
  otpBtn.disabled = true;
  otpBtn.textContent = "Vérification...";

  try {
    const res  = await fetch(`${API}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId:  pendingUserId,
        otpCode: document.getElementById("otpCode").value.trim(),
      }),
    });
    const data = await res.json();

    if (!res.ok) { alert(otpAlert, data.message); return; }

    localStorage.setItem("token", data.token);
    localStorage.setItem("user",  JSON.stringify(data.user));
    const role = data.user.role;
    if (role === "student")           window.location.href = "student.html";
    else if (role === "service_scolarite") window.location.href = "scolarite.html";
    else if (role === "finance_agent") window.location.href = "finance.html";
    else if (role === "instructor") window.location.href = "enseignant.html";
    else if (role === "payment_agent") window.location.href = "payment-agent.html";
    else                              window.location.href = "dashboard.html";
  } catch {
    alert(otpAlert, "Erreur réseau.");
  } finally {
    otpBtn.disabled  = false;
    otpBtn.textContent = "Vérifier";
  }
});

document.getElementById("backBtn").addEventListener("click", () => {
  pendingUserId = null;
  otpForm.classList.add("hidden");
  loginForm.classList.remove("hidden");
  otpAlert.classList.add("hidden");
});
