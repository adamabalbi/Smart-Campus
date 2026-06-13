const mongoose = require("mongoose");

// Connexion MongoDB avec retry automatique (utile sur le cloud où Atlas
// peut mettre quelques secondes à accepter la connexion au démarrage).
const connectDB = async (retries = 5, delayMs = 5000) => {
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI manquant. Définissez-le dans l'environnement (.env ou dashboard cloud).");
    process.exit(1);
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔗 Tentative de connexion à MongoDB (${attempt}/${retries})...`);
      console.log("🌐 URI (masquée):", process.env.MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));

      const conn = await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      console.log(`✅ MongoDB connecté : ${conn.connection.host}`);
      return conn;
    } catch (error) {
      console.error(`❌ Erreur de connexion MongoDB (tentative ${attempt}/${retries}) :`);
      console.error(`   Type: ${error.name}`);
      console.error(`   Message: ${error.message}`);

      if (error.name === 'MongoNetworkError') {
        console.error(`💡 Solutions possibles :`);
        console.error(`   1. Vérifiez votre connexion internet`);
        console.error(`   2. Vérifiez que l'IP est autorisée dans MongoDB Atlas (0.0.0.0/0 pour le cloud)`);
        console.error(`   3. Vérifiez que le cluster n'est pas en pause`);
        console.error(`   4. Vérifiez les credentials MongoDB`);
      }

      if (attempt < retries) {
        console.log(`⏳ Nouvelle tentative dans ${delayMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        console.error("🛑 Impossible de se connecter à MongoDB après plusieurs tentatives. Arrêt.");
        process.exit(1);
      }
    }
  }
};

module.exports = connectDB;
