const AVATAR_META_CACHE_KEY = 'avatar-meta-cache-v1';
const AVATAR_META_TTL_MS = 1000 * 60 * 30;

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function readRawCache() {
  if (!isBrowser()) return {};

  try {
    const raw = window.sessionStorage.getItem(AVATAR_META_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeRawCache(cache) {
  if (!isBrowser()) return;

  try {
    window.sessionStorage.setItem(AVATAR_META_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage write failures (private mode/quota) and continue without cache.
  }
}

function isFresh(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const timestamp = Number(entry.cachedAt);
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= AVATAR_META_TTL_MS;
}

export function getCachedAvatarMetaByUids(uids) {
  const cache = readRawCache();
  const hitMap = {};
  const missUids = [];

  uids.forEach((uid) => {
    const entry = cache[uid];
    if (isFresh(entry)) {
      hitMap[uid] = {
        photoUrl: entry.photoUrl ?? null,
        isSpecial: Boolean(entry.isSpecial),
      };
      return;
    }

    missUids.push(uid);
  });

  return { hitMap, missUids };
}

export function mergeAvatarMetaCache(metaByUid) {
  if (!metaByUid || typeof metaByUid !== 'object') return;

  const current = readRawCache();
  const next = { ...current };
  const now = Date.now();

  Object.entries(metaByUid).forEach(([uid, meta]) => {
    next[uid] = {
      photoUrl: meta?.photoUrl ?? null,
      isSpecial: Boolean(meta?.isSpecial),
      cachedAt: now,
    };
  });

  writeRawCache(next);
}