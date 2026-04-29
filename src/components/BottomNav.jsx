import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import './BottomNav.css';

export function BottomNav({ active, onHomeClick }) {
  const navigate = useNavigate();
  const { firebaseUser } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!firebaseUser) {
      setUnreadCount(0);
      return undefined;
    }

    const q = query(
      collection(db, 'notifications'),
      where('userUid', '==', firebaseUser.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const unread = snapshot.docs.reduce((count, d) => {
          return d.data().isRead ? count : count + 1;
        }, 0);
        setUnreadCount(unread);
      },
      () => {
        setUnreadCount(0);
      }
    );

    return unsubscribe;
  }, [firebaseUser]);

  const handleHome = () => {
    if (active === 'home' && onHomeClick) {
      onHomeClick();
    } else {
      navigate('/');
    }
  };

  const handleSearch = () => {
    navigate('/search');
  };

  const handleNotifications = () => {
    if (!firebaseUser) {
      navigate('/auth');
      return;
    }
    navigate('/notifications');
  };

  const handleRanking = () => {
    navigate('/ranking');
  };

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav__inner">
      <button
        className={`bottom-nav__btn ${active === 'home' ? 'bottom-nav__btn--active' : ''}`}
        onClick={handleHome}
        aria-label="ホーム"
      >
        {/* ホームアイコン */}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span>ホーム</span>
      </button>

      <button
        className={`bottom-nav__btn ${active === 'search' ? 'bottom-nav__btn--active' : ''}`}
        onClick={handleSearch}
        aria-label="検索"
      >
        {/* 検索アイコン */}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span>検索</span>
      </button>

      <button
        className={`bottom-nav__btn ${active === 'ranking' ? 'bottom-nav__btn--active' : ''}`}
        onClick={handleRanking}
        aria-label="ランキング"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 20V10" />
          <path d="M12 20V4" />
          <path d="M6 20v-6" />
        </svg>
        <span>ランク</span>
      </button>

      <button
        className={`bottom-nav__btn ${active === 'notifications' ? 'bottom-nav__btn--active' : ''}`}
        onClick={handleNotifications}
        aria-label="通知"
      >
        <span className="bottom-nav__icon-wrap">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="bottom-nav__badge" aria-label="未読通知">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
        <span>通知</span>
      </button>
      </div>
    </nav>
  );
}
