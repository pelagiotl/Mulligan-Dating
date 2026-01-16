/**
 * Create 5 test user accounts for testing matching functionality
 * Run with: npx tsx scripts/create-test-users.ts
 * 
 * Note: Make sure DATABASE_URL is set in your .env file if using PostgreSQL
 */

import 'dotenv/config';
import { db } from '../src/database.js';
import { v4 as uuidv4 } from 'uuid';

const testUsers = [
  {
    name: 'Alex',
    age: 28,
    gender: 'Male',
    location: 'San Francisco, CA',
    bio: 'Love hiking, coffee, and good conversations. Looking for someone to explore the city with!',
    lookingFor: 'Long-term relationship',
    interests: ['Hiking', 'Coffee', 'Photography', 'Travel', 'Yoga'],
    phone: '+15551234567'
  },
  {
    name: 'Jordan',
    age: 26,
    gender: 'Female',
    location: 'Los Angeles, CA',
    bio: 'Foodie, bookworm, and adventure seeker. Always up for trying something new!',
    lookingFor: 'Friendship or more',
    interests: ['Reading', 'Cooking', 'Travel', 'Movies', 'Fitness'],
    phone: '+15551234568'
  },
  {
    name: 'Sam',
    age: 30,
    gender: 'Non-binary',
    location: 'New York, NY',
    bio: 'Artist, musician, and creative soul. Love deep conversations and meaningful connections.',
    lookingFor: 'Meaningful connection',
    interests: ['Art', 'Music', 'Writing', 'Meditation', 'Dancing'],
    phone: '+15551234569'
  },
  {
    name: 'Taylor',
    age: 25,
    gender: 'Female',
    location: 'Austin, TX',
    bio: 'Tech enthusiast, dog lover, and weekend explorer. Let\'s build something amazing together!',
    lookingFor: 'Long-term relationship',
    interests: ['Technology', 'Dogs', 'Outdoor Activities', 'Gaming', 'Cooking'],
    phone: '+15551234570'
  },
  {
    name: 'Casey',
    age: 29,
    gender: 'Male',
    location: 'Seattle, WA',
    bio: 'Coffee snob, music producer, and nature enthusiast. Looking for my person!',
    lookingFor: 'Serious relationship',
    interests: ['Music', 'Coffee', 'Nature', 'Photography', 'Cooking'],
    phone: '+15551234571'
  }
];

async function createTestUsers() {
  console.log('🚀 Creating 5 test user accounts...\n');

  for (const userData of testUsers) {
    try {
      const userId = uuidv4();
      const profileId = uuidv4();
      const now = new Date().toISOString();

      // Create user
      const userStmt = db.prepare(`
        INSERT INTO users (
          id, phone_number, phone_verified, browse_unlocked_at, 
          tos_accepted_at, privacy_accepted_at, created_at, last_active_at
        ) VALUES (?, ?, 1, ?, ?, ?, ?, ?)
      `);
      
      await (userStmt.run([
        userId,
        userData.phone,
        now, // browse_unlocked_at - so they can be browsed
        now, // tos_accepted_at
        now, // privacy_accepted_at
        now, // created_at
        now  // last_active_at
      ]) as Promise<any>);

      console.log(`✅ Created user: ${userData.name} (${userData.phone})`);

      // Create profile
      const profileStmt = db.prepare(`
        INSERT INTO profiles (
          id, user_id, display_name, age, gender, location, bio, looking_for, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      await (profileStmt.run([
        profileId,
        userId,
        userData.name,
        userData.age,
        userData.gender,
        userData.location,
        userData.bio,
        userData.lookingFor,
        now,
        now
      ]) as Promise<any>);

      console.log(`   ✅ Created profile for ${userData.name}`);

      // Create preferences (so they show up in browse)
      const preferencesId = uuidv4();
      const preferencesStmt = db.prepare(`
        INSERT INTO preferences (
          id, profile_id, min_age, max_age, preferred_genders, max_distance
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      // Set reasonable preferences
      const minAge = Math.max(18, userData.age - 5);
      const maxAge = userData.age + 5;
      const preferredGenders = JSON.stringify(['Male', 'Female', 'Non-binary']); // Open to all

      await (preferencesStmt.run([
        preferencesId,
        profileId,
        minAge,
        maxAge,
        preferredGenders,
        50 // 50 miles max distance
      ]) as Promise<any>);

      console.log(`   ✅ Created preferences for ${userData.name}`);

      // Create interests
      for (const interest of userData.interests) {
        const interestId = uuidv4();
        const interestStmt = db.prepare(`
          INSERT INTO interests (id, profile_id, name, category)
          VALUES (?, ?, ?, 'general')
        `);

        await (interestStmt.run([interestId, profileId, interest]) as Promise<any>);
      }

      console.log(`   ✅ Added ${userData.interests.length} interests for ${userData.name}`);

      // Grant a token so they can browse too
      const tokenId = uuidv4();
      const tokenStmt = db.prepare(`
        INSERT INTO mulligan_tokens (id, user_id, granted_at, source)
        VALUES (?, ?, ?, 'test_account')
      `);

      await (tokenStmt.run([tokenId, userId, now, 'test_account']) as Promise<any>);

      console.log(`   ✅ Granted token to ${userData.name}\n`);

    } catch (error: any) {
      console.error(`❌ Error creating user ${userData.name}:`, error.message);
      // Continue with next user
    }
  }

  console.log('🎉 Done! Created 5 test user accounts.');
  console.log('\n📝 Test accounts created:');
  testUsers.forEach((user, index) => {
    console.log(`   ${index + 1}. ${user.name} - ${user.phone}`);
  });
  console.log('\n💡 These accounts are now available for matching!');
}

// Run the script
createTestUsers().catch(console.error);

