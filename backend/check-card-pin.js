const mongoose = require("mongoose");
require("dotenv").config();

const Card = require("./models/Card");

async function checkCardPin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connecté");

    const cardUID = "043477E76E";
    const card = await Card.findOne({ uid: cardUID });

    if (!card) {
      console.error("❌ Carte non trouvée");
      return;
    }

    console.log(`📊 Carte ID: ${card._id}`);
    console.log(`📊 UID: ${card.uid}`);
    console.log(`📊 PIN défini: ${!!card.pin}`);
    console.log(`📊 PIN (début): ${card.pin ? card.pin.substring(0, 20) + '...' : 'AUCUN'}`);

  } catch (error) {
    console.error("❌ Erreur:", error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkCardPin();