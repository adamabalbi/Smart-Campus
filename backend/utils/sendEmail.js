const nodemailer = require("nodemailer");

// Parse "Nom <email@domaine.com>" → { name, email }
function parseFrom(from) {
  const m = (from || "").match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || "Smart Campus", email: m[2].trim() };
  return { name: "Smart Campus", email: (from || "").trim() };
}

// --- Envoi via API HTTP Brevo (fonctionne sur le cloud : port 443) ---
// Render (et la plupart des hébergeurs gratuits) BLOQUENT le SMTP sortant (587/465).
// On utilise donc l'API HTTP de Brevo quand BREVO_API_KEY est défini.
async function sendViaBrevo({ to, subject, text }) {
  const sender = parseFrom(process.env.EMAIL_FROM || process.env.EMAIL_USER);
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "Content-Type": "application/json",
      "accept": "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      textContent: text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json().catch(() => ({}));
  console.log("Email envoyé (Brevo) :", data.messageId || "ok");
  return true;
}

// --- Envoi via SMTP (nodemailer) — pour le développement local ---
async function sendViaSmtp({ to, subject, text }) {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: Number(process.env.EMAIL_PORT) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    text,
  });
  console.log("Email envoyé (SMTP) :", info.messageId);
  return true;
}

const sendEmail = async ({ to, subject, text }) => {
  try {
    // Priorité à Brevo si configuré (indispensable sur le cloud).
    if (process.env.BREVO_API_KEY) {
      return await sendViaBrevo({ to, subject, text });
    }
    return await sendViaSmtp({ to, subject, text });
  } catch (error) {
    console.error("Erreur envoi email :", error.message);
    throw new Error("Impossible d'envoyer l'email OTP.");
  }
};

module.exports = sendEmail;
