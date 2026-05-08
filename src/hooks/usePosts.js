import { useState, useEffect } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  startAfter,
} from 'firebase/firestore';
import { db } from '../firebase';

const POSTS_PER_PAGE = 10;
const FETCH_TIMEOUT_MS = 12000;

function withTimeout(promise, timeoutMs = FETCH_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('投稿取得がタイムアウトしました')), timeoutMs);
    }),
  ]);
}

function sortByCreatedAtDesc(a, b) {
  const aTime = a.createdAt?.toMillis?.() ?? 0;
  const bTime = b.createdAt?.toMillis?.() ?? 0;
  return bTime - aTime;
}

export function usePosts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPosts = async () => {
    setLoading(true);
    setError(null);
    try {
      const orderedQ = query(
        collection(db, 'posts'),
        orderBy('createdAt', 'desc'),
        limit(POSTS_PER_PAGE)
      );

      const snapshot = await withTimeout(getDocs(orderedQ));
      let docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      // createdAt 欠損データが多い場合は orderBy で拾えないためフォールバック取得
      if (docs.length === 0) {
        const fallbackQ = query(collection(db, 'posts'), limit(POSTS_PER_PAGE));
        const fallbackSnapshot = await withTimeout(getDocs(fallbackQ));
        docs = fallbackSnapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .sort(sortByCreatedAtDesc);
        setLastDoc(null);
        setHasMore(false);
      } else {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1] ?? null);
        setHasMore(snapshot.docs.length === POSTS_PER_PAGE);
      }

      setPosts(docs);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMore = async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, 'posts'),
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(POSTS_PER_PAGE)
      );
      const snapshot = await withTimeout(getDocs(q));
      const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setPosts((prev) => [...prev, ...docs]);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] ?? null);
      setHasMore(snapshot.docs.length === POSTS_PER_PAGE);
    } catch (err) {
      setError(err);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  return {
    posts,
    loading,
    error,
    hasMore,
    loadingMore,
    fetchMore,
    refresh: fetchPosts,
  };
}
