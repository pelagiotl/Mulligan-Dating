/** Golf Dates hole-prompt catalog — light (Front 9) + deeper (Back 9) pools. */

export type GolfPromptDepth = 'light' | 'deeper';

export type GolfPromptChoice = {
  id: string;
  label: string;
  tags: string[];
};

export type GolfPromptInsight = {
  tags: string[];
  copy: string;
};

export type GolfPrompt = {
  id: string;
  depth: GolfPromptDepth;
  text: string;
  choices: GolfPromptChoice[];
  insightTemplates: GolfPromptInsight[];
};

export const GOLF_HOLE_COUNT = 18;

function c(id: string, label: string, ...tags: string[]): GolfPromptChoice {
  return { id, label, tags };
}

function insight(copy: string, ...tags: string[]): GolfPromptInsight {
  return { tags, copy };
}

function prompt(
  id: string,
  depth: GolfPromptDepth,
  text: string,
  choices: GolfPromptChoice[],
  insightTemplates: GolfPromptInsight[] = [],
): GolfPrompt {
  return { id, depth, text, choices, insightTemplates };
}

const LIGHT: GolfPrompt[] = [
  prompt(
    'light-into-01',
    'light',
    'What first got you into golf (or wanting to try it)?',
    [
      c('a', 'Family / friends dragged me out', 'social', 'beginner-friendly'),
      c('b', 'Saw it on TV and had to try', 'curious'),
      c('c', 'Grew up around it', 'lifer'),
      c('d', 'Looking for a fun outdoor date vibe', 'date-first', 'social'),
    ],
    [insight('You both came for the people as much as the game.', 'social')],
  ),
  prompt(
    'light-memory-01',
    'light',
    'Best round (or golf memory) so far?',
    [
      c('a', 'First time I actually broke 100 / finished 9', 'milestone'),
      c('b', 'Sunset nine with good company', 'vibe', 'social'),
      c('c', 'One absurdly lucky shot', 'luck', 'fun'),
      c('d', 'Still collecting good ones', 'beginner-friendly'),
    ],
    [insight('You both chase the fun memories, not just the scorecard.', 'fun', 'vibe')],
  ),
  prompt(
    'light-time-01',
    'light',
    'Morning tee time or golden-hour nine?',
    [
      c('a', 'Early bird — coffee + first tee', 'morning'),
      c('b', 'Golden hour all day', 'evening', 'vibe'),
      c('c', 'Depends on the weekend', 'flexible'),
      c('d', 'Whenever I can get a tee time', 'flexible'),
    ],
    [
      insight('You both love morning tee times.', 'morning'),
      insight('You both prefer golden-hour golf.', 'evening'),
      insight('You’re both flexible on tee times — easy to plan.', 'flexible'),
    ],
  ),
  prompt(
    'light-ritual-01',
    'light',
    'Honest pre-round ritual?',
    [
      c('a', 'Stretch… or pretend to', 'casual'),
      c('b', 'Range balls until I feel it', 'practice'),
      c('c', 'Snack + playlist in the car', 'vibe', 'casual'),
      c('d', 'Show up and hope for the best', 'casual', 'fun'),
    ],
    [insight('Pre-round vibes > rigid routines for both of you.', 'casual')],
  ),
  prompt(
    'light-dream-01',
    'light',
    'Dream course you’d play together someday?',
    [
      c('a', 'Somewhere coastal and scenic', 'scenic', 'travel'),
      c('b', 'A bucket-list championship track', 'ambitious'),
      c('c', 'A chill local nine with a good patio', 'local', 'casual'),
      c('d', 'Anywhere we can laugh through it', 'fun', 'social'),
    ],
    [insight('You’re aligned on keeping golf fun first.', 'fun')],
  ),
  prompt(
    'light-compete-01',
    'light',
    'Competitive on the course — or more about the hang?',
    [
      c('a', 'Friendly competition wakes me up', 'competitive'),
      c('b', 'Mostly here for the hang', 'social', 'casual'),
      c('c', 'A little of both', 'balanced'),
      c('d', 'Only competitive with myself', 'self-focused'),
    ],
    [
      insight('You both like a little friendly heat.', 'competitive'),
      insight('You’re both here for the hang more than the score.', 'social', 'casual'),
      insight('Nice balance — competition without the ego.', 'balanced'),
    ],
  ),
  prompt(
    'light-pace-01',
    'light',
    'Biggest golf pet peeve?',
    [
      c('a', 'Slow play', 'pace', 'hate-slow'),
      c('b', 'Lost balls taking forever', 'pace'),
      c('c', 'Overly serious vibes', 'casual', 'fun'),
      c('d', 'Bad weather excuses mid-round', 'fun'),
    ],
    [
      insight('You both hate slow play.', 'hate-slow', 'pace'),
      insight('You both protect the vibe over perfection.', 'fun', 'casual'),
    ],
  ),
  prompt(
    'light-walk-01',
    'light',
    'Walking or riding?',
    [
      c('a', 'Walk when I can', 'walk'),
      c('b', 'Cart life', 'cart'),
      c('c', 'Walk 9, cart 18', 'flexible', 'nine'),
      c('d', 'Whatever the group wants', 'flexible', 'social'),
    ],
    [
      insight('You both prefer walking.', 'walk'),
      insight('You both like carts.', 'cart'),
      insight('You’re both flexible on walk vs cart.', 'flexible'),
    ],
  ),
  prompt(
    'light-nine-01',
    'light',
    'Ideal first golf date length?',
    [
      c('a', 'Quick 9', 'nine', 'first-date'),
      c('b', 'Full 18 if the vibe’s there', 'eighteen'),
      c('c', 'Range + drinks first', 'casual', 'first-date'),
      c('d', '9 + patio hang after', 'nine', 'social', 'first-date'),
    ],
    [
      insight('You both prefer keeping first dates to 9 holes.', 'nine', 'first-date'),
      insight('You both like easing in before a full round.', 'casual', 'first-date'),
    ],
  ),
  prompt(
    'light-snack-01',
    'light',
    'Must-bring on a golf date?',
    [
      c('a', 'Extra balls (obviously)', 'prepared'),
      c('b', 'Snacks / cold drinks', 'snacks', 'social'),
      c('c', 'Good playlist energy', 'vibe'),
      c('d', 'Patience and a sense of humor', 'fun', 'casual'),
    ],
    [insight('Snacks (and patience) matter to you both.', 'snacks', 'fun')],
  ),
  prompt(
    'light-mulligan-01',
    'light',
    'Mulligans on a first date — yes or nah?',
    [
      c('a', 'One freebie each', 'mulligan', 'casual'),
      c('b', 'Play it as it lies', 'strict'),
      c('c', 'Unlimited if we’re laughing', 'fun', 'casual'),
      c('d', 'Only on the first tee', 'mulligan'),
    ],
    [
      insight('You’re both mulligan-friendly.', 'mulligan', 'casual'),
      insight('You both like keeping it light and funny.', 'fun'),
    ],
  ),
  prompt(
    'light-music-01',
    'light',
    'Cart playlist vibe?',
    [
      c('a', 'Upbeat / summer hits', 'music', 'fun'),
      c('b', 'Country / Americana', 'music'),
      c('c', 'Quiet — birds only', 'quiet', 'focus'),
      c('d', 'Whatever keeps the energy up', 'music', 'flexible'),
    ],
    [insight('Music (or quiet) preferences lined up nicely.', 'music', 'quiet')],
  ),
  prompt(
    'light-weather-01',
    'light',
    'Ideal golf weather?',
    [
      c('a', 'Crisp and clear', 'weather'),
      c('b', 'Warm with a breeze', 'weather', 'vibe'),
      c('c', 'I’ll play in almost anything', 'hardy'),
      c('d', 'Cancel if it’s miserable', 'comfort'),
    ],
    [insight('You’re on the same page about weather thresholds.', 'weather', 'comfort', 'hardy')],
  ),
  prompt(
    'light-photo-01',
    'light',
    'Selfie on the tee box?',
    [
      c('a', 'Absolutely', 'photo', 'social'),
      c('b', 'Only if the light’s good', 'photo'),
      c('c', 'Maybe after a good hole', 'photo', 'casual'),
      c('d', 'I’d rather just be present', 'present'),
    ],
    [insight('You both get the photo vs presence balance.', 'photo', 'present')],
  ),
  prompt(
    'light-drink-01',
    'light',
    'Post-round ritual?',
    [
      c('a', 'Patio / clubhouse hang', 'social', 'patio'),
      c('b', 'Quick debrief then go', 'efficient'),
      c('c', 'Food run nearby', 'food', 'social'),
      c('d', 'Range for “one more”', 'practice'),
    ],
    [
      insight('You both like hanging after the round.', 'social', 'patio'),
      insight('You both appreciate a good post-round bite.', 'food', 'social'),
    ],
  ),
  prompt(
    'light-shot-01',
    'light',
    'Most satisfying shot shape?',
    [
      c('a', 'Pure iron that just sits', 'feel'),
      c('b', 'Big drive down the middle', 'power'),
      c('c', 'Clutch short-game save', 'scramble'),
      c('d', 'Any shot that doesn’t find trouble', 'survival', 'fun'),
    ],
    [insight('You celebrate the same kind of golf moments.', 'feel', 'power', 'scramble', 'fun')],
  ),
  prompt(
    'light-partner-01',
    'light',
    'Best golf-date partner trait?',
    [
      c('a', 'Patient when I spray one', 'patient', 'kind'),
      c('b', 'Keeps the banter going', 'social', 'fun'),
      c('c', 'Shows up prepared', 'prepared'),
      c('d', 'Doesn’t take themselves too seriously', 'casual', 'fun'),
    ],
    [insight('You want the same kind of golf-date energy.', 'fun', 'patient', 'casual')],
  ),
  prompt(
    'light-local-01',
    'light',
    'Southern Oregon spot that puts you in a good mood?',
    [
      c('a', 'A local course / range', 'local', 'golf'),
      c('b', 'Outdoors / trail energy', 'outdoors'),
      c('c', 'Coffee + sunshine downtown', 'local', 'casual'),
      c('d', 'Anywhere with a view', 'scenic'),
    ],
    [insight('You both light up around local outdoor energy.', 'local', 'outdoors', 'scenic')],
  ),
  prompt(
    'light-tee-01',
    'light',
    'Which tees are we playing?',
    [
      c('a', 'Forward / fun tees', 'forward', 'casual'),
      c('b', 'Middle — fair fight', 'middle'),
      c('c', 'Back if we’re feeling spicy', 'back', 'competitive'),
      c('d', 'Mix it — one each', 'flexible', 'fun'),
    ],
    [insight('You’re aligned on keeping the tees fun.', 'forward', 'flexible', 'casual')],
  ),
  prompt(
    'light-lost-01',
    'light',
    'Lost ball protocol?',
    [
      c('a', 'Quick look, then drop', 'pace'),
      c('b', 'I’ll help you hunt', 'helpful', 'social'),
      c('c', 'Provisional immediately', 'pace', 'prepared'),
      c('d', 'Comedy commentary required', 'fun'),
    ],
    [insight('You both value pace (and good humor) when balls go missing.', 'pace', 'fun')],
  ),
  prompt(
    'light-range-01',
    'light',
    'Range before the round?',
    [
      c('a', 'Always — need the feel', 'practice'),
      c('b', 'A few swings is enough', 'casual'),
      c('c', 'Skip it, save energy', 'efficient'),
      c('d', 'Putting green > full range', 'short-game'),
    ],
    [insight('Warm-up styles are compatible.', 'practice', 'casual', 'short-game')],
  ),
  prompt(
    'light-score-01',
    'light',
    'Keeping score on a date round?',
    [
      c('a', 'Yes — but keep it light', 'score', 'casual'),
      c('b', 'No cards — just vibes', 'noscore', 'fun'),
      c('c', 'Only if we both want to', 'flexible'),
      c('d', 'Team scramble score only', 'social', 'fun'),
    ],
    [
      insight('You’re both fine skipping the pressure of a card.', 'noscore', 'fun'),
      insight('You both like a light scorecard, not a tournament.', 'score', 'casual'),
    ],
  ),
  prompt(
    'light-advice-01',
    'light',
    'Unsolicited swing tips mid-round?',
    [
      c('a', 'Hard pass', 'no-tips'),
      c('b', 'Only if I ask', 'ask-first', 'kind'),
      c('c', 'Gentle tips are okay', 'tips-ok'),
      c('d', 'Roast me lovingly', 'fun', 'banter'),
    ],
    [
      insight('You both prefer asking before coaching.', 'ask-first', 'no-tips'),
      insight('Banter over lectures — nice.', 'fun', 'banter'),
    ],
  ),
  prompt(
    'light-cart-girl-01',
    'light',
    'Snack cart rolls up — what’s the move?',
    [
      c('a', 'Treats for the group', 'generous', 'social'),
      c('b', 'Just a drink', 'simple'),
      c('c', 'I’m stocked already', 'prepared'),
      c('d', 'Whatever looks fun', 'fun', 'spontaneous'),
    ],
    [insight('You’re both down for a little mid-round treat energy.', 'fun', 'social', 'generous')],
  ),
  prompt(
    'light-dress-01',
    'light',
    'Golf fit energy?',
    [
      c('a', 'Classic and tidy', 'classic'),
      c('b', 'Comfy over fancy', 'casual'),
      c('c', 'A little drippy', 'style', 'fun'),
      c('d', 'Whatever’s clean', 'casual', 'simple'),
    ],
    [insight('Style expectations won’t clash on the first tee.', 'casual', 'classic', 'style')],
  ),
  prompt(
    'light-joke-01',
    'light',
    'Worst golf joke you’ve heard (or told)?',
    [
      c('a', 'I’ve told too many', 'fun', 'banter'),
      c('b', 'I laugh at all of them', 'fun', 'kind'),
      c('c', 'Please spare me', 'quiet'),
      c('d', 'Dad jokes only', 'fun'),
    ],
    [insight('Humor levels look compatible.', 'fun', 'banter')],
  ),
  prompt(
    'light-birdie-01',
    'light',
    'How do you celebrate a birdie (or a personal best hole)?',
    [
      c('a', 'Quiet fist pump', 'humble'),
      c('b', 'Full celebration', 'expressive', 'fun'),
      c('c', 'Act cool, grin later', 'humble', 'fun'),
      c('d', 'Buy the next snack', 'generous', 'social'),
    ],
    [insight('You celebrate wins in compatible ways.', 'fun', 'humble', 'expressive')],
  ),
  prompt(
    'light-rain-01',
    'light',
    'Light rain mid-round?',
    [
      c('a', 'Keep playing', 'hardy'),
      c('b', 'Finish the nine', 'nine', 'flexible'),
      c('c', 'Call it and grab coffee', 'comfort', 'social'),
      c('d', 'Depends who I’m with', 'social', 'flexible'),
    ],
    [insight('Weather call-offs won’t be a fight.', 'hardy', 'comfort', 'flexible')],
  ),
  prompt(
    'light-first-01',
    'light',
    'First-tee nerves — how do you handle them?',
    [
      c('a', 'Laugh it off', 'fun', 'casual'),
      c('b', 'Deep breath + commit', 'focus'),
      c('c', 'I narrate my own chaos', 'fun', 'banter'),
      c('d', 'Fake confidence until real', 'fun'),
    ],
    [insight('You’re both human on the first tee.', 'fun', 'casual')],
  ),
  prompt(
    'light-phone-01',
    'light',
    'Phones on the course?',
    [
      c('a', 'Silent / pocketed', 'present'),
      c('b', 'Photos only', 'photo', 'present'),
      c('c', 'Quick checks are fine', 'flexible'),
      c('d', 'I’m pretty offline out here', 'present'),
    ],
    [insight('You both value being present on the course.', 'present')],
  ),
  prompt(
    'light-scramble-01',
    'light',
    'Best format for a golf date?',
    [
      c('a', 'Casual stroke play', 'stroke', 'casual'),
      c('b', 'Scramble / team up', 'scramble', 'social'),
      c('c', 'Alternate shot (chaos)', 'fun'),
      c('d', 'No format — just play', 'casual', 'fun'),
    ],
    [
      insight('You’re both into teaming up on the course.', 'scramble', 'social'),
      insight('Keeping it casual works for both of you.', 'casual', 'fun'),
    ],
  ),
  prompt(
    'light-speed-01',
    'light',
    'Ready golf — yay or nay?',
    [
      c('a', 'Always — keep it moving', 'pace', 'hate-slow'),
      c('b', 'When the group’s cool with it', 'flexible', 'pace'),
      c('c', 'I like traditional order', 'traditional'),
      c('d', 'Whatever keeps us laughing', 'fun', 'pace'),
    ],
    [insight('You both care about pace of play.', 'pace', 'hate-slow')],
  ),
  prompt(
    'light-sunset-01',
    'light',
    'Favorite part of a round together?',
    [
      c('a', 'The banter between shots', 'social', 'banter'),
      c('b', 'The scenery', 'scenic'),
      c('c', 'The little wins', 'fun'),
      c('d', 'The hang afterward', 'social', 'patio'),
    ],
    [insight('You both show up for connection, not just golf.', 'social', 'fun')],
  ),
  prompt(
    'light-club-01',
    'light',
    'If you could only bring 3 clubs…?',
    [
      c('a', 'Driver, wedge, putter', 'simple'),
      c('b', '7-iron does everything', 'simple', 'fun'),
      c('c', 'Whatever salvages my score', 'survival'),
      c('d', 'I’d just rent a set', 'flexible', 'beginner-friendly'),
    ],
    [insight('You’re both practical about gear chaos.', 'simple', 'flexible')],
  ),
  prompt(
    'light-etiquette-01',
    'light',
    'Quiet on the tee — how strict are you?',
    [
      c('a', 'Respect the silence', 'etiquette'),
      c('b', 'Soft banter is fine', 'banter', 'casual'),
      c('c', 'Depends on the group', 'flexible'),
      c('d', 'I go quiet when they address it', 'kind', 'etiquette'),
    ],
    [insight('Etiquette expectations look compatible.', 'etiquette', 'banter', 'casual')],
  ),
  prompt(
    'light-lesson-01',
    'light',
    'Ever taken a lesson?',
    [
      c('a', 'Yes — worth it', 'practice', 'growth'),
      c('b', 'YouTube university', 'diy', 'fun'),
      c('c', 'Not yet but curious', 'curious', 'beginner-friendly'),
      c('d', 'I play by feel', 'feel', 'casual'),
    ],
    [insight('You’re both open to getting better without the ego.', 'growth', 'curious', 'casual')],
  ),
  prompt(
    'light-favorite-hole-01',
    'light',
    'Favorite kind of hole?',
    [
      c('a', 'Short scenic par 3', 'scenic', 'short'),
      c('b', 'Wide-open bomber hole', 'power'),
      c('c', 'Risk/reward dogleg', 'strategy'),
      c('d', 'Whatever has a good view', 'scenic', 'vibe'),
    ],
    [insight('You light up on similar kinds of holes.', 'scenic', 'power', 'strategy')],
  ),
  prompt(
    'light-gimme-01',
    'light',
    'Gimme range on a date?',
    [
      c('a', 'Inside the leather', 'casual', 'gimme'),
      c('b', 'If it’s not embarrassing', 'casual', 'fun'),
      c('c', 'Make everything', 'strict'),
      c('d', 'Generous — it’s a date', 'gimme', 'kind', 'casual'),
    ],
    [insight('You’re both generous with the short putts.', 'gimme', 'casual')],
  ),
  prompt(
    'light-shoes-01',
    'light',
    'Spikes or sneakers?',
    [
      c('a', 'Proper golf shoes', 'classic'),
      c('b', 'Clean sneakers work', 'casual'),
      c('c', 'Whatever’s in the car', 'flexible', 'casual'),
      c('d', 'I match the vibe of the course', 'flexible'),
    ],
    [insight('Dress-code stress won’t be a thing.', 'casual', 'flexible', 'classic')],
  ),
  prompt(
    'light-group-01',
    'light',
    'Ideal group size for a golf date?',
    [
      c('a', 'Just us two', 'intimate', 'first-date'),
      c('b', 'Foursome with friends', 'social'),
      c('c', 'Us + one chill friend', 'social', 'flexible'),
      c('d', 'Start as two, expand later', 'intimate', 'flexible'),
    ],
    [
      insight('You both prefer keeping early dates more one-on-one.', 'intimate', 'first-date'),
      insight('You’re both open to social golf energy.', 'social'),
    ],
  ),
  prompt(
    'light-cart-path-01',
    'light',
    'Cart path only day — mood?',
    [
      c('a', 'Fine — still out here', 'hardy', 'flexible'),
      c('b', 'Slightly annoying but okay', 'honest'),
      c('c', 'I’d rather walk then', 'walk'),
      c('d', 'As long as we’re laughing', 'fun'),
    ],
    [insight('Course conditions won’t kill the date vibe.', 'fun', 'flexible', 'hardy')],
  ),
  prompt(
    'light-flag-01',
    'light',
    'Aim at the pin or play safe?',
    [
      c('a', 'Fire at the flag', 'aggressive', 'fun'),
      c('b', 'Center of the green', 'safe', 'strategy'),
      c('c', 'Depends on the lie', 'flexible', 'strategy'),
      c('d', 'Whatever looks fun', 'fun', 'spontaneous'),
    ],
    [insight('Approach styles are compatible enough to enjoy.', 'fun', 'strategy', 'flexible')],
  ),
  prompt(
    'light-caddie-01',
    'light',
    'If we had a caddie for a day…?',
    [
      c('a', 'Dream — yes please', 'treat', 'fun'),
      c('b', 'Fun once, not needed', 'casual'),
      c('c', 'I’d rather keep it simple', 'simple', 'casual'),
      c('d', 'We can caddie for each other', 'social', 'fun'),
    ],
    [insight('You’re both happy keeping golf dates approachable.', 'casual', 'simple', 'fun')],
  ),
  prompt(
    'light-highlight-01',
    'light',
    'What would make this round a highlight reel?',
    [
      c('a', 'Lots of laughter', 'fun', 'social'),
      c('b', 'One magical shot each', 'fun'),
      c('c', 'Easy conversation', 'social', 'connection'),
      c('d', 'Wanting to book another 9', 'second-date', 'chemistry'),
    ],
    [insight('You’re chasing the same kind of “good date” round.', 'fun', 'social', 'chemistry')],
  ),
  prompt(
    'light-so-spot-01',
    'light',
    'After golf, best Rogue Valley hang?',
    [
      c('a', 'Casual patio / brewery vibes', 'patio', 'social'),
      c('b', 'Coffee and a walk', 'casual', 'outdoors'),
      c('c', 'Good food nearby', 'food', 'social'),
      c('d', 'Sunset viewpoint', 'scenic', 'vibe'),
    ],
    [insight('Post-round plans will be easy to agree on.', 'social', 'food', 'scenic', 'casual')],
  ),
];

const DEEPER: GolfPrompt[] = [
  prompt(
    'deeper-halfway-01',
    'deeper',
    'What’s something people often misread about you?',
    [
      c('a', 'That I’m quieter than I am', 'introvert-misread'),
      c('b', 'That I’m always “fine”', 'depth', 'honest'),
      c('c', 'That I’m more serious than I feel', 'fun-misread'),
      c('d', 'That I’ve got it all figured out', 'humble', 'honest'),
    ],
    [insight('You’re both open about being misread.', 'honest', 'depth')],
  ),
  prompt(
    'deeper-sunday-01',
    'deeper',
    'What’s your idea of a perfect Sunday?',
    [
      c('a', 'Slow morning + outdoors', 'outdoors', 'slow'),
      c('b', 'Golf then a lazy hang', 'golf', 'social'),
      c('c', 'Rest and recharge hard', 'rest'),
      c('d', 'A mix of plans and downtime', 'balanced'),
    ],
    [insight('Sunday rhythms look compatible.', 'outdoors', 'golf', 'rest', 'balanced')],
  ),
  prompt(
    'deeper-goal-01',
    'deeper',
    'A life goal you’re quietly working toward?',
    [
      c('a', 'Career / craft growth', 'ambition'),
      c('b', 'Health and energy', 'health'),
      c('c', 'Deeper relationships', 'connection'),
      c('d', 'More freedom / adventure', 'adventure'),
    ],
    [insight('You both take quiet growth seriously.', 'ambition', 'health', 'connection', 'adventure')],
  ),
  prompt(
    'deeper-recharge-01',
    'deeper',
    'How do you recharge after a long week?',
    [
      c('a', 'Alone time first', 'solo', 'rest'),
      c('b', 'People who feel easy', 'social', 'connection'),
      c('c', 'Movement outdoors', 'outdoors', 'health'),
      c('d', 'A mix — depends on the week', 'flexible', 'balanced'),
    ],
    [insight('You understand each other’s recharge needs.', 'rest', 'social', 'outdoors', 'flexible')],
  ),
  prompt(
    'deeper-dealbreaker-01',
    'deeper',
    'A dealbreaker that isn’t about looks?',
    [
      c('a', 'Unkindness / disrespect', 'kindness'),
      c('b', 'No curiosity about life', 'curiosity'),
      c('c', 'Flakiness with plans', 'reliability'),
      c('d', 'Closed-off communication', 'communication'),
    ],
    [insight('Your non-negotiables point in a similar direction.', 'kindness', 'communication', 'reliability')],
  ),
  prompt(
    'deeper-compliment-01',
    'deeper',
    'Best compliment you’ve gotten that actually stuck?',
    [
      c('a', 'Something about my character', 'character'),
      c('b', 'That I’m easy to be around', 'ease', 'social'),
      c('c', 'That I make people feel seen', 'connection', 'kind'),
      c('d', 'That I’m resilient', 'strength'),
    ],
    [insight('You both value being seen for who you are.', 'character', 'connection', 'ease')],
  ),
  prompt(
    'deeper-mulligan-dating-01',
    'deeper',
    'If dating apps got a mulligan, what would you do differently?',
    [
      c('a', 'Be clearer about what I want', 'clarity', 'intention'),
      c('b', 'Take it slower / more intentional', 'slow', 'intention'),
      c('c', 'Lead with shared activities', 'activity', 'golf'),
      c('d', 'Trust my gut sooner', 'intuition'),
    ],
    [insight('You’re both aiming for more intentional dating.', 'intention', 'clarity', 'slow')],
  ),
  prompt(
    'deeper-proud-01',
    'deeper',
    'Something you’re proud of that doesn’t show on a profile?',
    [
      c('a', 'How I show up for people', 'loyalty', 'kind'),
      c('b', 'Work I’ve put in privately', 'ambition', 'humble'),
      c('c', 'Getting through a hard season', 'strength', 'honest'),
      c('d', 'The way I keep growing', 'growth'),
    ],
    [insight('There’s quiet substance on both sides.', 'humble', 'growth', 'strength', 'loyalty')],
  ),
  prompt(
    'deeper-second-01',
    'deeper',
    'What would make you want a second date?',
    [
      c('a', 'Easy conversation + laughs', 'chemistry', 'fun'),
      c('b', 'Feeling respected', 'kindness', 'respect'),
      c('c', 'Shared curiosity / plans', 'curiosity', 'second-date'),
      c('d', 'Wanting another round together', 'golf', 'chemistry'),
    ],
    [insight('You’re looking for similar second-date signals.', 'chemistry', 'kindness', 'curiosity')],
  ),
  prompt(
    'deeper-greenflag-01',
    'deeper',
    'A green flag on a first date for you?',
    [
      c('a', 'They listen well', 'listening', 'kind'),
      c('b', 'Humor under pressure', 'fun', 'resilience'),
      c('c', 'Clear communication', 'communication'),
      c('d', 'They’re present (not performative)', 'present', 'authentic'),
    ],
    [insight('Your green flags overlap in a good way.', 'listening', 'communication', 'present', 'fun')],
  ),
  prompt(
    'deeper-pressure-01',
    'deeper',
    'How do you act when a round (or day) goes sideways?',
    [
      c('a', 'I reset and stay kind', 'resilience', 'kind'),
      c('b', 'I get quiet for a bit', 'solo', 'honest'),
      c('c', 'I joke my way through', 'fun', 'resilience'),
      c('d', 'I name it and move on', 'communication', 'honest'),
    ],
    [insight('You handle friction in compatible ways.', 'resilience', 'honest', 'communication')],
  ),
  prompt(
    'deeper-values-01',
    'deeper',
    'What matters more long-term: spark or steadiness?',
    [
      c('a', 'Steadiness with real spark', 'balanced', 'connection'),
      c('b', 'Spark that grows into trust', 'chemistry', 'growth'),
      c('c', 'Reliability first', 'reliability'),
      c('d', 'Both — I’m picky', 'honest', 'intention'),
    ],
    [insight('You’re aligned on wanting spark and substance.', 'balanced', 'connection', 'reliability')],
  ),
  prompt(
    'deeper-family-01',
    'deeper',
    'How important is family closeness to you?',
    [
      c('a', 'Very — they’re core', 'family'),
      c('b', 'Important, with healthy boundaries', 'family', 'balanced'),
      c('c', 'Chosen family matters most', 'friends', 'connection'),
      c('d', 'It’s complicated, but I care', 'honest', 'family'),
    ],
    [insight('Family/closeness values are in a similar range.', 'family', 'connection', 'balanced')],
  ),
  prompt(
    'deeper-conflict-01',
    'deeper',
    'In conflict, what’s your instinct?',
    [
      c('a', 'Talk it through soon', 'communication'),
      c('b', 'Cool off, then talk', 'balanced', 'communication'),
      c('c', 'Write it out first', 'reflective'),
      c('d', 'Still learning my best pattern', 'growth', 'honest'),
    ],
    [insight('You both take conflict repair seriously.', 'communication', 'growth', 'balanced')],
  ),
  prompt(
    'deeper-love-lang-01',
    'deeper',
    'How do you usually show you care?',
    [
      c('a', 'Quality time', 'time', 'connection'),
      c('b', 'Helpful actions', 'acts', 'kind'),
      c('c', 'Words / check-ins', 'words', 'communication'),
      c('d', 'Thoughtful little plans', 'planning', 'kind'),
    ],
    [insight('Care languages aren’t a mystery between you.', 'connection', 'kind', 'communication')],
  ),
  prompt(
    'deeper-pace-dating-01',
    'deeper',
    'Ideal dating pace?',
    [
      c('a', 'Slow and intentional', 'slow', 'intention'),
      c('b', 'Consistent without rushing', 'balanced', 'reliability'),
      c('c', 'If it clicks, lean in', 'chemistry'),
      c('d', 'Match the other person’s energy', 'flexible', 'kind'),
    ],
    [insight('Dating pace preferences are compatible.', 'slow', 'intention', 'balanced', 'flexible')],
  ),
  prompt(
    'deeper-hard-day-01',
    'deeper',
    'What do you need on a hard day?',
    [
      c('a', 'Someone to listen', 'listening', 'connection'),
      c('b', 'Space, then support', 'solo', 'balanced'),
      c('c', 'A distraction / laugh', 'fun', 'social'),
      c('d', 'Practical help', 'acts', 'kind'),
    ],
    [insight('You understand what support can look like.', 'listening', 'kind', 'balanced')],
  ),
  prompt(
    'deeper-adventure-01',
    'deeper',
    'Adventure style in a relationship?',
    [
      c('a', 'Little local adventures often', 'local', 'outdoors'),
      c('b', 'Bigger trips when we can', 'travel', 'adventure'),
      c('c', 'A mix of homebody + getaways', 'balanced'),
      c('d', 'Shared hobbies > far-flung travel', 'activity', 'golf'),
    ],
    [insight('Adventure appetites look nicely matched.', 'outdoors', 'adventure', 'balanced', 'activity')],
  ),
  prompt(
    'deeper-trust-01',
    'deeper',
    'What builds trust fastest for you?',
    [
      c('a', 'Follow-through on small things', 'reliability'),
      c('b', 'Honest conversations', 'communication', 'honest'),
      c('c', 'Consistency over time', 'reliability', 'slow'),
      c('d', 'Feeling emotionally safe', 'safety', 'kind'),
    ],
    [insight('You’re building trust the same way.', 'reliability', 'communication', 'safety')],
  ),
  prompt(
    'deeper-growth-01',
    'deeper',
    'How do you want a partner to grow with you?',
    [
      c('a', 'Cheer each other’s goals', 'ambition', 'kind'),
      c('b', 'Call each other up kindly', 'growth', 'communication'),
      c('c', 'Try new things together', 'curiosity', 'adventure'),
      c('d', 'Stay soft through change', 'kindness', 'resilience'),
    ],
    [insight('Growth-together expectations line up.', 'growth', 'kind', 'curiosity')],
  ),
  prompt(
    'deeper-home-01',
    'deeper',
    'What does “home” feel like to you?',
    [
      c('a', 'Calm and unhurried', 'calm', 'rest'),
      c('b', 'Warm and social', 'social', 'connection'),
      c('c', 'Creative / lived-in', 'creative'),
      c('d', 'A basecamp for adventures', 'adventure', 'outdoors'),
    ],
    [insight('Your sense of home has overlapping notes.', 'calm', 'connection', 'adventure')],
  ),
  prompt(
    'deeper-money-01',
    'deeper',
    'On dates, money vibe you prefer?',
    [
      c('a', 'Take turns / split fairly', 'fair', 'balanced'),
      c('b', 'Keep it simple and low-pressure', 'simple', 'casual'),
      c('c', 'I’d rather plan something thoughtful than pricey', 'intention', 'kind'),
      c('d', 'Talk about it openly', 'communication', 'honest'),
    ],
    [insight('Money-on-dates stress should stay low between you.', 'fair', 'simple', 'communication')],
  ),
  prompt(
    'deeper-ex-01',
    'deeper',
    'What’s a lesson from past relationships you carry forward?',
    [
      c('a', 'Speak up earlier', 'communication', 'growth'),
      c('b', 'Don’t ignore red flags', 'boundaries', 'honest'),
      c('c', 'Choose kindness + effort', 'kindness', 'reliability'),
      c('d', 'Be clearer about needs', 'clarity', 'intention'),
    ],
    [insight('You’re both learning forward, not stuck backward.', 'growth', 'communication', 'kindness')],
  ),
  prompt(
    'deeper-energy-01',
    'deeper',
    'Social battery: how do you describe yours?',
    [
      c('a', 'Extrovert who needs downtime', 'balanced', 'social'),
      c('b', 'Introvert who loves the right people', 'solo', 'connection'),
      c('c', 'Depends on the season', 'flexible', 'honest'),
      c('d', 'I recharge with shared activities', 'activity', 'outdoors'),
    ],
    [insight('Social-energy expectations are discussable and compatible.', 'balanced', 'flexible', 'connection')],
  ),
  prompt(
    'deeper-future-01',
    'deeper',
    'In 5 years, what do you hope feels true?',
    [
      c('a', 'A grounded partnership', 'connection', 'reliability'),
      c('b', 'Work I’m proud of', 'ambition'),
      c('c', 'Health and freedom', 'health', 'adventure'),
      c('d', 'A life with good people nearby', 'friends', 'connection'),
    ],
    [insight('Your longer-term hopes rhyme.', 'connection', 'ambition', 'health')],
  ),
  prompt(
    'deeper-apology-01',
    'deeper',
    'What makes an apology feel real to you?',
    [
      c('a', 'Ownership without excuses', 'honest', 'accountability'),
      c('b', 'Changed behavior after', 'reliability', 'growth'),
      c('c', 'Warmth + clarity', 'kindness', 'communication'),
      c('d', 'Timing that respects space', 'respect', 'balanced'),
    ],
    [insight('You take repair seriously in similar ways.', 'honest', 'growth', 'communication')],
  ),
  prompt(
    'deeper-boundaries-01',
    'deeper',
    'A boundary you’re better at holding now?',
    [
      c('a', 'My time / energy', 'boundaries', 'rest'),
      c('b', 'How I’m spoken to', 'respect', 'boundaries'),
      c('c', 'Not rushing commitment', 'slow', 'intention'),
      c('d', 'Staying true to my values', 'character', 'boundaries'),
    ],
    [insight('Healthy boundaries matter to both of you.', 'boundaries', 'respect', 'intention')],
  ),
  prompt(
    'deeper-joy-01',
    'deeper',
    'What reliably brings you joy lately?',
    [
      c('a', 'Time outside', 'outdoors', 'health'),
      c('b', 'Good people / deep talks', 'connection', 'social'),
      c('c', 'Making progress on something', 'ambition', 'growth'),
      c('d', 'Simple rituals (coffee, walks, golf)', 'simple', 'golf'),
    ],
    [insight('Joy sources overlap — easy to build around.', 'outdoors', 'connection', 'simple')],
  ),
  prompt(
    'deeper-faith-01',
    'deeper',
    'How do beliefs / meaning show up in your life?',
    [
      c('a', 'Quietly important', 'meaning', 'reflective'),
      c('b', 'I’m open and curious', 'curiosity', 'meaning'),
      c('c', 'Community matters to me', 'community', 'connection'),
      c('d', 'I keep it personal', 'private', 'respect'),
    ],
    [insight('You can talk meaning without forcing it.', 'meaning', 'curiosity', 'respect')],
  ),
  prompt(
    'deeper-support-01',
    'deeper',
    'How do you like to be celebrated?',
    [
      c('a', 'Quiet acknowledgment', 'humble', 'kind'),
      c('b', 'A small planned moment', 'planning', 'kind'),
      c('c', 'Words that are specific', 'words', 'communication'),
      c('d', 'Shared time doing something fun', 'time', 'fun'),
    ],
    [insight('Celebration styles are learnable and compatible.', 'kind', 'communication', 'fun')],
  ),
  prompt(
    'deeper-vulnerability-01',
    'deeper',
    'What helps you open up with someone new?',
    [
      c('a', 'Feeling unrushed', 'slow', 'safety'),
      c('b', 'Shared activity (like golf)', 'activity', 'golf'),
      c('c', 'They go first a little', 'reciprocity', 'honest'),
      c('d', 'Humor that feels safe', 'fun', 'safety'),
    ],
    [insight('You open up under similar conditions.', 'safety', 'slow', 'activity', 'fun')],
  ),
  prompt(
    'deeper-partner-trait-01',
    'deeper',
    'Non-negotiable partner trait?',
    [
      c('a', 'Kindness', 'kindness'),
      c('b', 'Emotional maturity', 'maturity', 'communication'),
      c('c', 'Curiosity about life', 'curiosity'),
      c('d', 'Loyalty / follow-through', 'loyalty', 'reliability'),
    ],
    [insight('Core partner traits align.', 'kindness', 'reliability', 'curiosity', 'maturity')],
  ),
  prompt(
    'deeper-life-season-01',
    'deeper',
    'What season of life are you in right now?',
    [
      c('a', 'Building / becoming', 'ambition', 'growth'),
      c('b', 'Simplifying and grounding', 'calm', 'simple'),
      c('c', 'Healing and learning', 'growth', 'honest'),
      c('d', 'Ready for real partnership', 'connection', 'intention'),
    ],
    [insight('You’re in compatible seasons for dating.', 'growth', 'connection', 'intention')],
  ),
  prompt(
    'deeper-communicate-01',
    'deeper',
    'Texting style preference early on?',
    [
      c('a', 'Consistent but not constant', 'balanced', 'communication'),
      c('b', 'Quality over quantity', 'intention', 'communication'),
      c('c', 'I match energy', 'flexible', 'kind'),
      c('d', 'Prefer plans over endless chat', 'planning', 'activity'),
    ],
    [insight('Early communication expectations look workable.', 'communication', 'balanced', 'intention')],
  ),
  prompt(
    'deeper-chemistry-01',
    'deeper',
    'How do you know chemistry is real (not just nerves)?',
    [
      c('a', 'I feel calm and curious', 'chemistry', 'calm'),
      c('b', 'Time disappears', 'chemistry', 'fun'),
      c('c', 'I want to know more', 'curiosity', 'chemistry'),
      c('d', 'I feel like myself', 'authentic', 'safety'),
    ],
    [insight('You define real chemistry in similar ways.', 'chemistry', 'curiosity', 'authentic')],
  ),
  prompt(
    'deeper-effort-01',
    'deeper',
    'What does effort look like in dating for you?',
    [
      c('a', 'Showing up on time, prepared', 'reliability'),
      c('b', 'Thoughtful questions', 'curiosity', 'listening'),
      c('c', 'Planning something that fits us', 'planning', 'kind'),
      c('d', 'Honest follow-through after', 'communication', 'reliability'),
    ],
    [insight('You value the same kind of effort.', 'reliability', 'curiosity', 'planning')],
  ),
  prompt(
    'deeper-alone-01',
    'deeper',
    'Are you comfortable being alone — and what does that mean for dating?',
    [
      c('a', 'Yes — I date from fullness', 'solo', 'intention'),
      c('b', 'I’m good alone, better with the right person', 'balanced', 'connection'),
      c('c', 'Still practicing being alone well', 'growth', 'honest'),
      c('d', 'I want partnership without losing myself', 'boundaries', 'connection'),
    ],
    [insight('Independence + partnership goals look healthy on both sides.', 'solo', 'connection', 'boundaries')],
  ),
  prompt(
    'deeper-priority-01',
    'deeper',
    'Right now, what’s a top life priority?',
    [
      c('a', 'Health / stability', 'health', 'reliability'),
      c('b', 'Meaningful work', 'ambition'),
      c('c', 'Finding real connection', 'connection', 'intention'),
      c('d', 'Enjoying life more intentionally', 'joy', 'intention'),
    ],
    [insight('Priorities won’t be a mystery between you.', 'health', 'connection', 'intention', 'ambition')],
  ),
  prompt(
    'deeper-kids-01',
    'deeper',
    'How do you feel about kids someday? (High-level is fine.)',
    [
      c('a', 'Yes, someday', 'kids-yes'),
      c('b', 'Open / unsure', 'kids-open', 'honest'),
      c('c', 'Probably not', 'kids-no'),
      c('d', 'Want to know someone well first', 'slow', 'intention'),
    ],
    [
      insight('You’re both oriented toward kids someday.', 'kids-yes'),
      insight('You’re both still open / careful on the kids question.', 'kids-open', 'slow'),
      insight('You’re aligned on probably not having kids.', 'kids-no'),
    ],
  ),
  prompt(
    'deeper-forgiveness-01',
    'deeper',
    'What helps you forgive?',
    [
      c('a', 'Sincere ownership', 'accountability', 'honest'),
      c('b', 'Time + changed patterns', 'growth', 'reliability'),
      c('c', 'Feeling emotionally safe again', 'safety', 'kind'),
      c('d', 'A clear conversation', 'communication'),
    ],
    [insight('Forgiveness looks similar for both of you.', 'accountability', 'growth', 'communication')],
  ),
  prompt(
    'deeper-close-01',
    'deeper',
    'Closing thought for this round: what are you hoping this connection becomes?',
    [
      c('a', 'A real friendship first', 'friends', 'slow'),
      c('b', 'Something that could grow', 'growth', 'chemistry'),
      c('c', 'A consistent golf + life buddy', 'golf', 'connection'),
      c('d', 'Honestly — I’m open and curious', 'curiosity', 'honest'),
    ],
    [insight('You’re both open to this becoming something real.', 'growth', 'connection', 'curiosity')],
  ),
  prompt(
    'deeper-presence-01',
    'deeper',
    'When do you feel most like yourself with someone?',
    [
      c('a', 'When we can be quiet together', 'calm', 'present'),
      c('b', 'When humor is easy', 'fun', 'chemistry'),
      c('c', 'When plans feel collaborative', 'planning', 'balanced'),
      c('d', 'When I don’t have to perform', 'authentic', 'safety'),
    ],
    [insight('You feel most yourselves under similar conditions.', 'authentic', 'fun', 'present', 'safety')],
  ),
  prompt(
    'deeper-respect-01',
    'deeper',
    'What does respect look like mid-date?',
    [
      c('a', 'Phone down, eyes up', 'present', 'respect'),
      c('b', 'No interrupting / one-upping', 'listening', 'respect'),
      c('c', 'Checking comfort / pace', 'kind', 'flexible'),
      c('d', 'Following through on what we said', 'reliability', 'respect'),
    ],
    [insight('Respect standards match.', 'respect', 'present', 'listening', 'reliability')],
  ),
  prompt(
    'deeper-hobby-01',
    'deeper',
    'Favorite non-golf hobby you’d want a partner to try with you?',
    [
      c('a', 'Something outdoorsy', 'outdoors', 'activity'),
      c('b', 'Cooking / food adventures', 'food', 'social'),
      c('c', 'Live music / culture', 'culture', 'social'),
      c('d', 'A chill home project / game night', 'home', 'fun'),
    ],
    [insight('There’s an easy next activity beyond golf.', 'outdoors', 'food', 'social', 'fun')],
  ),
  prompt(
    'deeper-intention-01',
    'deeper',
    'What are you intentionally looking for right now?',
    [
      c('a', 'Someone kind and consistent', 'kindness', 'reliability'),
      c('b', 'Shared lifestyle / hobbies', 'activity', 'golf'),
      c('c', 'Emotional depth + fun', 'depth', 'fun'),
      c('d', 'A partner, not a pen pal', 'intention', 'planning'),
    ],
    [insight('Your dating intentions are pointing the same way.', 'intention', 'kindness', 'activity', 'fun')],
  ),
];

// Fix typo in deeper-vulnerability-01 choices - I accidentally used ] instead of )
// Let me fix that in the file - actually looking at my write, I have:
// c('c', 'They go first a little', 'reciprocity', 'honesty'],
// That's a syntax error! Need to fix.

export const GOLF_PROMPT_CATALOG: readonly GolfPrompt[] = [...LIGHT, ...DEEPER];

const byId = new Map(GOLF_PROMPT_CATALOG.map((p) => [p.id, p]));

export function getPromptById(id: string): GolfPrompt | undefined {
  return byId.get(id);
}

export function promptsForDepth(depth: GolfPromptDepth): GolfPrompt[] {
  return GOLF_PROMPT_CATALOG.filter((p) => p.depth === depth);
}

/** @deprecated Legacy string deck helper — prefer getPromptById / session prompt ids. */
export const GOLF_HOLE_PROMPTS: readonly string[] = GOLF_PROMPT_CATALOG.slice(0, GOLF_HOLE_COUNT).map(
  (p) => p.text,
);

export function promptForHole(hole: number): string {
  const index = Math.min(Math.max(hole, 1), GOLF_HOLE_COUNT) - 1;
  return GOLF_HOLE_PROMPTS[index] || GOLF_PROMPT_CATALOG[0].text;
}

export function computeSharedInsight(
  prompt: GolfPrompt,
  choiceA?: GolfPromptChoice | null,
  choiceB?: GolfPromptChoice | null,
): string | null {
  if (!choiceA || !choiceB) return null;
  const tagsA = new Set(choiceA.tags);
  const overlap = choiceB.tags.filter((t) => tagsA.has(t));
  if (overlap.length === 0) {
    return 'Different takes — nice contrast.';
  }
  for (const tmpl of prompt.insightTemplates) {
    if (tmpl.tags.every((t) => overlap.includes(t) || tagsA.has(t) && choiceB.tags.includes(t))) {
      if (tmpl.tags.some((t) => overlap.includes(t))) {
        return tmpl.copy;
      }
    }
  }
  // Prefer templates where any required tag is in overlap
  for (const tmpl of prompt.insightTemplates) {
    if (tmpl.tags.some((t) => overlap.includes(t))) {
      return tmpl.copy;
    }
  }
  return 'You share some common ground here.';
}
