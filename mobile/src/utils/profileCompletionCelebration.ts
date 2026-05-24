/** Blocks AppNavigator from resetting away from CreateProfile during the completion modal. */
let celebrationVisible = false;

export function setProfileCompletionCelebrationVisible(visible: boolean): void {
  celebrationVisible = visible;
}

export function isProfileCompletionCelebrationVisible(): boolean {
  return celebrationVisible;
}
