import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { getNotificationMessage } from '../utils/notifications';
import './NotificationsPage.css';

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const { firebaseUser, isLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (isLoading) return;
    if (!firebaseUser) {
      navigate('/auth');
      return;
    }
    fetchNotifications();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, isLoading]);

  const fetchNotifications = async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userUid', '==', firebaseUser.uid)
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() ?? 0;
          const bTime = b.createdAt?.toMillis?.() ?? 0;
          return bTime - aTime;
        });
      setNotifications(docs);

      const unreadDocs = snapshot.docs.filter((d) => !d.data().isRead);
      if (unreadDocs.length > 0) {
        const batch = writeBatch(db);
        unreadDocs.forEach((d) => {
          batch.update(d.ref, { isRead: true, updatedAt: serverTimestamp() });
        });
        await batch.commit();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClickNotification = async (notification) => {
    if (!notification.isRead) {
      try {
        await updateDoc(doc(db, 'notifications', notification.id), {
          isRead: true,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error(err);
      }
    }

    if (notification.postId) {
      navigate(`/post/${notification.postId}`);
      return;
    }

    navigate('/');
  };

  return (
    <div className="notifications-page">
      <header className="notifications-header">
        <button className="notifications-back-btn" onClick={() => navigate(-1)}>
          ← 戻る
        </button>
        <h1 className="notifications-title">通知</h1>
      </header>

      <main className="notifications-main">
        {loading ? (
          <p className="notifications-state">読み込み中...</p>
        ) : notifications.length === 0 ? (
          <p className="notifications-state">通知はまだありません。</p>
        ) : (
          <ul className="notifications-list">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <button
                  className={`notifications-item ${notification.isRead ? '' : 'notifications-item--unread'}`}
                  onClick={() => handleClickNotification(notification)}
                >
                  <span className="notifications-item__title">
                    {getNotificationMessage(notification)}
                  </span>
                  <span className="notifications-item__body">
                    {notification.bodySnippet || ''}
                  </span>
                  <span className="notifications-item__date">
                    {formatDate(notification.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <BottomNav active="notifications" />
    </div>
  );
}
