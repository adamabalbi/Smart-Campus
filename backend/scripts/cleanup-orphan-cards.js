const mongoose = require('mongoose');
const Student = require('../models/Student');
const Card = require('../models/Card');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
require('dotenv').config();

async function cleanupOrphans() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connexion MongoDB établie\n');
    console.log('🧹 Recherche des cartes orphelines...\n');

    const cards = await Card.find();
    let deleted = { cards: 0, wallets: 0, transactions: 0 };

    for (const card of cards) {
      const student = await Student.findById(card.studentId);

      if (!student) {
        console.log(`🗑️  Carte orpheline: ${card.cardNumber} (UID: ${card.uid})`);

        const txRes = await Transaction.deleteMany({ cardId: card._id });
        const walletRes = await Wallet.deleteMany({ cardId: card._id });
        await Card.deleteOne({ _id: card._id });

        deleted.transactions += txRes.deletedCount;
        deleted.wallets += walletRes.deletedCount;
        deleted.cards += 1;

        console.log(`   - Transactions: ${txRes.deletedCount}, Portefeuilles: ${walletRes.deletedCount}\n`);
      }
    }

    console.log('📊 RÉSUMÉ:');
    console.log(`   💳 Cartes orphelines supprimées: ${deleted.cards}`);
    console.log(`   💰 Portefeuilles supprimés:      ${deleted.wallets}`);
    console.log(`   🧾 Transactions supprimées:      ${deleted.transactions}`);

    if (deleted.cards === 0) console.log('\n✨ Aucune carte orpheline trouvée.');
    else console.log('\n✅ Nettoyage des orphelines terminé.');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

cleanupOrphans();