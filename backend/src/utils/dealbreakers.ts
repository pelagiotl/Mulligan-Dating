import { db } from "../database.js";
import { CANONICAL_DEALBREAKER_LOWERCASE } from "../constants/profilePickLists.js";

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

function norm(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .trim();
}

/**
 * Dealbreaker semantics: each dealbreaker means "I don't want to match with people who [X]".
 * Returns true if the candidate is allowed, false if they should be excluded.
 *
 * Lifestyle strings follow the web profile editor (`MyProfile` / `LIFESTYLE_FIELD_OPTIONS`).
 */
export async function checkDealbreakers(userProfileId: string, candidateProfileId: string): Promise<boolean> {
  const userDealbreakersResult = db
    .prepare("SELECT description FROM dealbreakers WHERE profile_id = ?")
    .all([userProfileId]);
  const userDealbreakers = (userDealbreakersResult instanceof Promise
    ? await userDealbreakersResult
    : userDealbreakersResult) as { description: string }[];

  if (userDealbreakers.length === 0) {
    return true;
  }

  const candidateProfileResult = db
    .prepare("SELECT * FROM profiles WHERE id = ?")
    .get([candidateProfileId]);
  const candidateProfile = (candidateProfileResult instanceof Promise
    ? await candidateProfileResult
    : candidateProfileResult) as ProfileRow | undefined;

  if (!candidateProfile) {
    return false;
  }

  const candidateInterestsResult = db
    .prepare("SELECT name FROM interests WHERE profile_id = ?")
    .all([candidateProfileId]);
  const candidateInterests = (candidateInterestsResult instanceof Promise
    ? await candidateInterestsResult
    : candidateInterestsResult) as { name: string }[];

  const candidateInterestsArray = Array.isArray(candidateInterests) ? candidateInterests : [];

  const candidateDealbreakersResult = db
    .prepare("SELECT description FROM dealbreakers WHERE profile_id = ?")
    .all([candidateProfileId]);
  const candidateDealbreakers = (candidateDealbreakersResult instanceof Promise
    ? await candidateDealbreakersResult
    : candidateDealbreakersResult) as { description: string }[];

  const candidateDealbreakersArray = Array.isArray(candidateDealbreakers) ? candidateDealbreakers : [];

  const candidateLifestyleResult = db
    .prepare("SELECT * FROM lifestyle WHERE profile_id = ?")
    .get([candidateProfileId]);
  const candidateLifestyle = (candidateLifestyleResult instanceof Promise
    ? await candidateLifestyleResult
    : candidateLifestyleResult) as {
      smoking: string | null;
      drinking: string | null;
      children: string | null;
      pets: string | null;
      religion: string | null;
      political: string | null;
      work_life_balance: string | null;
      works_out: string | null;
    } | undefined;

  const candidateInterestsText = candidateInterestsArray.map((i: { name: string }) => i.name).join(" ");
  const candidateText = `${candidateProfile.bio || ""} ${candidateProfile.display_name || ""} ${candidateProfile.location || ""} ${candidateInterestsText}`.toLowerCase();

  for (const dealbreaker of userDealbreakers) {
    const dealbreakerLower = norm(dealbreaker.description);

    const candidateHasSameDealbreaker = candidateDealbreakersArray.some(
      (db: { description: string }) => norm(db.description) === dealbreakerLower
    );
    if (candidateHasSameDealbreaker) {
      continue;
    }

    if (candidateLifestyle) {
      // Cigarettes / tobacco (UI: Smoker, Social smoker, …)
      if (
        (dealbreakerLower === "smokes cigarettes" ||
          dealbreakerLower === "smoking" ||
          dealbreakerLower === "smokes") &&
        candidateLifestyle.smoking
      ) {
        const s = norm(candidateLifestyle.smoking);
        if (s === "smoker" || s === "social smoker") {
          return false;
        }
      }

      // Cannabis — no dedicated lifestyle field; use interests + legacy smoking text
      if (dealbreakerLower === "marijuana") {
        const interestHit = candidateInterestsArray.some((i) => {
          const n = norm(i.name);
          return (
            n === "marijuana" ||
            n === "cannabis" ||
            n === "weed" ||
            n.includes("marijuana") ||
            n.includes("cannabis")
          );
        });
        const smokingHint = norm(candidateLifestyle.smoking);
        if (interestHit || smokingHint.includes("marijuana") || smokingHint === "both") {
          return false;
        }
      }

      // Drinking (UI: Non-drinker, Socially, Regularly, …)
      if (dealbreakerLower === "frequent drinking" && candidateLifestyle.drinking) {
        const d = norm(candidateLifestyle.drinking);
        if (d === "regularly") {
          return false;
        }
      }

      if (dealbreakerLower === "heavy drinking" && candidateLifestyle.drinking) {
        const d = norm(candidateLifestyle.drinking);
        if (d === "regularly" || d === "socially") {
          return false;
        }
      }

      // Children (UI: "Don't want kids", "Want kids", …)
      if (
        (dealbreakerLower === "doesn't want children" || dealbreakerLower === "doesn't want kids") &&
        candidateLifestyle.children
      ) {
        const c = norm(candidateLifestyle.children);
        if (c === "don't want kids" || c === "doesn't want kids") {
          return false;
        }
      }

      if (
        (dealbreakerLower === "wants children" ||
          dealbreakerLower === "wants kids" ||
          dealbreakerLower === "wants kids soon") &&
        candidateLifestyle.children
      ) {
        const c = norm(candidateLifestyle.children);
        if (c === "don't want kids" || c === "doesn't want kids") {
          return false;
        }
      }

      // Fitness (UI: Daily, Often, Sometimes, Rarely)
      if (
        (dealbreakerLower === "doesn't workout" || dealbreakerLower === "doesn't work out") &&
        candidateLifestyle.works_out
      ) {
        const w = norm(candidateLifestyle.works_out);
        if (w === "rarely" || w === "sometimes") {
          return false;
        }
      }

      // Pets (UI includes "No pets")
      if (dealbreakerLower === "doesn't like pets" && candidateLifestyle.pets) {
        const p = norm(candidateLifestyle.pets);
        if (p === "no pets" || p.includes("don't like")) {
          return false;
        }
      }

      // Legacy / extra rows still stored in DB
      if (dealbreakerLower === "drinks alcohol" && candidateLifestyle.drinking) {
        const d = norm(candidateLifestyle.drinking);
        if (d === "socially" || d === "regularly" || d === "social drinker" || d === "occasionally" || d === "frequently") {
          return false;
        }
      }

      if (dealbreakerLower === "allergic to pets" && candidateLifestyle.pets) {
        const p = norm(candidateLifestyle.pets);
        if (p === "love pets" || p === "open to pets") {
          return false;
        }
      }

      if (dealbreakerLower === "religious" && candidateLifestyle.religion) {
        const r = norm(candidateLifestyle.religion);
        if (r === "very important" || r === "somewhat important" || r === "spiritual not religious") {
          return false;
        }
      }

      if (dealbreakerLower === "not religious" && candidateLifestyle.religion) {
        const r = norm(candidateLifestyle.religion);
        if (r === "not important") {
          return false;
        }
      }

      // Politics — same importance-style answers as web `political` lifestyle field
      if (dealbreakerLower === "political" && candidateLifestyle.political) {
        const p = norm(candidateLifestyle.political);
        if (p === "very important" || p === "somewhat important") {
          return false;
        }
      }

      if (dealbreakerLower === "workaholic" && candidateLifestyle.work_life_balance) {
        const b = norm(candidateLifestyle.work_life_balance);
        if (b === "career-focused" || b === "workaholic") {
          return false;
        }
      }
    }

    const candidateHasInInterests = candidateInterestsArray.some(
      (i: { name: string }) => norm(i.name) === dealbreakerLower
    );
    if (candidateHasInInterests) {
      return false;
    }

    // Keyword fallback only for non-canonical chips (avoids brittle substring matches on curated list)
    if (CANONICAL_DEALBREAKER_LOWERCASE.has(dealbreakerLower)) {
      continue;
    }

    const keywords = dealbreakerLower.split(/\s+/).filter((k) => k.length > 2);
    if (keywords.length > 0 && keywords.some((keyword) => candidateText.includes(keyword))) {
      const exactMatch = candidateText.includes(dealbreakerLower);
      if (exactMatch || keywords.every((k) => candidateText.includes(k))) {
        const negationPatterns = ["non-", "doesn't", "don't", "won't", "not ", "never ", "no "];
        const hasNegation = negationPatterns.some(
          (neg) => candidateText.includes(neg + dealbreakerLower) || candidateText.includes(neg + keywords[0])
        );
        if (!hasNegation) {
          return false;
        }
      }
    }
  }

  return true;
}
