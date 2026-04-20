import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection, query, where, orderBy, getDocs, doc, getDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { PostCard } from '../components/PostCard';
import { BottomNav } from '../components/BottomNav';
import './UserPage.css';

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

export function UserPage() {
  const { uid } = useParams();
  const navigate = useNavigate();

  const [userData, setUserData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [playingId, setPlayingId] = useState(null);

  useEffect(() => {
    if (!uid) return;
    loadUser();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const loadUser = async () => {
    setLoading(true);
    try {
      // ユーザー情報
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (!userSnap.exists()) {
        setNotFound(true);
        return;
      }
      setUserData({ uid, ...userSnap.data() });

      // 投稿一覧
      const q = query(
        collection(db, 'posts'),
        where('authorUid', '==', uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPosts(docs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const unsolved = posts.filter((p) => !p.isSolved);
  const solved = posts.filter((p) => p.isSolved);

  if (loading) {
    return (
      <div className="user-page">
        <p className="user-page-loading">読み込み中...</p>
        <BottomNav active="" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="user-page">
        <header className="user-page-header">
          <button className="user-page-back-btn" onClick={() => navigate(-1)}>← 戻る</button>
        </header>
        <p className="user-page-empty">ユーザーが見つかりませんでした。</p>
        <BottomNav active="" />
      </div>
    );
  }

  const initial = userData?.displayName?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="user-page">
      <header className="user-page-header">
        <button className="user-page-back-btn" onClick={() => navigate(-1)}>← 戻る</button>
        <h1 className="user-page-title">プロフィール</h1>
      </header>

      <main className="user-page-main">
        {/* プロフィールエリア */}
        <section className="user-profile">
          <div className="user-profile__avatar-wrap">
            {userData?.photoUrl ? (
              <img className="user-profile__avatar" src={userData.photoUrl} alt="" />
            ) : (
              <div className="user-profile__avatar-fallback">{initial}</div>
            )}
          </div>
          <div className="user-profile__info">
            <p className="user-profile__id">@{userData?.userId ?? '---'}</p>
            <p className="user-profile__name">{userData?.displayName ?? '---'}</p>
            {userData?.bio && (
              <p className="user-profile__bio">{userData.bio}</p>
            )}
          </div>
        </section>

        {/* 未解決の投稿 */}
        <section className="user-posts-section">
          <h2 className="user-posts-heading">未解決のお悩み ({unsolved.length})</h2>
          {unsolved.length === 0 ? (
            <p className="user-posts-empty">未解決のお悩みはありません</p>
          ) : (
            <div className="user-posts-list">
              {unsolved.map((post) => (
                <div
                  key={post.id}
                  className="user-posts-item"
                  onClick={() => navigate(`/post/${post.id}`)}
                >
                  <PostCard
                    post={post}
                    isPlaying={playingId === post.id}
                    onPlay={(id) => setPlayingId(id)}
                  />
                  <p className="user-posts-date">{formatDate(post.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 解決済みの投稿 */}
        <section className="user-posts-section">
          <h2 className="user-posts-heading">解決済みのお悩み ({solved.length})</h2>
          {solved.length === 0 ? (
            <p className="user-posts-empty">解決済みのお悩みはありません</p>
          ) : (
            <div className="user-posts-list">
              {solved.map((post) => (
                <div
                  key={post.id}
                  className="user-posts-item"
                  onClick={() => navigate(`/post/${post.id}`)}
                >
                  <PostCard
                    post={post}
                    isPlaying={playingId === post.id}
                    onPlay={(id) => setPlayingId(id)}
                  />
                  <p className="user-posts-date">{formatDate(post.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <BottomNav active="" />
    </div>
  );
}
