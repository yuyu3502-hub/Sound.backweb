import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getAnalytics, isSupported, logEvent } from 'firebase/analytics';
import { doc, getFirestore, increment, serverTimestamp, setDoc } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Firebase初期化
const app = initializeApp(firebaseConfig);

// 認証
export const auth = getAuth(app);

// Firestore（データベース）
export const db = getFirestore(app);

// Storage（ファイル保存）
export const storage = getStorage(app);

export const analyticsPromise =
  typeof window === 'undefined' || !firebaseConfig.measurementId
    ? Promise.resolve(null)
    : isSupported()
        .then((supported) => (supported ? getAnalytics(app) : null))
        .catch(() => null);

export const logPageView = (pathname, search = '') => {
  if (typeof window === 'undefined') {
    return;
  }

  const pagePath = `${pathname}${search}`;

  void analyticsPromise.then((analytics) => {
    if (!analytics) {
      return;
    }

    logEvent(analytics, 'page_view', {
      page_title: document.title,
      page_location: window.location.href,
      page_path: pagePath,
    });
  });
};

function getDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const trackPageViewCounter = (pathname, search = '', uid = '') => {
  if (typeof window === 'undefined' || !uid) {
    return;
  }

  const pagePath = `${pathname}${search}`;
  const cacheKey = `pv:${uid}:${pagePath}`;
  const nowMs = Date.now();
  const lastTrackedAt = Number(sessionStorage.getItem(cacheKey) || 0);

  // React StrictModeの二重実行による重複カウントを抑制。
  if (nowMs - lastTrackedAt < 5000) {
    return;
  }

  sessionStorage.setItem(cacheKey, String(nowMs));

  const now = new Date();
  const dayKey = getDateKey(now);
  const totalRef = doc(db, 'analytics_summary', 'pageViews');
  const dailyRef = doc(db, 'analytics_page_views_daily', dayKey);

  void Promise.all([
    setDoc(
      totalRef,
      {
        totalCount: increment(1),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ),
    setDoc(
      dailyRef,
      {
        count: increment(1),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ),
  ]).catch((error) => {
    console.error('Failed to track page view counter', error);
  });
};

export default app;
