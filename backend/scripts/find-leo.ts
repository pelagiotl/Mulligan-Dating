#!/usr/bin/env ts-node

/**
 * Script to find Leo's account in the database
 */

import { db } from '../src/database.js';

async function findLeo() {
  console.log('\n🔍 Searching for Leo in the database...\n');

  // Search by display name
  const profilesByName = await (db.prepare(`
    SELECT p.user_id, p.display_name, p.age, p.gender, p.location, u.email, u.created_at
    FROM profiles p
    JOIN users u ON u.id = p.user_id
    WHERE LOWER(p.display_name) LIKE '%leo%'
    ORDER BY p.display_name
  `).all([]) as Promise<Array<{
    user_id: string;
    display_name: string;
    age: number;
    gender: string;
    location: string | null;
    email: string;
    created_at: string;
  }>>);

  console.log(`Found ${profilesByName.length} profile(s) with "leo" in the name:`);
  profilesByName.forEach(p => {
    console.log(`  - ${p.display_name} (${p.age}, ${p.gender}) - ${p.email} - ID: ${p.user_id}`);
  });

  // Search by email
  const usersByEmail = await (db.prepare(`
    SELECT u.id, u.email, p.display_name, p.age, p.gender
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE LOWER(u.email) LIKE '%leo%'
    ORDER BY u.created_at DESC
  `).all([]) as Promise<Array<{
    id: string;
    email: string;
    display_name: string | null;
    age: number | null;
    gender: string | null;
  }>>);

  if (usersByEmail.length > 0) {
    console.log(`\nFound ${usersByEmail.length} user(s) with "leo" in email:`);
    usersByEmail.forEach(u => {
      if (u.display_name) {
        console.log(`  - ${u.display_name} - ${u.email} - ID: ${u.id}`);
      } else {
        console.log(`  - (No profile) - ${u.email} - ID: ${u.id}`);
      }
    });
  }

  // List all profiles for reference
  console.log('\n📋 All profiles in database:');
  const allProfiles = await (db.prepare(`
    SELECT p.display_name, p.age, p.gender, u.email, u.id as user_id
    FROM profiles p
    JOIN users u ON u.id = p.user_id
    ORDER BY p.display_name
  `).all([]) as Promise<Array<{
    display_name: string;
    age: number;
    gender: string;
    email: string;
    user_id: string;
  }>>);

  allProfiles.forEach(p => {
    console.log(`  - ${p.display_name} (${p.age}, ${p.gender}) - ${p.email}`);
  });

  console.log('\n');
}

if (require.main === module) {
  findLeo()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export { findLeo };



