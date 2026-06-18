/** Admin-granted Mulligan verification (not automated photo/liveness). */
export function isPhotoVerifiedAt(value: unknown): boolean {
  return value != null && String(value).trim() !== '';
}
