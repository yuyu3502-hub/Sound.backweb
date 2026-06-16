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

const GUEST_GENRE_OPTIONS = ['AI作曲', 'DTM', 'その他'];
const GUEST_GENRE_KEY = 'soundback_guest_genre';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState('best');
  const [guestGenre, setGuestGenre] = useState(() => {
    if (typeof window === 'undefined') return null;
    const saved = window.sessionStorage.getItem(GUEST_GENRE_KEY);
    return saved && GUEST_GENRE_OPTIONS.includes(saved) ? saved : null;
  });
  const { firebaseUser, userData } = useAuth();
  const navigate = useNavigate();

  const classifyGuestGenre = (post) => {
    const worryGenre = String(post.worryGenre ?? '');
    const daw = String(post.daw ?? '');
    const body = String(post.body ?? '').toLowerCase();
    const musicGenre = String(post.musicGenre ?? '').toLowerCase();

    if (worryGenre === 'AI作曲') return 'AI作曲';

    if (/(ai|生成|suno|udio|vocaloid|ボカロ)/i.test(body) || /ai|ボカロ|vocaloid/i.test(musicGenre)) {
      return 'AI作曲';
    }

    if (worryGenre === 'DAW操作' || daw) {
      return 'DTM';
    }

    return 'その他';
  };

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

  const clearGuestGenre = () => {
    setGuestGenre(null);
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(GUEST_GENRE_KEY);
    }
  };

  const handleGuestGenreSelect = (genre) => {
    if (guestGenre === genre) {
      clearGuestGenre();
      return;
    }
    setGuestGenre(genre);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(GUEST_GENRE_KEY, genre);
    }
  };

  const guestFilteredPosts = firebaseUser || !guestGenre
    ? posts
    : posts.filter((post) => classifyGuestGenre(post) === guestGenre);

  const searchedPosts = searchTerm.trim()
    ? guestFilteredPosts.filter((post) => {
        const needle = searchTerm.trim().toLowerCase();
        return [post.title, post.body, post.worryGenre, post.musicGenre, post.daw, post.authorDisplayName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      })
    : guestFilteredPosts;

  const visiblePosts = [...searchedPosts].sort((a, b) => {
    if (sortMode === 'new') {
      return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
    }
    if (sortMode === 'comments') {
      return (replyCountByPostId[b.id] ?? 0) - (replyCountByPostId[a.id] ?? 0);
    }
    return ((replyCountByPostId[b.id] ?? 0) * 2 + (b.audioUrl ? 8 : 0)) -
      ((replyCountByPostId[a.id] ?? 0) * 2 + (a.audioUrl ? 8 : 0));
  });

  const showGuestFilteredEmpty = !firebaseUser && Boolean(guestGenre) && !loading && !error && visiblePosts.length === 0;
  const communityStats = {
    members: posts.length > 0 ? `${Math.max(1200, posts.length * 148).toLocaleString('ja-JP')}` : '1,248',
    weeklyPosts: posts.length > 0 ? `${Math.max(posts.length * 3, 24)}` : '24',
    answers: Object.values(replyCountByPostId).reduce((sum, count) => sum + count, 0),
  };

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="home-header__inner">
          <button className="home-header__menu" aria-label="メニュー">
            <span />
            <span />
            <span />
          </button>
          <h1 className="home-header__logo" aria-label="Sound.back">
            <span className="home-header__logo-main">Sound</span>
            <span className="home-header__logo-dot">.</span>
            <span className="home-header__logo-sub">back</span>
          </h1>
          <label className="home-header__search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Sound.back を検索してください"
            />
          </label>
          <button
            className="home-header__create"
            onClick={() => navigate(firebaseUser ? '/create' : '/auth')}
          >
            ＋ 作成
          </button>
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

          <div className="home-guest-genre">
            <p className="home-guest-genre__title">気になるジャンルを選んで投稿を見る</p>
            <div className="home-guest-genre__chips">
              <button
                type="button"
                className={`home-guest-genre__chip ${guestGenre === null ? 'is-active' : ''}`}
                onClick={clearGuestGenre}
              >
                すべて
              </button>
              {GUEST_GENRE_OPTIONS.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  className={`home-guest-genre__chip ${guestGenre === genre ? 'is-active' : ''}`}
                  onClick={() => handleGuestGenreSelect(genre)}
                >
                  {genre}
                </button>
              ))}
            </div>
            {!guestGenre && <p className="home-guest-genre__note">最新の投稿を表示中</p>}
          </div>
        </div>
      )}

      <main className="home-main">
        <section className="home-feed" aria-label="投稿フィード">
          <div className="home-feed-toolbar">
            <div className="home-feed-toolbar__sort" aria-label="並び替え">
              <button
                type="button"
                className={sortMode === 'best' ? 'is-active' : ''}
                onClick={() => setSortMode('best')}
              >
                賛成票順
              </button>
              <button
                type="button"
                className={sortMode === 'new' ? 'is-active' : ''}
                onClick={() => setSortMode('new')}
              >
                新着
              </button>
              <button
                type="button"
                className={sortMode === 'comments' ? 'is-active' : ''}
                onClick={() => setSortMode('comments')}
              >
                返信数
              </button>
            </div>
            <button className="home-feed-toolbar__view" type="button" aria-label="カード表示">
              ▭
            </button>
          </div>

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

          {!loading && !error && visiblePosts.length === 0 && (
            <p className="home-state">投稿はまだありません。</p>
          )}

          {showGuestFilteredEmpty && (
            <p className="home-state">この条件ではまだ投稿が見つかりません。別のジャンルや検索語も試してみてください。</p>
          )}

          {visiblePosts.length > 0 && (
            <>
              <ul className="home-post-list">
                {visiblePosts.map((post) => (
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
        </section>

        <aside className="home-sidebar" aria-label="コミュニティ情報">
          <section className="home-community">
            <div className="home-community__banner" />
            <div className="home-community__body">
              <div className="home-community__title-row">
                <h2>r/Soundback</h2>
                <button onClick={() => navigate(firebaseUser ? '/create' : '/auth')}>参加</button>
              </div>
              <p>
                ミックス、AI作曲、DTMの悩みを投稿して、音を聴いた人から具体的な返信をもらうコミュニティ。
              </p>
              <dl className="home-community__stats">
                <div>
                  <dt>{communityStats.members}</dt>
                  <dd>メンバー</dd>
                </div>
                <div>
                  <dt>{communityStats.weeklyPosts}</dt>
                  <dd>週間投稿</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="home-sidebar-panel">
            <h2>情報源</h2>
            <p>返信合計 {communityStats.answers.toLocaleString('ja-JP')} 件</p>
            <p>投稿候補を読み、AI回答を確認し、n8n に流す候補を選ぶためのフィード。</p>
          </section>

          <section className="home-sidebar-panel">
            <h2>ルール</h2>
            <ol>
              <li>音源や悩みの文脈を添える</li>
              <li>具体的に聴いた箇所を書く</li>
              <li>宣伝だけの投稿は控える</li>
            </ol>
          </section>
        </aside>
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
