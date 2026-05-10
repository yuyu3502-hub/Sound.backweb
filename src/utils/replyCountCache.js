import { collection, getCountFromServer, query, where } from 'firebase/firestore';

const REPLY_COUNT_CACHE_KEY = 'reply-count-cache-v1';
const REPLY_COUNT_TTL_MS = 1000 * 60 * 5;
const REPLY_COUNT_WORKERS = 8;

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function readRawCache() {
  if (!isBrowser()) return {};

  try {
    const raw = window.sessionStorage.getItem(REPLY_COUNT_CACHE_KEY);
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
    window.sessionStorage.setItem(REPLY_COUNT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage write failures and continue without cache.
  }
}

function isFresh(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const timestamp = Number(entry.cachedAt);
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= REPLY_COUNT_TTL_MS;
}

export function getCachedReplyCountByPostIds(postIds) {
  const cache = readRawCache();
  const hitMap = {};
  const missPostIds = [];

  postIds.forEach((postId) => {
    const entry = cache[postId];
    if (isFresh(entry)) {
      hitMap[postId] = Number(entry.count ?? 0);
      return;
    }
    missPostIds.push(postId);
  });

  return { hitMap, missPostIds };
}

export function mergeReplyCountCache(countByPostId) {
  if (!countByPostId || typeof countByPostId !== 'object') return;

  const cache = readRawCache();
  const now = Date.now();

  Object.entries(countByPostId).forEach(([postId, count]) => {
    cache[postId] = {
      count: Number(count ?? 0),
      cachedAt: now,
    };
  });

  writeRawCache(cache);
}

export async function fetchReplyCountByPostIds(db, postIds) {
  const uniquePostIds = [...new Set(postIds.filter(Boolean))];
  if (uniquePostIds.length === 0) return {};

  const { hitMap, missPostIds } = getCachedReplyCountByPostIds(uniquePostIds);
  const nextMap = { ...hitMap };

  if (missPostIds.length === 0) {
    return nextMap;
  }

  const fetchedMap = {};
  const queue = [...missPostIds];

  const workerCount = Math.min(REPLY_COUNT_WORKERS, queue.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (queue.length > 0) {
      const postId = queue.pop();
      if (!postId) continue;

      try {
        const snapshot = await getCountFromServer(
          query(collection(db, 'comments'), where('postId', '==', postId))
        );
        const count = Number(snapshot.data().count ?? 0);
        fetchedMap[postId] = count;
        nextMap[postId] = count;
      } catch {
        fetchedMap[postId] = 0;
        nextMap[postId] = 0;
      }
    }
  });

  await Promise.all(workers);
  mergeReplyCountCache(fetchedMap);
  return nextMap;
}
