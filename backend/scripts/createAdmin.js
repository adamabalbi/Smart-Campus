const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const readline = require("readline");

dotenv.config({ path: require("path").resolve(__dirname, "../.env") });

const User = require("../models/User");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (question) =>
  new Promise((resolve) => rl.question(question, resolve));

const createAdmin = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connecté.\n");

  const existingSuperAdmin = await User.findOne({ role: "super_admin" });
  if (existingSuperAdmin) {
    console.log(
      `Un super-admin existe déjà : ${existingSuperAdmin.email}. Opération annulée.`
    );
    await mongoose.disconnect();
    rl.close();
    return;
  }

  console.log("=== Création du premier super-admin ===\n");

  const nom = (await ask("Nom : ")).trim();
  const prenom = (await ask("Prénom : ")).trim();
  const email = (await ask("Email : ")).trim().toLowerCase();
  const password = (await ask("Mot de passe (min. 8 caractères) : ")).trim();

  if (!nom || !prenom || !email || !password) {
    console.log("Tous les champs sont obligatoires.");
    await mongoose.disconnect();
    rl.close();
    return;
  }

  if (password.length < 8) {
    console.log("Le mot de passe doit contenir au moins 8 caractères.");
    await mongoose.disconnect();
    rl.close();
    return;
  }

  const existing = await User.findOne({ email });
  if (existing) {
    console.log("Cet email est déjà utilisé.");
    await mongoose.disconnect();
    rl.close();
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const admin = await User.create({
    nom,
    prenom,
    email,
    password: hashedPassword,
    role: "super_admin",
    status: "active",
    mustChangePassword: false,
  });

  console.log(`\nSuper-admin créé avec succès.`);
  console.log(`  ID    : ${admin._id}`);
  console.log(`  Email : ${admin.email}`);
  console.log(`  Rôle  : ${admin.role}`);
  console.log(`\nCe super-admin peut créer des admins et des agents via POST /api/auth/users.`);

  await mongoose.disconnect();
  rl.close();
};

createAdmin().catch((err) => {
  console.error("Erreur :", err.message);
  process.exit(1);
});
