/** localStorage key — must match mobile `AGE_GATE_ACCEPTED`. */
export const AGE_GATE_STORAGE_KEY = 'AGE_GATE_ACCEPTED';

export function isAgeGateAccepted(): boolean {
  try {
    return localStorage.getItem(AGE_GATE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAgeGateAccepted(): void {
  localStorage.setItem(AGE_GATE_STORAGE_KEY, 'true');
}

export function clearAgeGateAccepted(): void {
  localStorage.removeItem(AGE_GATE_STORAGE_KEY);
}
