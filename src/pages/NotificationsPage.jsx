import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  query,
  orderBy,
  limit,
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

const NOTIFICATIONS_LIMIT = 80;
const OPERATOR_MESSAGE = {
  title: '運営より',
  body: 'Sound.backをご利用頂き、本当にありがとうございます。\nこのアプリでは、音楽制作で悩んだ際に安心して相談できる場所づくりを目指しています。\nこれからも機能の追加や修正に取り組んでいきますので、引き続きよろしくお願いします。',
};

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
        where('userUid', '==', firebaseUser.uid),
        orderBy('createdAt', 'desc'),
        limit(NOTIFICATIONS_LIMIT)
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
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
        <div className="notifications-header__inner">
          <h1 className="notifications-title">Notifications</h1>
          <button className="notifications-back-btn" onClick={() => navigate(-1)}>
            ← 戻る
          </button>
        </div>
      </header>

      <main className="notifications-main">
        <section className="notifications-operator" aria-label="運営メッセージ">
          <span className="notifications-operator__badge">運営メッセージ</span>
          <h2 className="notifications-operator__title">{OPERATOR_MESSAGE.title}</h2>
          <p className="notifications-operator__body">{OPERATOR_MESSAGE.body}</p>
        </section>

        {loading ? (
          <p className="notifications-state">読み込み中...</p>
        ) : notifications.length === 0 ? (
          <p className="notifications-state">ほかの通知はまだありません。</p>
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
