import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export const NOTIFICATION_TYPES = {
  BEST_ANSWER: 'best_answer',
  FEEDBACK: 'feedback',
  REPLY: 'reply',
};

export async function createNotification({
  userUid,
  actorUid,
  actorDisplayName = '',
  actorPhotoUrl = null,
  type,
  postId = null,
  commentId = null,
  parentCommentId = null,
  bodySnippet = '',
}) {
  if (!userUid || !actorUid || !type) return;
  if (userUid === actorUid) return;

  try {
    await addDoc(collection(db, 'notifications'), {
      userUid,
      actorUid,
      actorDisplayName,
      actorPhotoUrl,
      type,
      postId,
      commentId,
      parentCommentId,
      bodySnippet: bodySnippet.slice(0, 80),
      isRead: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Notification creation failed:', error);
  }
}

export function getNotificationMessage(notification) {
  const actorName = notification.actorDisplayName || 'だれか';

  if (notification.type === NOTIFICATION_TYPES.BEST_ANSWER) {
    return `${actorName}があなたの回答をベストアンサーに設定しました`;
  }

  if (notification.type === NOTIFICATION_TYPES.FEEDBACK) {
    return `${actorName}があなたの投稿にフィードバックしました`;
  }

  if (notification.type === NOTIFICATION_TYPES.REPLY) {
    return `${actorName}があなたのコメントに返信しました`;
  }

  return '新しい通知があります';
}