/**
 * Script to grant tokens to a user by phone number
 * Usage: npx tsx scripts/grant-tokens.ts <phoneNumber> <tokenCount>
 * Example: npx tsx scripts/grant-tokens.ts +15413163939 10
 */

import 'dotenv/config';
import { db } from '../src/database.js';
import { v4 as uuidv4 } from 'uuid';

const phoneNumber = process.argv[2];
const tokenCount = parseInt(process.argv[3]) || 5;

if (!phoneNumber) {
  console.error('❌ Phone number is required');
  console.log('Usage: npx tsx scripts/grant-tokens.ts <phoneNumber> <tokenCount>');
  console.log('Example: npx tsx scripts/grant-tokens.ts +15413163939 10');
  process.exit(1);
}

async function grantTokens() {
  try {
    // Normalize phone number (add + if not present)
    const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber.replace(/\D/g, '')}`;
    
    console.log(`🔍 Looking for user with phone number: ${normalizedPhone}`);
    
    // Find user by phone number
    const userResult = db.prepare('SELECT id, phone_number FROM users WHERE phone_number = ?').get([normalizedPhone]);
    const user = (userResult instanceof Promise ? await userResult : userResult) as { id: string; phone_number: string } | undefined;
    
    if (!user) {
      console.error(`❌ User not found with phone number: ${normalizedPhone}`);
      console.log('💡 Make sure the phone number is in the format: +15413163939');
      process.exit(1);
    }
    
    console.log(`✅ Found user: ${user.id}`);
    console.log(`🎟️  Granting ${tokenCount} token(s)...`);
    
    const grantedTokenIds: string[] = [];
    
    // Grant tokens
    for (let i = 0; i < tokenCount; i++) {
      const tokenId = uuidv4();
      const insertResult = db.prepare(
        `INSERT INTO mulligan_tokens (id, user_id, source) VALUES (?, ?, 'admin')`
      ).run([tokenId, user.id]);
      
      if (insertResult instanceof Promise) {
        await insertResult;
      }
      
      grantedTokenIds.push(tokenId);
    }
    
    console.log(`✅ Successfully granted ${tokenCount} token(s) to user ${user.id}`);
    console.log(`📋 Token IDs: ${grantedTokenIds.join(', ')}`);
    
    // Check current token count
    const tokensResult = db.prepare(
      `SELECT COUNT(*) as count FROM mulligan_tokens 
       WHERE user_id = ? AND used_at IS NULL AND returned_at IS NULL`
    ).get([user.id]);
    
    const tokenCountResult = (tokensResult instanceof Promise ? await tokensResult : tokensResult) as { count: number };
    console.log(`📊 User now has ${tokenCountResult.count} available token(s)`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error granting tokens:', error);
    process.exit(1);
  }
}

grantTokens();

