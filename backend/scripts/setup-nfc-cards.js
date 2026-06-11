const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();

// Modèles
const Card = require('../models/Card');
const Student = require('../models/Student');
const User = require('../models/User');
const Wallet = require('../models/Wallet');

// Configuration des cartes réelles
const testCards = [
  {
    uid: "a89fb4ef", // UID réel de votre carte 1
    pin: "1234",
    student: {
      matricule: "ETU001",
      nom: "Dupont",
      prenom: "Jean",
      email: "jean.dupont@campus.edu",
      filiere: "Informatique",
      niveau: "Licence 3"
    }
  },
  {
    uid: "b8d4e0ef", // UID réel de votre carte 2
    pin: "5678",
    student: {
      matricule: "ETU002",
      nom: "Martin",
      prenom: "Marie",
      email: "marie.martin@campus.edu",
      filiere: "Gestion",
      niveau: "Master 1"
    }
  },
  {
    uid: "b840cdef", // UID réel de votre carte 3
    pin: "9999",
    student: {
      matricule: "ETU003",
      nom: "Admin",
      prenom: "Test",
      email: "test.admin@campus.edu",
      filiere: "Administration",
      niveau: "Personnel"
    }
  }
];

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connexion MongoDB établie');
  } catch (error) {
    console.error('❌ Erreur connexion MongoDB:', error);
    process.exit(1);
  }
}

async function createUser(studentData) {
  try {
    // Vérifier si l'utilisateur existe déjà
    let user = await User.findOne({ email: studentData.email });

    if (user) {
      console.log(`👤 Utilisateur ${studentData.email} existe déjà`);
      return user;
    }

    // Créer un nouvel utilisateur
    const tempPassword = 'Campus2024!'; // Mot de passe temporaire
    const hashedPassword = bcrypt.hashSync(tempPassword, 10);

    user = new User({
      nom: studentData.nom,
      prenom: studentData.prenom,
      email: studentData.email,
      password: hashedPassword,
      role: 'student',
      status: 'active',
      mustChangePassword: true
    });

    await user.save();
    console.log(`✅ Utilisateur créé: ${user.email} (mot de passe: ${tempPassword})`);
    return user;

  } catch (error) {
    console.error('❌ Erreur création utilisateur:', error);
    throw error;
  }
}

async function createStudent(userData, studentData) {
  try {
    // Vérifier si l'étudiant existe déjà
    let student = await Student.findOne({ matricule: studentData.matricule });

    if (student) {
      console.log(`🎓 Étudiant ${studentData.matricule} existe déjà`);
      return student;
    }

    // Créer un nouvel étudiant
    student = new Student({
      userId: userData._id,
      matricule: studentData.matricule,
      nom: studentData.nom,
      prenom: studentData.prenom,
      email: studentData.email,
      filiere: studentData.filiere,
      niveau: studentData.niveau,
      status: 'active',
      statutScolarite: 'en_regle'
    });

    await student.save();
    console.log(`✅ Étudiant créé: ${student.matricule}`);
    return student;

  } catch (error) {
    console.error('❌ Erreur création étudiant:', error);
    throw error;
  }
}

async function createCard(studentData, cardData) {
  try {
    // Vérifier si la carte existe déjà
    const uidHash = crypto.createHash('sha256').update(cardData.uid).digest('hex');
    let card = await Card.findOne({ uidHash: uidHash });

    if (card) {
      console.log(`💳 Carte ${cardData.uid} existe déjà`);
      return card;
    }

    // Créer une nouvelle carte
    const pinHash = bcrypt.hashSync(cardData.pin, 10);

    card = new Card({
      studentId: studentData._id,
      uid: cardData.uid,
      uidHash: uidHash,
      cardNumber: `NFC-${studentData.matricule}`,
      type: "MIFARE_CLASSIC_1K",
      pinHash: pinHash,
      nfcEnabled: true,
      status: 'active',
      mustChangePIN: false, // PIN déjà défini
      nfcMetadata: {
        securityLevel: 'medium',
        readerType: 'ACR122U-A9',
        readCount: 0
      }
    });

    await card.save();
    console.log(`✅ Carte NFC créée: ${card.cardNumber} (PIN: ${cardData.pin})`);
    console.log(`   UID: ${cardData.uid}`);
    console.log(`   Hash: ${uidHash.substring(0, 16)}...`);
    return card;

  } catch (error) {
    console.error('❌ Erreur création carte:', error);
    throw error;
  }
}

async function createWallet(studentData, cardData) {
  try {
    // Vérifier si le portefeuille existe déjà
    let wallet = await Wallet.findOne({ studentId: studentData._id });

    if (wallet) {
      console.log(`💰 Portefeuille étudiant ${studentData.matricule} existe déjà`);
      return wallet;
    }

    // Créer un nouveau portefeuille
    wallet = new Wallet({
      studentId: studentData._id,
      cardId: cardData._id,
      balance: 5000, // Solde initial de test : 5000 XOF
      maxBalance: 100000, // 100,000 XOF max
      dailyLimit: 50000,  // 50,000 XOF/jour
      monthlyLimit: 500000, // 500,000 XOF/mois
      status: 'active'
    });

    await wallet.save();
    console.log(`✅ Portefeuille créé: ${wallet._id} (solde: ${wallet.balance} XOF)`);
    return wallet;

  } catch (error) {
    console.error('❌ Erreur création portefeuille:', error);
    throw error;
  }
}

async function setupTestCards() {
  console.log('🚀 Configuration des cartes NFC de test...\n');

  for (let i = 0; i < testCards.length; i++) {
    const testCard = testCards[i];
    console.log(`📋 Configuration carte ${i + 1}/${testCards.length}:`);
    console.log(`   UID: ${testCard.uid}`);
    console.log(`   Étudiant: ${testCard.student.prenom} ${testCard.student.nom}`);

    try {
      // 1. Créer l'utilisateur
      const user = await createUser(testCard.student);

      // 2. Créer l'étudiant
      const student = await createStudent(user, testCard.student);

      // 3. Créer la carte NFC
      const card = await createCard(student, testCard);

      // 4. Créer le portefeuille
      const wallet = await createWallet(student, card);

      console.log('✅ Configuration complète pour', testCard.student.prenom);
      console.log('─'.repeat(50));

    } catch (error) {
      console.error(`❌ Erreur configuration carte ${i + 1}:`, error);
      console.log('─'.repeat(50));
    }
  }
}

async function displaySummary() {
  console.log('\n📊 RÉSUMÉ DES CARTES CONFIGURÉES:\n');

  const cards = await Card.find({ nfcEnabled: true })
    .populate('studentId');

  for (const card of cards) {
    console.log(`💳 Carte: ${card.cardNumber}`);
    console.log(`   👤 Étudiant: ${card.studentId.prenom} ${card.studentId.nom}`);
    console.log(`   📧 Email: ${card.studentId.email}`);
    console.log(`   🔑 UID: ${card.uid}`);
    console.log(`   🔐 Status: ${card.status}`);
    console.log(`   📅 Créée: ${card.issuedAt.toLocaleDateString('fr-FR')}`);

    // Récupérer le portefeuille
    const wallet = await Wallet.findOne({ studentId: card.studentId._id });
    if (wallet) {
      console.log(`   💰 Solde: ${wallet.balance.toLocaleString('fr-FR')} XOF`);
    }

    console.log('');
  }

  console.log('🎯 PROCHAINES ÉTAPES:');
  console.log('1. Démarrer le serveur avec: ENABLE_NFC=true npm start');
  console.log('2. Ouvrir le kiosque: http://localhost:5000/frontend/kiosk-nfc.html');
  console.log('3. Tester avec les cartes configurées ci-dessus');
  console.log('4. Modifier les UID dans ce script avec vos vraies cartes');
  console.log('\n💡 Pour lire l\'UID de vos cartes physiques:');
  console.log('   node scripts/read-card-uid.js');
}

// Point d'entrée principal
async function main() {
  try {
    await connectDB();
    await setupTestCards();
    await displaySummary();

  } catch (error) {
    console.error('❌ Erreur générale:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Configuration terminée!');
  }
}

// Gestion des arguments de ligne de commande
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
📖 USAGE: node scripts/setup-nfc-cards.js [options]

OPTIONS:
  --help, -h     Afficher cette aide
  --clean        Supprimer les cartes existantes avant de recréer
  --dry-run      Simuler sans créer en base

EXEMPLES:
  node scripts/setup-nfc-cards.js
  node scripts/setup-nfc-cards.js --clean
  node scripts/setup-nfc-cards.js --dry-run

⚠️  IMPORTANT: Modifiez les UID dans le script avant l'exécution!
`);
  process.exit(0);
}

if (process.argv.includes('--dry-run')) {
  console.log('🔍 MODE SIMULATION - Aucune modification en base');
  console.log('Cartes qui seraient créées:');
  testCards.forEach((card, i) => {
    console.log(`${i + 1}. ${card.student.prenom} ${card.student.nom} - UID: ${card.uid}`);
  });
  process.exit(0);
}

// Exécution
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testCards, setupTestCards };