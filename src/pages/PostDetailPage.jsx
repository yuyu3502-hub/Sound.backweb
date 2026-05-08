import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, getDoc, collection, query, where, orderBy,
  getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp, limit, writeBatch, documentId,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { createNotification, NOTIFICATION_TYPES } from '../utils/notifications';
import { isSpecialSkinUserId } from '../utils/specialAvatar';
import { getCachedAvatarMetaByUids, mergeAvatarMetaCache } from '../utils/avatarMetaCache';
import './PostDetailPage.css';

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const COMMENTS_FETCH_LIMIT = 120;
const TIMESTAMP_PATTERN = /(\d{1,2}:\d{2})/g;

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('ja-JP', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function isEdited(createdAt, updatedAt) {
  const created = createdAt?.toMillis?.() ?? 0;
  const updated = updatedAt?.toMillis?.() ?? 0;
  return updated > created + 60 * 1000;
}

function getCreatedAtMillis(timestamp) {
  return timestamp?.toMillis?.() ?? 0;
}

function formatSeconds(value) {
  const sec = Math.max(0, Math.floor(value));
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function toSecondsFromTimestamp(timestampText) {
  const [minutesText, secondsText] = timestampText.split(':');
  const minutes = Number(minutesText);
  const seconds = Number(secondsText);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  return minutes * 60 + seconds;
}

function findRootCommentId(comment, byId) {
  let current = comment;
  const visited = new Set();

  while (current?.replyToCommentId && byId.has(current.replyToCommentId)) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    current = byId.get(current.replyToCommentId);
  }

  return current?.id ?? comment.id;
}

function buildThreadedComments(rawComments) {
  const byId = new Map(rawComments.map((comment) => [comment.id, comment]));
  const childrenByParent = new Map();

  rawComments.forEach((comment) => {
    if (!comment.replyToCommentId || !byId.has(comment.replyToCommentId)) return;
    const children = childrenByParent.get(comment.replyToCommentId) ?? [];
    children.push(comment);
    childrenByParent.set(comment.replyToCommentId, children);
  });

  childrenByParent.forEach((children, parentId) => {
    children.sort((a, b) => getCreatedAtMillis(a.createdAt) - getCreatedAtMillis(b.createdAt));
    childrenByParent.set(parentId, children);
  });

  const topLevel = rawComments
    .filter((comment) => !comment.replyToCommentId || !byId.has(comment.replyToCommentId))
    .sort((a, b) => getCreatedAtMillis(b.createdAt) - getCreatedAtMillis(a.createdAt));

  const bestAnswer = rawComments.find((comment) => comment.isBestAnswer);
  if (bestAnswer) {
    const bestRootId = findRootCommentId(bestAnswer, byId);
    topLevel.sort((a, b) => {
      if (a.id === bestRootId) return -1;
      if (b.id === bestRootId) return 1;
      return getCreatedAtMillis(b.createdAt) - getCreatedAtMillis(a.createdAt);
    });
  }

  const ordered = [];

  const appendThread = (comment, depth = 0, lineage = new Set()) => {
    if (lineage.has(comment.id)) return;
    const nextLineage = new Set(lineage);
    nextLineage.add(comment.id);

    ordered.push({
      ...comment,
      threadDepth: depth,
    });

    const children = childrenByParent.get(comment.id) ?? [];
    children.forEach((child) => appendThread(child, depth + 1, nextLineage));
  };

  topLevel.forEach((comment) => appendThread(comment));

  return ordered;
}

export function PostDetailPage() {
  const { postId } = useParams();
  const { firebaseUser, userData } = useAuth();
  const navigate = useNavigate();

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [authorMetaByUid, setAuthorMetaByUid] = useState({});
  const [postLoading, setPostLoading] = useState(true);
  const [postError, setPostError] = useState(false);

  // 音源プレイヤー
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastSeekReturnTime, setLastSeekReturnTime] = useState(null);

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
        orderBy('createdAt', 'desc'),
        limit(COMMENTS_FETCH_LIMIT)
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setComments(buildThreadedComments(docs));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPost();
    fetchComments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  useEffect(() => {
    let cancelled = false;

    const fetchCommentAuthorPhotos = async () => {
      const uniqueAuthorUids = [...new Set([
        post?.authorUid,
        ...comments.map((comment) => comment.authorUid),
      ].filter(Boolean))];
      if (uniqueAuthorUids.length === 0) {
        if (!cancelled) setAuthorMetaByUid({});
        return;
      }

      try {
        const { hitMap, missUids } = getCachedAvatarMetaByUids(uniqueAuthorUids);
        const nextMap = { ...hitMap };

        if (!cancelled && Object.keys(hitMap).length > 0) {
          setAuthorMetaByUid(nextMap);
        }

        if (missUids.length === 0) {
          if (!cancelled) setAuthorMetaByUid(nextMap);
          return;
        }

        const chunks = [];
        for (let i = 0; i < missUids.length; i += 30) {
          chunks.push(missUids.slice(i, i + 30));
        }

        const snapshots = await Promise.all(
          chunks.map((uids) => getDocs(query(collection(db, 'users'), where(documentId(), 'in', uids))))
        );

        const fetchedMetaByUid = {};
        snapshots.forEach((snapshot) => {
          snapshot.docs.forEach((userDoc) => {
            const data = userDoc.data() ?? {};
            const meta = {
              photoUrl: data.photoUrl ?? null,
              isSpecial: isSpecialSkinUserId(data.userId),
            };
            fetchedMetaByUid[userDoc.id] = meta;
            nextMap[userDoc.id] = meta;
          });
        });

        if (Object.keys(fetchedMetaByUid).length > 0) {
          mergeAvatarMetaCache(fetchedMetaByUid);
        }

        if (!cancelled) setAuthorMetaByUid(nextMap);
      } catch (err) {
        console.error(err);
      }
    };

    fetchCommentAuthorPhotos();

    return () => {
      cancelled = true;
    };
  }, [comments, post?.authorUid]);

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
    setLastSeekReturnTime(null);
  };

  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio * 100);
  };

  const seekToSecond = (seconds) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const next = Math.min(Math.max(seconds, 0), Math.floor(audio.duration));
    audio.currentTime = next;
    setProgress((next / audio.duration) * 100);
    if (!isPlaying) {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleFocusSecondJump = () => {
    const audio = audioRef.current;
    const focusSecondSec = Number(post?.focusSecondSec ?? -1);
    if (!audio || !audio.duration || !Number.isFinite(focusSecondSec) || focusSecondSec < 0) return;

    const target = Math.min(Math.max(focusSecondSec, 0), Math.floor(audio.duration));
    if (lastSeekReturnTime != null && Math.abs(audio.currentTime - target) < 1) {
      seekToSecond(lastSeekReturnTime);
      setLastSeekReturnTime(null);
      return;
    }

    setLastSeekReturnTime(audio.currentTime);
    seekToSecond(target);
  };

  const renderTextWithTimestampLinks = (text, keyPrefix) => {
    const safeText = text ?? '';
    const durationSec = Number(post?.audioDurationSec ?? 0);
    if (!safeText || durationSec <= 0) return safeText;

    const parts = safeText.split(TIMESTAMP_PATTERN);

    return parts.map((part, index) => {
      if (!part) return null;
      if (!/^\d{1,2}:\d{2}$/.test(part)) {
        return <span key={`${keyPrefix}-text-${index}`}>{part}</span>;
      }

      const seconds = toSecondsFromTimestamp(part);
      if (!Number.isFinite(seconds) || seconds > durationSec) {
        return <span key={`${keyPrefix}-time-${index}`}>{part}</span>;
      }

      return (
        <button
          key={`${keyPrefix}-btn-${index}`}
          type="button"
          className="detail-time-link"
          onClick={() => seekToSecond(seconds)}
        >
          {part}
        </button>
      );
    });
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
    const trimmedBody = commentBody.trim();
    if (!trimmedBody) {
      setCommentError('コメントを入力してください。');
      return;
    }
    setCommentError('');
    setCommentLoading(true);
    try {
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
        authorUserId: userData?.userId ?? null,
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
      setComments((prev) => buildThreadedComments(prev.filter((c) => c.id !== commentId)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeletePost = async () => {
    if (!post) return;
    if (!window.confirm('この投稿を削除しますか？\n関連するコメントもすべて削除されます。')) return;
    try {
      const commentsSnap = await getDocs(
        query(collection(db, 'comments'), where('postId', '==', post.id))
      );
      const batch = writeBatch(db);
      commentsSnap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(doc(db, 'posts', post.id));
      await batch.commit();
      navigate('/mypage');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCommentTap = (e, commentId) => {
    e.stopPropagation();
    handleDeleteComment(commentId);
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
  const postAuthorMeta = authorMetaByUid[post.authorUid] ?? null;
  const postAuthorPhotoUrl = postAuthorMeta?.photoUrl ?? post.authorPhotoUrl ?? null;
  const isPostAuthorSpecial = Boolean(postAuthorMeta?.isSpecial);
  const postDurationSec = Number(post.audioDurationSec ?? 0);
  const focusSecondSec = Number(post.focusSecondSec ?? -1);
  const hasFocusSecond = Number.isFinite(focusSecondSec) && focusSecondSec >= 0;
  const postIsEdited = isEdited(post.createdAt, post.updatedAt);

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
          {isPostAuthor && (
            <>
              <button
                type="button"
                className="detail-post__edit-btn"
                onClick={() => navigate(`/post/${post.id}/edit`)}
                aria-label="投稿を編集"
              >
                ✏️
              </button>
              <button
                type="button"
                className="detail-post__delete-btn"
                onClick={handleDeletePost}
                aria-label="投稿を削除"
              >
                🗑
              </button>
            </>
          )}

          <button
            className="detail-author"
            onClick={() => navigate(`/users/${post.authorUid}`)}
          >
            <span className={`detail-author__avatar-shell ${isPostAuthorSpecial ? 'detail-author__avatar-shell--special' : ''}`}>
              {postAuthorPhotoUrl ? (
                <img
                  className="detail-author__avatar"
                  src={postAuthorPhotoUrl}
                  alt=""
                  decoding="sync"
                  fetchPriority="high"
                />
              ) : (
                <div className="detail-author__avatar-fallback">{initial}</div>
              )}
            </span>
            <span className="detail-author__name">{post.authorDisplayName}</span>
          </button>

          <div className="detail-meta">
            {post.worryGenre && <span className="detail-tag">{post.worryGenre}</span>}
            {post.musicGenre && <span className="detail-tag">{post.musicGenre}</span>}
            {post.daw && <span className="detail-tag">{post.daw}</span>}
            {post.isSolved && <span className="detail-tag detail-tag--solved">解決済み</span>}
            <span className="detail-date">{formatDate(post.createdAt)}</span>
            {postIsEdited && <span className="detail-edited-date">編集: {formatDate(post.updatedAt)}</span>}
          </div>

          <p className="detail-body">{renderTextWithTimestampLinks(post.body, 'post-body')}</p>

          {post.imageUrl && (
            <img className="detail-image" src={post.imageUrl} alt="" loading="lazy" decoding="async" />
          )}

          {post.audioUrl && (
            <div className="detail-audio">
              <button
                className={`detail-play-btn ${isPlaying ? 'is-playing' : ''}`}
                onClick={handlePlayToggle}
                aria-label={isPlaying ? '一時停止' : '再生'}
              >
                <span className="detail-play-icon" aria-hidden="true" />
              </button>
              {postDurationSec > 0 && (
                <span className="detail-duration">{formatSeconds(postDurationSec)}</span>
              )}
              {hasFocusSecond && (
                <button
                  type="button"
                  className="detail-focus-chip"
                  onClick={handleFocusSecondJump}
                >
                  {lastSeekReturnTime != null ? '元に戻る' : `${formatSeconds(focusSecondSec)}へ`}
                </button>
              )}
              <div
                className={`detail-progress-bar${isPlaying ? ' is-playing' : ''}`}
                onClick={handleSeek}
                onTouchStart={handleSeek}
                role="slider"
                aria-label="再生位置"
                aria-valuenow={Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
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
            {comments.map((comment) => {
              const commentAuthorMeta = authorMetaByUid[comment.authorUid] ?? null;
              const resolvedAuthorPhotoUrl = commentAuthorMeta?.photoUrl ?? comment.authorPhotoUrl ?? null;
              // authorUserId が保存済みなら即判定、なければキャッシュから取得
              const isCommentAuthorSpecial = comment.authorUserId
                ? isSpecialSkinUserId(comment.authorUserId)
                : Boolean(commentAuthorMeta?.isSpecial);

              return (
                <li
                  key={comment.id}
                  className={`detail-comment ${comment.isBestAnswer ? 'detail-comment--best' : ''} ${comment.threadDepth > 0 ? 'detail-comment--reply' : ''}`}
                  style={{ '--reply-depth': Math.min(comment.threadDepth ?? 0, 4) }}
                >
                <div className="detail-comment__header">
                  <div className="detail-comment__author">
                    <button
                      type="button"
                      className={`detail-comment__author-link ${isCommentAuthorSpecial ? 'detail-comment__author-link--special' : ''}`}
                      onClick={() => navigate(`/users/${comment.authorUid}`)}
                      aria-label={`${comment.authorDisplayName ?? 'ユーザー'}のプロフィールを開く`}
                    >
                      {resolvedAuthorPhotoUrl ? (
                        <img className="detail-comment__avatar" src={resolvedAuthorPhotoUrl} alt="" loading="lazy" fetchPriority="low" decoding="async" />
                      ) : (
                        <div className="detail-comment__avatar-fallback">
                          {comment.authorDisplayName?.[0]?.toUpperCase() ?? '?'}
                        </div>
                      )}
                    </button>
                    <span className="detail-comment__name">{comment.authorDisplayName}</span>
                    {comment.isBestAnswer && (
                      <span className="detail-comment__best-badge">ベストアンサー</span>
                    )}
                  </div>
                  {isPostAuthor && (
                    <button
                      type="button"
                      className="detail-comment__delete-btn"
                      onClick={(e) => handleDeleteCommentTap(e, comment.id)}
                      onPointerUp={(e) => handleDeleteCommentTap(e, comment.id)}
                      onPointerDown={(e) => e.stopPropagation()}
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

                <p className="detail-comment__body">
                  {renderTextWithTimestampLinks(comment.body, `comment-${comment.id}`)}
                </p>

                {comment.imageUrl && (
                  <img className="detail-comment__image" src={comment.imageUrl} alt="" loading="lazy" decoding="async" />
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
              );
            })}
          </ul>
        </section>
      </main>

      <BottomNav active="" />

      <button className="fab" onClick={handleFabClick} aria-label="コメントを追加">
        <span className="fab__label">{showCommentForm ? '閉じる' : 'コメントする'}</span>
      </button>
    </div>
  );
}
