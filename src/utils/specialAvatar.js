export const SPECIAL_SKIN_USER_ID = '5cp32r2u';

export function isSpecialSkinUserId(userId) {
  if (!userId) return false;
  return userId.replace(/^@/, '') === SPECIAL_SKIN_USER_ID;
}
