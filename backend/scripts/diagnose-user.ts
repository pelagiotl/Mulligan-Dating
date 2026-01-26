#!/usr/bin/env ts-node

/**
 * Diagnostic script to check why a user isn't appearing in browse results
 * Usage: npm run diagnose-user <your-user-id> <target-user-id>
 * Or: ts-node scripts/diagnose-user.ts <your-user-id> <target-user-id>
 */

import { db } from '../src/database.js';
import { geocodeLocation, calculateDistanceMiles } from '../src/utils/geocoding.js';
import { checkDealbreakers } from '../src/utils/dealbreakers.js';

interface ProfileRow {
  id: string;
  user_id: string;
  display_name: string;
  age: number;
  gender: string;
  location: string | null;
  bio: string | null;
  photo_url: string | null;
  looking_for: string | null;
}

async function diagnoseUser(userId: string, targetUserId: string) {
  console.log(`\n🔍 Diagnosing why user ${targetUserId} isn't appearing for user ${userId}\n`);

  // Get current user's profile and preferences
  const userProfile = await (db.prepare('SELECT * FROM profiles WHERE user_id = ?').get([userId]) as Promise<ProfileRow | undefined>);
  if (!userProfile) {
    console.error('❌ Your profile not found. Please complete your profile first.');
    return;
  }

  console.log(`✅ Your profile: ${userProfile.display_name} (age ${userProfile.age}, ${userProfile.gender})`);

  const userPrefs = await (db.prepare('SELECT * FROM preferences WHERE profile_id = ?').get([userProfile.id]) as Promise<{
    min_age: number;
    max_age: number;
    preferred_genders: string | null;
    max_distance: number;
  } | undefined>);

  if (userPrefs) {
    console.log(`   Preferences: Age ${userPrefs.min_age}-${userPrefs.max_age}, Max distance: ${userPrefs.max_distance} miles`);
    if (userPrefs.preferred_genders) {
      try {
        const genders = JSON.parse(userPrefs.preferred_genders);
        console.log(`   Preferred genders: ${genders.join(', ')}`);
      } catch {
        console.log(`   Preferred genders: ${userPrefs.preferred_genders}`);
      }
    }
  }

  // Get target user's profile
  const targetProfile = await (db.prepare('SELECT * FROM profiles WHERE user_id = ?').get([targetUserId]) as Promise<ProfileRow | undefined>);
  if (!targetProfile) {
    console.error(`❌ Target user profile not found for user ID: ${targetUserId}`);
    return;
  }

  console.log(`\n✅ Target profile: ${targetProfile.display_name} (age ${targetProfile.age}, ${targetProfile.gender})`);
  console.log(`   Location: ${targetProfile.location || 'Not set'}`);

  // Check if target user is restricted
  const targetUser = await (db.prepare('SELECT is_restricted FROM users WHERE id = ?').get([targetUserId]) as Promise<{ is_restricted: number | null } | undefined>);
  const isRestricted = targetUser?.is_restricted === 1;
  console.log(`\n📋 Filter Checks:\n`);
  console.log(`1. Account Restricted: ${isRestricted ? '❌ YES - Account is restricted' : '✅ NO'}`);

  // Check if already matched
  const existingMatch = await (db.prepare(
    `SELECT id FROM matches 
     WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)
     AND stage != 'expired'`
  ).get([userId, targetUserId, targetUserId, userId]) as Promise<{ id: string } | undefined>);
  const isAlreadyMatched = !!existingMatch;
  console.log(`2. Already Matched: ${isAlreadyMatched ? '❌ YES - Already matched' : '✅ NO'}`);

  // Check if blocked
  const blockedCheck = await (db.prepare(
    `SELECT id FROM blocks 
     WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`
  ).get([userId, targetUserId, targetUserId, userId]) as Promise<{ id: string } | undefined>);
  const isBlocked = !!blockedCheck;
  console.log(`3. Blocked: ${isBlocked ? '❌ YES - One of you blocked the other' : '✅ NO'}`);

  // Check age filter
  if (userPrefs?.min_age != null && userPrefs?.max_age != null) {
    const ageInRange = targetProfile.age >= userPrefs.min_age && targetProfile.age <= userPrefs.max_age;
    console.log(`4. Age Filter: ${ageInRange ? '✅ PASS' : '❌ FAIL'}`);
    if (!ageInRange) {
      console.log(`   Target age (${targetProfile.age}) is outside your range (${userPrefs.min_age}-${userPrefs.max_age})`);
    }
  } else {
    console.log(`4. Age Filter: ✅ PASS (no age preferences set)`);
  }

  // Check gender filter
  if (userPrefs?.preferred_genders) {
    try {
      const preferredGenders = JSON.parse(userPrefs.preferred_genders) as string[];
      if (preferredGenders.length > 0) {
        const genderMatch = preferredGenders.includes(targetProfile.gender);
        console.log(`5. Gender Filter: ${genderMatch ? '✅ PASS' : '❌ FAIL'}`);
        if (!genderMatch) {
          console.log(`   Target gender (${targetProfile.gender}) is not in your preferred genders (${preferredGenders.join(', ')})`);
        }
      } else {
        console.log(`5. Gender Filter: ✅ PASS (no gender preferences set)`);
      }
    } catch {
      console.log(`5. Gender Filter: ✅ PASS (could not parse preferences)`);
    }
  } else {
    console.log(`5. Gender Filter: ✅ PASS (no gender preferences set)`);
  }

  // Check distance filter
  if (userProfile.location && targetProfile.location && userPrefs?.max_distance) {
    try {
      const userLoc = await geocodeLocation(userProfile.location);
      const targetLoc = await geocodeLocation(targetProfile.location);
      if (userLoc.coordinates && targetLoc.coordinates) {
        const distance = calculateDistanceMiles(userLoc.coordinates, targetLoc.coordinates);
        const distancePass = distance <= userPrefs.max_distance;
        console.log(`6. Distance Filter: ${distancePass ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`   Distance: ${distance.toFixed(1)} miles (max: ${userPrefs.max_distance} miles)`);
      } else {
        console.log(`6. Distance Filter: ⚠️  Could not calculate distance`);
      }
    } catch (error) {
      console.log(`6. Distance Filter: ⚠️  Error calculating distance: ${error}`);
    }
  } else {
    console.log(`6. Distance Filter: ✅ PASS (no distance filter applied)`);
  }

  // Check dealbreakers
  const dealbreakersPass = await checkDealbreakers(userProfile.id, targetProfile.id);
  console.log(`7. Dealbreakers: ${dealbreakersPass ? '✅ PASS' : '❌ FAIL'}`);
  if (!dealbreakersPass) {
    const userDealbreakers = await (db.prepare('SELECT description FROM dealbreakers WHERE profile_id = ?').all([userProfile.id]) as Promise<{ description: string }[]>);
    console.log(`   Your dealbreakers: ${userDealbreakers.map(d => d.description).join(', ') || 'None'}`);
    console.log(`   Target matches one or more of your dealbreakers`);
  }

  // Summary
  const allChecksPass = !isRestricted && !isAlreadyMatched && !isBlocked && 
                       (!userPrefs || (targetProfile.age >= (userPrefs.min_age || 0) && targetProfile.age <= (userPrefs.max_age || 99))) &&
                       (!userPrefs?.preferred_genders || (() => {
                         try {
                           const genders = JSON.parse(userPrefs.preferred_genders);
                           return genders.length === 0 || genders.includes(targetProfile.gender);
                         } catch {
                           return true;
                         }
                       })()) &&
                       dealbreakersPass;

  console.log(`\n${'='.repeat(60)}`);
  if (allChecksPass) {
    console.log(`✅ RESULT: This user SHOULD appear in your browse results`);
  } else {
    console.log(`❌ RESULT: This user is being FILTERED OUT`);
    console.log(`\n💡 To fix: Adjust your preferences or remove dealbreakers that match this user`);
  }
  console.log(`${'='.repeat(60)}\n`);
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: ts-node scripts/diagnose-user.ts <your-user-id> <target-user-id>');
    console.error('Example: ts-node scripts/diagnose-user.ts abc123 def456');
    process.exit(1);
  }

  const [userId, targetUserId] = args;
  diagnoseUser(userId, targetUserId)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export { diagnoseUser };



