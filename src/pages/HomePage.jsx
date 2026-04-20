import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePosts } from '../hooks/usePosts';
import { useAuth } from '../context/AuthContext';
import { PostCard } from '../components/PostCard';
import { BottomNav } from '../components/BottomNav';
import './HomePage.css';

export function HomePage() {
  const { posts, loading, error, hasMore, loadingMore, fetchMore, refresh } =
    usePosts();
  const [currentPlayingId, setCurrentPlayingId] = useState(null);
  const { firebaseUser, userData } = useAuth();
  const navigate = useNavigate();

  const handleHomeClick = () => {
    refresh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCardClick = (postId) => {
    navigate(`/post/${postId}`);
  };

  return (
    <div className="home-page">
      <header className="home-header">
        <h1 className="home-header__logo">SoundBack</h1>
        <button
          className="home-header__avatar-btn"
          onClick={() => navigate(firebaseUser ? '/mypage' : '/auth')}
          aria-label="マイページ"
        >
          {userData?.photoUrl ? (
            <img src={userData.photoUrl} alt="" className="home-header__avatar" />
          ) : (
            <div className="home-header__avatar-fallback">
              {userData?.displayName?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
        </button>
      </header>

      <main className="home-main">
        {loading && <p className="home-state">読み込み中...</p>}

        {error && (
          <div className="home-state">
            <p>投稿の読み込みに失敗しました。</p>
            <p className="home-state__error-detail">{error?.message ?? 'エラー内容を取得できませんでした。'}</p>
            <button className="home-retry-btn" onClick={refresh}>
              再読み込み
            </button>
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <p className="home-state">投稿はまだありません。</p>
        )}

        {posts.length > 0 && (
          <>
            <ul className="home-post-list">
              {posts.map((post) => (
                <li key={post.id} onClick={() => handleCardClick(post.id)}>
                  <PostCard
                    post={post}
                    isPlaying={currentPlayingId === post.id}
                    onPlay={setCurrentPlayingId}
                  />
                </li>
              ))}
            </ul>

            {hasMore && (
              <button
                className="home-load-more"
                onClick={fetchMore}
                disabled={loadingMore}
              >
                {loadingMore ? '読み込み中...' : 'もっと見る'}
              </button>
            )}
          </>
        )}
      </main>

      <BottomNav active="home" onHomeClick={handleHomeClick} />

      <button
        className="fab"
        onClick={() => navigate('/create')}
        aria-label="投稿する"
      >
        +
      </button>
    </div>
  );
}
