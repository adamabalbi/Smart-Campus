const API = "http://localhost:5000/api";

document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const alert = document.getElementById("registerAlert");
  alert.classList.add("hidden");

  const btn = document.getElementById("registerBtn");
  btn.disabled    = true;
  btn.textContent = "Envoi en cours...";

  const body = {
    nom:    document.getElementById("rNom").value.trim(),
    prenom: document.getElementById("rPrenom").value.trim(),
    email:  document.getElementById("rEmail").value.trim(),
    filiere: document.getElementById("rFiliere").value.trim(),
    niveau:  document.getElementById("rNiveau").value.trim(),
  };

  const tel = document.getElementById("rTelephone").value.trim();
  const dep = document.getElementById("rDepartement").value.trim();
  if (tel) body.telephone   = tel;
  if (dep) body.departement = dep;

  try {
    const res  = await fetch(`${API}/registration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      alert.textContent = data.message;
      alert.classList.remove("hidden");
      return;
    }

    document.getElementById("confirmedEmail").textContent = body.email;
    document.getElementById("registerForm").classList.add("hidden");
    document.getElementById("successView").classList.remove("hidden");
  } catch {
    alert.textContent = "Erreur réseau — vérifiez que le serveur est démarré.";
    alert.classList.remove("hidden");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Soumettre la demande";
  }
});
