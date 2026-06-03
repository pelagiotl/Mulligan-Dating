/** Warm lazy chunks before navigating to Connect after login. */
export function preloadConnectShell() {
  void import('../components/Layout')
  void import('../pages/Browse')
  void import('../pages/CreateProfile')
}
