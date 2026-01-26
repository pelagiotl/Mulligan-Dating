/**
 * Script to download a message notification sound
 * Run with: node scripts/download-message-sound.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Free notification sound URL (short, pleasant message notification sound)
// This is a free-to-use notification sound
const SOUND_URL = 'https://notificationsounds.com/storage/sounds/notification-sounds-5880.mp3';
const OUTPUT_PATH = path.join(__dirname, '../assets/message-sound.mp3');

console.log('📥 Downloading message notification sound...');
console.log(`   From: ${SOUND_URL}`);
console.log(`   To: ${OUTPUT_PATH}`);

const file = fs.createWriteStream(OUTPUT_PATH);

https.get(SOUND_URL, (response) => {
  if (response.statusCode === 200) {
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      const stats = fs.statSync(OUTPUT_PATH);
      console.log(`✅ Successfully downloaded message-sound.mp3 (${(stats.size / 1024).toFixed(2)} KB)`);
      console.log('   File saved to: mobile/assets/message-sound.mp3');
      console.log('   The sound will be automatically bundled with your app!');
    });
  } else if (response.statusCode === 301 || response.statusCode === 302) {
    // Handle redirect
    console.log('🔄 Following redirect...');
    https.get(response.headers.location, (redirectResponse) => {
      redirectResponse.pipe(file);
      file.on('finish', () => {
        file.close();
        const stats = fs.statSync(OUTPUT_PATH);
        console.log(`✅ Successfully downloaded message-sound.mp3 (${(stats.size / 1024).toFixed(2)} KB)`);
        console.log('   File saved to: mobile/assets/message-sound.mp3');
      });
    });
  } else {
    console.error(`❌ Failed to download: HTTP ${response.statusCode}`);
    console.log('\n📝 Alternative: Download a sound manually from:');
    console.log('   - https://freesound.org/ (search "message notification")');
    console.log('   - https://mixkit.co/free-sound-effects/notification/');
    console.log('   - https://notificationsounds.com/');
    console.log('\n   Then save it as: mobile/assets/message-sound.mp3');
    process.exit(1);
  }
}).on('error', (err) => {
  console.error(`❌ Error downloading sound: ${err.message}`);
  console.log('\n📝 Alternative: Download a sound manually from:');
  console.log('   - https://freesound.org/ (search "message notification")');
  console.log('   - https://mixkit.co/free-sound-effects/notification/');
  console.log('   - https://notificationsounds.com/');
  console.log('\n   Then save it as: mobile/assets/message-sound.mp3');
  process.exit(1);
});





