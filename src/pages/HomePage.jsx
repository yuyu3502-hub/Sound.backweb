import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { usePosts } from '../hooks/usePosts';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { PostCard } from '../components/PostCard';
import { BottomNav } from '../components/BottomNav';
import { isSpecialSkinUserId } from '../utils/specialAvatar';
import { getCachedAvatarMetaByUids, mergeAvatarMetaCache } from '../utils/avatarMetaCache';
import { fetchReplyCountByPostIds } from '../utils/replyCountCache';
import './HomePage.css';

function scheduleWhenIdle(task) {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    const idleId = window.requestIdleCallback(task, { timeout: 1200 });
    return () => window.cancelIdleCallback(idleId);
  }

  const timeoutId = window.setTimeout(task, 120);
  return () => window.clearTimeout(timeoutId);
}

export function HomePage() {
  const { posts, loading, error, hasMore, loadingMore, fetchMore, refresh } =
    usePosts();
  const [currentPlayingId, setCurrentPlayingId] = useState(null);
  const [authorPhotoByUid, setAuthorPhotoByUid] = useState({});
  const [specialAuthorByUid, setSpecialAuthorByUid] = useState({});
  const [replyCountByPostId, setReplyCountByPostId] = useState({});
  const { firebaseUser, userData } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    let cancelScheduledTask = null;

    const fetchAuthorPhotos = async () => {
      const uniqueAuthorUids = [...new Set(posts.map((post) => post.authorUid).filter(Boolean))];
      if (uniqueAuthorUids.length === 0) {
        if (!cancelled) {
          setAuthorPhotoByUid({});
          setSpecialAuthorByUid({});
        }
        return;
      }

      try {
        const { hitMap, missUids } = getCachedAvatarMetaByUids(uniqueAuthorUids);
        const nextMap = {};
        const specialMap = {};

        Object.entries(hitMap).forEach(([uid, meta]) => {
          nextMap[uid] = meta.photoUrl ?? null;
          specialMap[uid] = Boolean(meta.isSpecial);
        });

        if (!cancelled && Object.keys(hitMap).length > 0) {
          setAuthorPhotoByUid(nextMap);
          setSpecialAuthorByUid(specialMap);
        }

        if (missUids.length === 0) {
          if (!cancelled) {
            setAuthorPhotoByUid(nextMap);
            setSpecialAuthorByUid(specialMap);
          }
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
            nextMap[userDoc.id] = meta.photoUrl;
            specialMap[userDoc.id] = meta.isSpecial;
          });
        });

        if (Object.keys(fetchedMetaByUid).length > 0) {
          mergeAvatarMetaCache(fetchedMetaByUid);
        }

        if (!cancelled) {
          setAuthorPhotoByUid(nextMap);
          setSpecialAuthorByUid(specialMap);
        }
      } catch (err) {
        console.error(err);
      }
    };

    cancelScheduledTask = scheduleWhenIdle(() => {
      fetchAuthorPhotos();
    });

    return () => {
      cancelled = true;
      if (cancelScheduledTask) cancelScheduledTask();
    };
  }, [posts]);

  useEffect(() => {
    let cancelled = false;
    let cancelScheduledTask = null;

    const fetchReplyCounts = async () => {
      const postIds = posts.map((post) => post.id).filter(Boolean);
      if (postIds.length === 0) {
        if (!cancelled) setReplyCountByPostId({});
        return;
      }

      try {
        const countByPostId = await fetchReplyCountByPostIds(db, postIds);
        if (!cancelled) setReplyCountByPostId(countByPostId);
      } catch (err) {
        console.error(err);
      }
    };

    cancelScheduledTask = scheduleWhenIdle(() => {
      fetchReplyCounts();
    });

    return () => {
      cancelled = true;
      if (cancelScheduledTask) cancelScheduledTask();
    };
  }, [posts]);

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
        <div className="home-header__inner">
          <h1 className="home-header__logo" aria-label="Sound.back">
            <span className="home-header__logo-main">Sound</span>
            <span className="home-header__logo-dot">.</span>
            <span className="home-header__logo-sub">back</span>
          </h1>
          <button
            className="home-header__avatar-btn"
            onClick={() => navigate(firebaseUser ? '/mypage' : '/auth')}
            aria-label="マイページ"
          >
            {userData?.photoUrl ? (
              <img
                src={userData.photoUrl}
                alt=""
                className="home-header__avatar"
                decoding="sync"
                fetchPriority="high"
              />
            ) : (
              <div className="home-header__avatar-fallback">
                {userData?.displayName?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
          </button>
        </div>
      </header>

      {!firebaseUser && (
        <div className="home-hero">
          <ul className="home-hero__bubbles">
            <li className="home-hero__bubble">なんかプロっぽくならない</li>
            <li className="home-hero__bubble">音がスカスカ…</li>
            <li className="home-hero__bubble">ボーカルが埋もれる...</li>
          </ul>
          <p className="home-hero__catch">ミックス、一人で悩んでない？</p>
          <p className="home-hero__sub">アドバイスをもらって前に進もう</p>
          <button className="home-hero__cta" onClick={() => navigate('/auth')}>
            無料ではじめる
          </button>
        </div>
      )}

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
                    showSolvedBadge
                    authorPhotoUrlOverride={authorPhotoByUid[post.authorUid] ?? null}
                    isSpecialAvatar={Boolean(specialAuthorByUid[post.authorUid])}
                    replyCount={replyCountByPostId[post.id] ?? 0}
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
        onClick={() => navigate(firebaseUser ? '/create' : '/auth')}
        aria-label="投稿する"
      >
        <span className="fab__label">悩みを投稿</span>
      </button>
    </div>
  );
}
