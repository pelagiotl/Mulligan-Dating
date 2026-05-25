/** Whether a JWT is stored locally (sync read — safe during first paint). */
export function hasStoredAuthToken(): boolean {
  try {
    return !!localStorage.getItem("token");
  } catch {
    return false;
  }
}
