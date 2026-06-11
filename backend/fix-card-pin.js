const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const Card = require("./models/Card");
const Student = require("./models/Student");

async function fixCardPin() {
  try {
    console.log("🔗 Connexion à MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connecté");

    // Trouver la carte avec l'UID problématique
    const cardUID = "043477E76E";
    console.log(`🔍 Recherche de la carte avec UID: ${cardUID}`);

    const card = await Card.findOne({ uid: cardUID }).populate('studentId');
    if (!card) {
      console.error(`❌ Carte avec UID ${cardUID} non trouvée`);
      return;
    }

    console.log(`✅ Carte trouvée: ${card._id}`);
    console.log(`📊 PIN actuel: ${card.pinHash ? 'Défini' : '❌ NON DÉFINI'}`);

    if (!card.pinHash) {
      console.log(`🔧 Création d'un PIN par défaut...`);

      // Créer un PIN par défaut "1234" (changeable par l'étudiant)
      const defaultPin = "1234";
      console.log(`🔧 Hashage du PIN "${defaultPin}"...`);
      const hashedPin = await bcrypt.hash(defaultPin, 12);
      console.log(`🔧 PIN hashé: ${hashedPin}`);

      console.log(`🔧 Mise à jour de la carte...`);
      const updateResult = await Card.updateOne(
        { _id: card._id },
        { pinHash: hashedPin }
      );
      console.log(`🔧 Résultat de la mise à jour:`, updateResult);

      // Vérification immédiate
      const updatedCard = await Card.findById(card._id);
      console.log(`🔧 Vérification - PIN défini après update: ${!!updatedCard.pinHash}`);

      console.log(`✅ PIN par défaut créé: ${defaultPin}`);
      console.log(`⚠️  L'étudiant devra changer ce PIN par défaut`);
    } else {
      console.log(`✅ PIN déjà défini pour cette carte`);
    }

  } catch (error) {
    console.error("❌ Erreur:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Connexion fermée");
  }
}

fixCardPin();