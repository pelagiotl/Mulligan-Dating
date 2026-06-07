/** Funnel counts for why Connect browse returned nobody. */
export type BrowsePoolFunnel = {
  /** Active non-expired matches this user already has. */
  activeMatchCount: number;
  /** After SQL age/gender + excluding matched/blocked/hidden. */
  afterPreferencesQuery: number;
  /** After Southern Oregon + max distance. */
  afterRegionDistance: number;
  /** After mutual "who I want to connect with" prefs. */
  afterMutualGender: number;
  /** After mutual dealbreakers / lifestyle. */
  afterDealbreakers: number;
  /** After weekly incoming cap on candidates. */
  afterIncomingCap: number;
};

export type BrowsePoolSummary = BrowsePoolFunnel & {
  eligible: number;
  hint: string | null;
};

export function buildBrowsePoolSummary(funnel: BrowsePoolFunnel): BrowsePoolSummary {
  const eligible = funnel.afterIncomingCap;
  return {
    ...funnel,
    eligible,
    hint: eligible > 0 ? null : buildBrowsePoolHint(funnel),
  };
}

export function buildBrowsePoolHint(f: BrowsePoolFunnel): string {
  if (f.afterIncomingCap > 0) return '';

  if (f.afterPreferencesQuery === 0) {
    if (f.activeMatchCount >= 5) {
      return "Nice work — you've built a full lineup already. New people are joining every day; we'll surface your next match here when someone's a fit. Your Matches tab is a great place to keep conversations going.";
    }
    return 'No profiles match your age or gender preferences. Try widening age range or preferred matches in Profile.';
  }

  if (f.afterRegionDistance < f.afterPreferencesQuery) {
    return 'People may be outside Southern Oregon or your max distance. Set distance to 100 mi in Profile and confirm your city & state.';
  }

  if (f.afterMutualGender < f.afterRegionDistance) {
    return 'Few mutual gender matches — confirm your gender on Profile and that others want to connect with you.';
  }

  if (f.afterDealbreakers < f.afterMutualGender) {
    return 'Dealbreakers or lifestyle answers may be filtering people out. Review Dealbreakers on Profile.';
  }

  if (f.afterIncomingCap < f.afterDealbreakers) {
    return 'Several people hit their weekly incoming limit. Check back later this week as more spots open.';
  }

  if (f.activeMatchCount >= 3) {
    return `You have ${f.activeMatchCount} active matches — you may have connected with everyone available in your area for now.`;
  }

  return 'No new matches right now. Check back soon as more people join.';
}

export function formatBrowsePoolSummaryForAdmin(
  displayName: string,
  summary: BrowsePoolSummary,
): string {
  const lines = [
    `${displayName}: ${summary.eligible} eligible in Connect pool`,
    `  Active matches: ${summary.activeMatchCount}`,
    `  After age/gender query: ${summary.afterPreferencesQuery}`,
    `  After region/distance: ${summary.afterRegionDistance}`,
    `  After mutual gender prefs: ${summary.afterMutualGender}`,
    `  After dealbreakers: ${summary.afterDealbreakers}`,
    `  After incoming weekly cap: ${summary.afterIncomingCap}`,
  ];
  if (summary.hint) lines.push(`  Hint: ${summary.hint}`);
  return lines.join('\n');
}
