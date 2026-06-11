const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const Card = require('../models/Card');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
require('dotenv').config();

// Emails des comptes de test NFC à supprimer
const emailsToDelete = [
  // anciens emails (au cas où non migrés)
  'jean.dupont@campus.edu',
  'marie.martin@campus.edu',
  'test.admin@campus.edu',
  // emails migrés
  'smartcampus.demos+jean@gmail.com',
  'smartcampus.demos+marie@gmail.com',
  'smartcampus.demos+testadmin@gmail.com',
];

async function cleanup() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connexion MongoDB établie\n');
    console.log('🧹 Nettoyage des comptes de test NFC...\n');

    let totalDeleted = { users: 0, students: 0, cards: 0, wallets: 0, transactions: 0 };

    for (const email of emailsToDelete) {
      const user = await User.findOne({ email });
      const student = await Student.findOne({ email });

      if (!user && !student) {
        continue; // rien pour cet email
      }

      const studentId = student?._id;
      console.log(`🗑️  Suppression: ${email}`);

      // Supprimer les données liées à l'étudiant
      if (studentId) {
        const txRes = await Transaction.deleteMany({ studentId });
        const cardRes = await Card.deleteMany({ studentId });
        const walletRes = await Wallet.deleteMany({ studentId });

        totalDeleted.transactions += txRes.deletedCount;
        totalDeleted.cards += cardRes.deletedCount;
        totalDeleted.wallets += walletRes.deletedCount;

        console.log(`   - Transactions: ${txRes.deletedCount}`);
        console.log(`   - Cartes:       ${cardRes.deletedCount}`);
        console.log(`   - Portefeuilles:${walletRes.deletedCount}`);
      }

      // Supprimer l'étudiant
      if (student) {
        await Student.deleteOne({ _id: student._id });
        totalDeleted.students += 1;
        console.log(`   - Étudiant supprimé`);
      }

      // Supprimer l'utilisateur
      if (user) {
        await User.deleteOne({ _id: user._id });
        totalDeleted.users += 1;
        console.log(`   - Utilisateur supprimé`);
      }

      console.log('');
    }

    console.log('📊 RÉSUMÉ DU NETTOYAGE:');
    console.log(`   👤 Utilisateurs supprimés:  ${totalDeleted.users}`);
    console.log(`   🎓 Étudiants supprimés:     ${totalDeleted.students}`);
    console.log(`   💳 Cartes supprimées:       ${totalDeleted.cards}`);
    console.log(`   💰 Portefeuilles supprimés: ${totalDeleted.wallets}`);
    console.log(`   🧾 Transactions supprimées: ${totalDeleted.transactions}`);

    if (Object.values(totalDeleted).every(v => v === 0)) {
      console.log('\n✨ Rien à supprimer — base déjà propre.');
    } else {
      console.log('\n✅ Nettoyage terminé. Vous pouvez recréer vos étudiants.');
    }

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

cleanup();