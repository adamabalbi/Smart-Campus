const { NFC } = require('nfc-pcsc');

console.log('🔍 LECTEUR D\'UID DE CARTES NFC');
console.log('==============================\n');

async function readCardUIDs() {
  const nfc = new NFC();
  let readCount = 0;
  const discoveredCards = new Set();

  console.log('📖 Démarrage du lecteur ACR122U-A9...');
  console.log('💳 Approchez vos cartes NFC une par une\n');
  console.log('⌨️  Appuyez sur Ctrl+C pour arrêter\n');

  nfc.on('reader', reader => {
    console.log(`✅ Lecteur connecté: ${reader.name}`);
    console.log('👀 En attente de cartes...\n');

    reader.on('card', card => {
      readCount++;
      const uid = card.uid;

      if (discoveredCards.has(uid)) {
        console.log(`🔄 Carte déjà lue: ${uid} (ignorée)`);
        return;
      }

      discoveredCards.add(uid);

      console.log(`📋 CARTE ${discoveredCards.size} DÉTECTÉE:`);
      console.log(`   🆔 UID: ${uid}`);
      console.log(`   📱 Type: ${card.type || 'Inconnu'}`);
      console.log(`   📊 ATR: ${card.atr ? card.atr.toString('hex') : 'N/A'}`);
      console.log(`   ⏱️  Timestamp: ${new Date().toLocaleString('fr-FR')}\n`);

      // Tentative de lecture des données
      reader.read(4, 16).then(data => {
        console.log(`   📄 Données (bloc 4): ${data.toString('hex')}`);
      }).catch(() => {
        console.log(`   📄 Données: Carte vierge ou protégée`);
      });

      console.log(`   🔧 Configuration pour setup-nfc-cards.js:`);
      console.log(`   uid: "${uid}",\n`);

      console.log('─'.repeat(50));
      console.log('💡 Retirez la carte et approchez la suivante\n');
    });

    reader.on('card.off', card => {
      console.log(`📤 Carte retirée: ${card.uid.substring(0, 8)}...\n`);
    });

    reader.on('error', err => {
      console.error(`❌ Erreur lecteur:`, err.message);
    });
  });

  nfc.on('error', err => {
    console.error('❌ Erreur NFC:', err.message);
    console.log('\n🔧 SOLUTIONS POSSIBLES:');
    console.log('• Vérifiez que le lecteur ACR122U est connecté');
    console.log('• Réinstallez les drivers du lecteur');
    console.log('• Testez avec un autre port USB');
    console.log('• Exécutez en tant qu\'administrateur (Windows)');
    process.exit(1);
  });

  // Gestion propre de l'arrêt
  process.on('SIGINT', () => {
    console.log('\n\n📊 RÉSUMÉ DE LA SESSION:');
    console.log(`   📈 Total lectures: ${readCount}`);
    console.log(`   💳 Cartes uniques: ${discoveredCards.size}\n`);

    if (discoveredCards.size > 0) {
      console.log('🔧 CODE À COPIER DANS setup-nfc-cards.js:');
      console.log('─'.repeat(50));
      console.log('const testCards = [');

      Array.from(discoveredCards).forEach((uid, index) => {
        console.log(`  {`);
        console.log(`    uid: "${uid}",`);
        console.log(`    pin: "${1234 + index}",`);
        console.log(`    student: {`);
        console.log(`      matricule: "ETU${String(index + 1).padStart(3, '0')}",`);
        console.log(`      nom: "Test${index + 1}",`);
        console.log(`      prenom: "Carte",`);
        console.log(`      email: "carte${index + 1}@campus.edu",`);
        console.log(`      filiere: "Test",`);
        console.log(`      niveau: "Demo"`);
        console.log(`    }`);
        console.log(`  }${index < discoveredCards.size - 1 ? ',' : ''}`);
      });

      console.log('];');
      console.log('─'.repeat(50));
    }

    console.log('\n🎯 PROCHAINES ÉTAPES:');
    console.log('1. Copiez les UID ci-dessus');
    console.log('2. Modifiez le fichier scripts/setup-nfc-cards.js');
    console.log('3. Exécutez: node scripts/setup-nfc-cards.js');
    console.log('\n✅ Arrêt du lecteur...');

    nfc.close().finally(() => {
      process.exit(0);
    });
  });

  // Information d'aide après 10 secondes
  setTimeout(() => {
    if (discoveredCards.size === 0) {
      console.log('💡 AIDE:');
      console.log('• Placez votre carte NFC près du lecteur');
      console.log('• La LED du lecteur doit s\'allumer');
      console.log('• Distance recommandée: 0-3 cm');
      console.log('• Évitez les objets métalliques à proximité\n');
    }
  }, 10000);
}

// Vérification des dépendances
try {
  require('nfc-pcsc');
} catch (error) {
  console.error('❌ Erreur: Module nfc-pcsc non trouvé');
  console.log('\n🔧 Installation requise:');
  console.log('cd backend && npm install nfc-pcsc\n');
  process.exit(1);
}

// Démarrage
readCardUIDs().catch(err => {
  console.error('❌ Erreur fatale:', err);
  process.exit(1);
});

// Aide en ligne de commande
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
📖 LECTEUR D'UID POUR CARTES NFC

USAGE:
  node scripts/read-card-uid.js

DESCRIPTION:
  Ce script utilise votre lecteur ACR122U-A9 pour lire les UID
  des cartes NFC que vous possédez. Les UID sont nécessaires
  pour configurer le système Smart Campus.

FONCTIONNEMENT:
  1. Le script démarre le lecteur NFC
  2. Approchez chaque carte une par une
  3. L'UID s'affiche automatiquement
  4. Ctrl+C pour arrêter et voir le résumé

PRÉREQUIS:
  • Lecteur ACR122U-A9 connecté
  • Drivers installés (automatique sur la plupart des OS)
  • Module nfc-pcsc installé (npm install nfc-pcsc)

EXEMPLE DE SORTIE:
  📋 CARTE 1 DÉTECTÉE:
     🆔 UID: 1A2B3C4D5E6F7890
     📱 Type: TAG_TYPE_2

DÉPANNAGE:
  • Erreur "Reader not found" → Vérifier connexion USB
  • Erreur "Permission denied" → Exécuter en admin/sudo
  • Carte non détectée → Rapprocher du lecteur (0-3cm)
`);
  process.exit(0);
}