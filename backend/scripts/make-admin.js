// Script to make a user an admin
// Usage: node scripts/make-admin.js <email>

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../mulligan.db');
const db = new Database(dbPath);

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/make-admin.js <email>');
  process.exit(1);
}

const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);

if (!user) {
  console.error(`❌ User with email "${email}" not found`);
  process.exit(1);
}

db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);

console.log(`✅ User "${email}" is now an admin!`);
db.close();

