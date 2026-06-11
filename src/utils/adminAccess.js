const EXTRA_ADMIN_UIDS = new Set([
  'GYA5hIMrHpScR4cHScQ3wNw59v93',
]);

export function hasAdminAccess(firebaseUser, userData) {
  const uid = firebaseUser?.uid;
  if (!uid) return false;
  if (userData?.role === 'admin') return true;
  return EXTRA_ADMIN_UIDS.has(uid);
}
