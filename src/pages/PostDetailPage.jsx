import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, getDoc, collection, query, where, orderBy,
  getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { createNotification, NOTIFICATION_TYPES } from '../utils/notifications';
import './PostDetailPage.css';

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('ja-JP', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function PostDetailPage() {
  const { postId } = useParams();
  const { firebaseUser, userData } = useAuth();
  const navigate = useNavigate();

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [postLoading, setPostLoading] = useState(true);
  const [postError, setPostError] = useState(false);

  // 音源プレイヤー
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  // コメントフォーム
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [commentImage, setCommentImage] = useState(null);
  const [commentImagePreview, setCommentImagePreview] = useState(null);
  const [commentError, setCommentError] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);
  const imageInputRef = useRef(null);
  const commentTextareaRef = useRef(null);

  const fetchPost = async () => {
    try {
      const snap = await getDoc(doc(db, 'posts', postId));
      if (snap.exists()) {
        setPost({ id: snap.id, ...snap.data() });
      } else {
        setPostError(true);
      }
    } catch {
      setPostError(true);
    } finally {
      setPostLoading(false);
    }
  };

  const fetchComments = async () => {
    try {
      const q = query(
        collection(db, 'comments'),
        where('postId', '==', postId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      // ベストアンサーを先頭に固定
      const best = docs.find((c) => c.isBestAnswer);
      const others = docs.filter((c) => !c.isBestAnswer);
      setComments(best ? [best, ...others] : others);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPost();
    fetchComments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  // 音源プレイヤー操作
  const handlePlayToggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
    setIsPlaying((prev) => !prev);
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setProgress((audio.currentTime / audio.duration) * 100);
  };

  const handleEnded = () => {
    setProgress(0);
    setIsPlaying(false);
  };

  // コメント画像
  const handleCommentImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type) || file.size > IMAGE_MAX_BYTES) {
      setCommentError('画像の形式またはサイズが不正です。');
      e.target.value = '';
      return;
    }
    setCommentError('');
    setCommentImage(file);
    setCommentImagePreview(URL.createObjectURL(file));
  };

  const handleCommentImageRemove = () => {
    setCommentImage(null);
    setCommentImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const resetCommentForm = () => {
    setCommentBody('');
    setCommentImage(null);
    setCommentImagePreview(null);
    setReplyTarget(null);
    setCommentError('');
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleReplyClick = (comment) => {
    if (!firebaseUser) {
      navigate('/auth');
      return;
    }

    setReplyTarget({
      id: comment.id,
      authorUid: comment.authorUid,
      authorDisplayName: comment.authorDisplayName ?? 'ユーザー',
    });
    setShowCommentForm(true);
    setCommentError('');

    window.requestAnimationFrame(() => {
      commentTextareaRef.current?.focus();
    });
  };

  const handleReplyCancel = () => {
    setReplyTarget(null);
  };

  // コメント投稿
  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!firebaseUser) {
      navigate('/auth');
      return;
    }
    if (!commentBody.trim()) {
      setCommentError('コメントを入力してください。');
      return;
    }
    setCommentError('');
    setCommentLoading(true);
    try {
      const trimmedBody = commentBody.trim();
      let imageUrl = null;
      if (commentImage) {
        const imgRef = ref(
          storage,
          `comments/images/${firebaseUser.uid}/${Date.now()}_${commentImage.name}`
        );
        await uploadBytes(imgRef, commentImage);
        imageUrl = await getDownloadURL(imgRef);
      }

      const commentRef = await addDoc(collection(db, 'comments'), {
        postId,
        authorUid: firebaseUser.uid,
        authorDisplayName: userData?.displayName ?? '',
        authorPhotoUrl: userData?.photoUrl ?? null,
        body: trimmedBody,
        imageUrl,
        replyToCommentId: replyTarget?.id ?? null,
        replyToAuthorUid: replyTarget?.authorUid ?? null,
        replyToAuthorName: replyTarget?.authorDisplayName ?? null,
        isBestAnswer: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const replyRecipientUid = replyTarget?.authorUid ?? null;
      const postAuthorUid = post?.authorUid ?? null;

      if (replyRecipientUid) {
        await createNotification({
          userUid: replyRecipientUid,
          actorUid: firebaseUser.uid,
          actorDisplayName: userData?.displayName ?? '',
          actorPhotoUrl: userData?.photoUrl ?? null,
          type: NOTIFICATION_TYPES.REPLY,
          postId,
          commentId: commentRef.id,
          parentCommentId: replyTarget.id,
          bodySnippet: trimmedBody,
        });
      }

      if (postAuthorUid && postAuthorUid !== replyRecipientUid) {
        await createNotification({
          userUid: postAuthorUid,
          actorUid: firebaseUser.uid,
          actorDisplayName: userData?.displayName ?? '',
          actorPhotoUrl: userData?.photoUrl ?? null,
          type: NOTIFICATION_TYPES.FEEDBACK,
          postId,
          commentId: commentRef.id,
          bodySnippet: trimmedBody,
        });
      }

      resetCommentForm();
      setShowCommentForm(false);
      await fetchComments();
    } catch {
      setCommentError('コメントの投稿に失敗しました。もう一度お試しください。');
    } finally {
      setCommentLoading(false);
    }
  };

  // ベストアンサー設定
  const handleSetBestAnswer = async (commentId) => {
    if (!post || post.isSolved) return;
    try {
      const selectedComment = comments.find((c) => c.id === commentId);
      if (!selectedComment || selectedComment.authorUid === post.authorUid) return;

      await updateDoc(doc(db, 'comments', commentId), {
        isBestAnswer: true,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'posts', postId), {
        isSolved: true,
        bestAnswerCommentId: commentId,
        updatedAt: serverTimestamp(),
      });

      await createNotification({
        userUid: selectedComment?.authorUid,
        actorUid: post.authorUid,
        actorDisplayName: post.authorDisplayName ?? '',
        actorPhotoUrl: post.authorPhotoUrl ?? null,
        type: NOTIFICATION_TYPES.BEST_ANSWER,
        postId,
        commentId,
        bodySnippet: post.body ?? '',
      });

      setPost((prev) => ({ ...prev, isSolved: true, bestAnswerCommentId: commentId }));
      await fetchComments();
    } catch (err) {
      console.error(err);
    }
  };

  // コメント削除（投稿者のみ）
  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('このコメントを削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'comments', commentId));
      if (replyTarget?.id === commentId) {
        setReplyTarget(null);
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      console.error(err);
    }
  };

  // FABクリック: 未ログインなら認証画面へ、ログイン済みはフォーム開閉
  const handleFabClick = () => {
    if (!firebaseUser) {
      navigate('/auth');
      return;
    }
    setShowCommentForm((prev) => {
      const next = !prev;
      if (!next) {
        resetCommentForm();
      }
      return next;
    });
  };

  const isPostAuthor = firebaseUser && post && firebaseUser.uid === post.authorUid;

  if (postLoading) return <div className="detail-state">読み込み中...</div>;
  if (postError) return <div className="detail-state">投稿が見つかりませんでした。</div>;

  const initial = post.authorDisplayName?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="detail-page">
      <header className="detail-header">
        <button className="detail-back-btn" onClick={() => navigate('/')}>
          ← ホーム
        </button>
        <h1 className="detail-title">お悩み詳細</h1>
      </header>

      <main className="detail-main">
        {/* 投稿情報 */}
        <section className="detail-post">
          <button
            className="detail-author"
            onClick={() => navigate(`/users/${post.authorUid}`)}
          >
            {post.authorPhotoUrl ? (
              <img className="detail-author__avatar" src={post.authorPhotoUrl} alt="" />
            ) : (
              <div className="detail-author__avatar-fallback">{initial}</div>
            )}
            <span className="detail-author__name">{post.authorDisplayName}</span>
          </button>

          <div className="detail-meta">
            {post.worryGenre && <span className="detail-tag">{post.worryGenre}</span>}
            {post.musicGenre && <span className="detail-tag">{post.musicGenre}</span>}
            {post.isSolved && <span className="detail-tag detail-tag--solved">解決済み</span>}
            <span className="detail-date">{formatDate(post.createdAt)}</span>
          </div>

          <p className="detail-body">{post.body}</p>

          {post.imageUrl && (
            <img className="detail-image" src={post.imageUrl} alt="" />
          )}

          {post.audioUrl && (
            <div className="detail-audio">
              <button
                className="detail-play-btn"
                onClick={handlePlayToggle}
                aria-label={isPlaying ? '一時停止' : '再生'}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              <div className="detail-progress-bar">
                <div className="detail-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <audio
                ref={audioRef}
                src={post.audioUrl}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleEnded}
              />
            </div>
          )}
        </section>

        {/* コメントフォーム（インライン） */}
        {showCommentForm && (
          <section className="detail-comment-form">
            <form onSubmit={handleCommentSubmit}>
              <div className="detail-comment-form__body-wrap">
                {replyTarget && (
                  <div className="detail-comment-form__reply-target">
                    <span>{replyTarget.authorDisplayName}さんに返信中</span>
                    <button
                      type="button"
                      className="detail-comment-form__reply-cancel"
                      onClick={handleReplyCancel}
                    >
                      解除
                    </button>
                  </div>
                )}
                <textarea
                  ref={commentTextareaRef}
                  className="detail-comment-form__textarea"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value.slice(0, 400))}
                  rows={4}
                  placeholder={replyTarget ? `${replyTarget.authorDisplayName}さんへの返信を入力してください...` : 'コメントを入力してください...'}
                  autoFocus
                />
                <span className={`detail-comment-form__count ${commentBody.length >= 400 ? 'detail-comment-form__count--max' : ''}`}>
                  {commentBody.length}/400
                </span>
              </div>

              {commentImagePreview ? (
                <div className="detail-comment-form__image-preview">
                  <img src={commentImagePreview} alt="" />
                  <button
                    type="button"
                    className="detail-comment-form__remove-btn"
                    onClick={handleCommentImageRemove}
                  >
                    削除
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="detail-comment-form__file-btn"
                  onClick={() => imageInputRef.current?.click()}
                >
                  画像を添付（任意）
                </button>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleCommentImageChange}
                hidden
              />

              {commentError && <p className="detail-comment-form__error">{commentError}</p>}

              <div className="detail-comment-form__actions">
                <button
                  type="button"
                  className="detail-comment-form__cancel"
                  onClick={() => {
                    resetCommentForm();
                    setShowCommentForm(false);
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="detail-comment-form__submit"
                  disabled={commentLoading}
                >
                  {commentLoading ? '送信中...' : 'コメントする'}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* コメント一覧 */}
        <section className="detail-comments">
          <h2 className="detail-comments__title">
            コメント{comments.length > 0 && `（${comments.length}）`}
          </h2>
          {comments.length === 0 && (
            <p className="detail-comments__empty">まだコメントはありません。</p>
          )}
          <ul className="detail-comment-list">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className={`detail-comment ${comment.isBestAnswer ? 'detail-comment--best' : ''}`}
              >
                <div className="detail-comment__header">
                  <div className="detail-comment__author">
                    {comment.authorPhotoUrl ? (
                      <img className="detail-comment__avatar" src={comment.authorPhotoUrl} alt="" />
                    ) : (
                      <div className="detail-comment__avatar-fallback">
                        {comment.authorDisplayName?.[0]?.toUpperCase() ?? '?'}
                      </div>
                    )}
                    <span className="detail-comment__name">{comment.authorDisplayName}</span>
                    {comment.isBestAnswer && (
                      <span className="detail-comment__best-badge">ベストアンサー</span>
                    )}
                  </div>
                  {isPostAuthor && (
                    <button
                      className="detail-comment__delete-btn"
                      onClick={() => handleDeleteComment(comment.id)}
                      aria-label="コメントを削除"
                    >
                      🗑
                    </button>
                  )}
                </div>

                {comment.replyToAuthorName && (
                  <p className="detail-comment__reply-label">
                    {comment.replyToAuthorName}さんへの返信
                  </p>
                )}

                <p className="detail-comment__body">{comment.body}</p>

                {comment.imageUrl && (
                  <img className="detail-comment__image" src={comment.imageUrl} alt="" />
                )}

                <div className="detail-comment__footer">
                  <span className="detail-comment__date">{formatDate(comment.createdAt)}</span>
                  <div className="detail-comment__actions">
                    {firebaseUser && firebaseUser.uid !== comment.authorUid && (
                      <button
                        className="detail-comment__reply-btn"
                        onClick={() => handleReplyClick(comment)}
                      >
                        返信
                      </button>
                    )}
                    {isPostAuthor && !post.isSolved && !comment.isBestAnswer && comment.authorUid !== post.authorUid && (
                      <button
                        className="detail-comment__best-btn"
                        onClick={() => handleSetBestAnswer(comment.id)}
                      >
                        ベストアンサーに設定
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <BottomNav active="" />

      <button className="fab" onClick={handleFabClick} aria-label="コメントを追加">
        {showCommentForm ? '×' : '+'}
      </button>
    </div>
  );
}
