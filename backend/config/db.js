const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    console.log("🔗 Tentative de connexion à MongoDB...");
    console.log("🌐 URI (masquée):", process.env.MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log(`✅ MongoDB connecté : ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ Erreur de connexion MongoDB :`);
    console.error(`   Type: ${error.name}`);
    console.error(`   Message: ${error.message}`);

    if (error.name === 'MongoNetworkError') {
      console.error(`💡 Solutions possibles :`);
      console.error(`   1. Vérifiez votre connexion internet`);
      console.error(`   2. Vérifiez que l'IP est autorisée dans MongoDB Atlas`);
      console.error(`   3. Vérifiez que le cluster n'est pas en pause`);
      console.error(`   4. Vérifiez les credentials MongoDB`);
    }

    process.exit(1);
  }
};

module.exports = connectDB;