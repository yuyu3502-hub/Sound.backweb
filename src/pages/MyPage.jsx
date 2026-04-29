import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import {
  collection, query, where, getDocs, limit, getCountFromServer,
  doc, writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import './MyPage.css';

const MY_POSTS_LIMIT = 60;

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

function isEdited(createdAt, updatedAt) {
  const created = createdAt?.toMillis?.() ?? 0;
  const updated = updatedAt?.toMillis?.() ?? 0;
  return updated > created + 60 * 1000;
}

export function MyPage() {
  const { firebaseUser, userData, isLoading } = useAuth();
  const navigate = useNavigate();

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bestAnswerCount, setBestAnswerCount] = useState(0);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  useEffect(() => {
    if (isLoading) return;
    if (!firebaseUser) {
      navigate('/auth');
      return;
    }
    fetchMyPosts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, isLoading]);

  const fetchMyPosts = async () => {
    setLoading(true);
    try {
      const postsQuery = query(
        collection(db, 'posts'),
        where('authorUid', '==', firebaseUser.uid),
        limit(MY_POSTS_LIMIT)
      );
      const bestAnswersQuery = query(
        collection(db, 'comments'),
        where('authorUid', '==', firebaseUser.uid),
        where('isBestAnswer', '==', true)
      );

      const [snapshot, bestAnswersSnapshot] = await Promise.all([
        getDocs(postsQuery),
        getCountFromServer(bestAnswersQuery),
      ]);
      const docs = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() ?? 0;
          const bTime = b.createdAt?.toMillis?.() ?? 0;
          return bTime - aTime;
        });
      setPosts(docs);
      setBestAnswerCount(bestAnswersSnapshot.data().count ?? 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePost = async (postId) => {
    if (!window.confirm('この投稿を削除しますか？\n関連するコメントもすべて削除されます。')) return;
    try {
      // コメントを全件取得して削除
      const commentsSnap = await getDocs(
        query(collection(db, 'comments'), where('postId', '==', postId))
      );
      const batch = writeBatch(db);
      commentsSnap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(doc(db, 'posts', postId));
      await batch.commit();
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    setLogoutError('');
    setLogoutLoading(true);
    try {
      await signOut(auth);
      navigate('/auth');
    } catch (err) {
      console.error(err);
      setLogoutError('ログアウトに失敗しました。もう一度お試しください。');
    } finally {
      setLogoutLoading(false);
    }
  };

  const unsolved = posts.filter((p) => !p.isSolved);
  const solved = posts.filter((p) => p.isSolved);

  const initial = userData?.displayName?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="mypage">
      <header className="mypage-header">
        <button className="mypage-back-btn" onClick={() => navigate('/')}>
          ← ホーム
        </button>
        <h1 className="mypage-title">マイページ</h1>
      </header>

      <main className="mypage-main">
        {/* プロフィールエリア */}
        <section className="mypage-profile">
          <div className="mypage-profile__avatar-wrap">
            {userData?.photoUrl ? (
              <img
                className="mypage-profile__avatar"
                src={userData.photoUrl}
                alt=""
                decoding="sync"
                fetchPriority="high"
              />
            ) : (
              <div className="mypage-profile__avatar-fallback">{initial}</div>
            )}
          </div>
          <div className="mypage-profile__info">
            <p className="mypage-profile__id">@{userData?.userId ?? '---'}</p>
            <p className="mypage-profile__name">{userData?.displayName ?? ''}</p>
            {userData?.bio && (
              <p className="mypage-profile__bio">{userData.bio}</p>
            )}
            {bestAnswerCount > 0 && (
              <span className="mypage-profile__best-badge">
                ★ ベストアンサー {bestAnswerCount}回
              </span>
            )}
          </div>
          <button
            className="mypage-profile__edit-btn"
            onClick={() => navigate('/profile/edit')}
          >
            編集
          </button>
          <button
            className="mypage-profile__logout-btn"
            onClick={handleLogout}
            disabled={logoutLoading}
          >
            {logoutLoading ? 'ログアウト中...' : 'ログアウト'}
          </button>
        </section>

        {logoutError && <p className="mypage-error">{logoutError}</p>}

        {/* 投稿一覧 */}
        {loading ? (
          <p className="mypage-state">読み込み中...</p>
        ) : posts.length === 0 ? (
          <p className="mypage-state">投稿はまだありません。</p>
        ) : (
          <>
            {/* 未解決 */}
            {unsolved.length > 0 && (
              <section className="mypage-section">
                <h2 className="mypage-section__title">未解決（{unsolved.length}）</h2>
                <ul className="mypage-post-list">
                  {unsolved.map((post) => (
                    <PostCardItem
                      key={post.id}
                      post={post}
                      onCardClick={() => navigate(`/post/${post.id}`)}
                      onEdit={() => navigate(`/post/${post.id}/edit`)}
                      onDelete={() => handleDeletePost(post.id)}
                    />
                  ))}
                </ul>
              </section>
            )}

            {/* 解決済み */}
            {solved.length > 0 && (
              <section className="mypage-section">
                <h2 className="mypage-section__title">解決済み（{solved.length}）</h2>
                <ul className="mypage-post-list">
                  {solved.map((post) => (
                    <PostCardItem
                      key={post.id}
                      post={post}
                      onCardClick={() => navigate(`/post/${post.id}`)}
                      onEdit={() => navigate(`/post/${post.id}/edit`)}
                      onDelete={() => handleDeletePost(post.id)}
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>

      <BottomNav active="" />

      <button className="fab" onClick={() => navigate(firebaseUser ? '/create' : '/auth')} aria-label="投稿する">
        <span className="fab__label">悩みを投稿</span>
      </button>
    </div>
  );
}

function PostCardItem({ post, onCardClick, onEdit, onDelete }) {
  const hasAllGenres = Boolean(post.worryGenre && post.musicGenre && post.daw);
  const postIsEdited = isEdited(post.createdAt, post.updatedAt);

  const handleDeleteTap = (e) => {
    e.stopPropagation();
    onDelete();
  };

  const handleEditTap = (e) => {
    e.stopPropagation();
    onEdit();
  };

  return (
    <li className="mypage-post-card">
      <button className="mypage-post-card__body-area" onClick={onCardClick}>
        <div className="mypage-post-card__meta">
          <span className="mypage-post-card__date">
            {formatDate(post.createdAt)}
          </span>
          {postIsEdited && (
            <span className="mypage-post-card__edited-badge">編集済み</span>
          )}
          {post.isSolved && (
            <span className="mypage-post-card__badge">解決済み</span>
          )}
          {post.audioUrl && (
            <span className="mypage-post-card__audio-badge">🎵</span>
          )}
        </div>
        <p className="mypage-post-card__text">{post.body}</p>
        {hasAllGenres && (
          <div className="mypage-post-card__tags">
            <span className="mypage-post-card__tag">{post.worryGenre}</span>
            <span className="mypage-post-card__tag">{post.musicGenre}</span>
            <span className="mypage-post-card__tag">{post.daw}</span>
          </div>
        )}
        {post.imageUrl && (
          <img className="mypage-post-card__thumb" src={post.imageUrl} alt="" loading="lazy" decoding="async" />
        )}
      </button>
      <button
        type="button"
        className="mypage-post-card__edit-btn"
        onClick={handleEditTap}
        onPointerUp={handleEditTap}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="投稿を編集"
      >
        ✏️
      </button>
      <button
        type="button"
        className="mypage-post-card__delete-btn"
        onClick={handleDeleteTap}
        onPointerUp={handleDeleteTap}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="投稿を削除"
      >
        🗑
      </button>
    </li>
  );
}
