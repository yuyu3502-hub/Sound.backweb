import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getAnalytics, isSupported, logEvent } from 'firebase/analytics';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { captureAcquisition, getAcquisitionEventParams } from './utils/acquisition';

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
  const acquisitionParams = captureAcquisition(pathname, search);

  void analyticsPromise.then((analytics) => {
    if (!analytics) {
      return;
    }

    logEvent(analytics, 'page_view', {
      page_title: document.title,
      page_location: window.location.href,
      page_path: pagePath,
      ...acquisitionParams,
    });
  });
};

export const logAppEvent = (eventName, params = {}) => {
  if (typeof window === 'undefined' || !eventName) {
    return;
  }

  void analyticsPromise.then((analytics) => {
    if (!analytics) {
      return;
    }

    logEvent(analytics, eventName, {
      ...getAcquisitionEventParams(),
      ...params,
    });
  });
};

export const trackPageViewCounter = () => {
  // Security: pageview counters are no longer writable from client-side Firestore.
  // Keep this function as a no-op to avoid breaking callers until server-side tracking is introduced.
};

export default app;
