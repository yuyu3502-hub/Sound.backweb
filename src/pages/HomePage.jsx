import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { usePosts } from '../hooks/usePosts';
import { useAuth } from '../context/AuthContext';
import { db, logAppEvent } from '../firebase';
import { PostCard } from '../components/PostCard';
import { BottomNav } from '../components/BottomNav';
import { isSpecialSkinUserId } from '../utils/specialAvatar';
import { getCachedAvatarMetaByUids, mergeAvatarMetaCache } from '../utils/avatarMetaCache';
import { fetchReplyCountByPostIds } from '../utils/replyCountCache';
import { openAppOnX, shareOrCopyApp } from '../utils/sharePost';
import { getAcquisitionRecord } from '../utils/acquisition';
import { buildAuthPath } from '../utils/authLinks';
import './HomePage.css';

const GUEST_GENRE_OPTIONS = ['AI作曲', 'DTM', 'その他'];
const GUEST_GENRE_KEY = 'soundback_guest_genre';
const SORT_MODES = new Set(['best', 'new', 'comments', 'unanswered']);

function buildLandingContext(locationSearch) {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(locationSearch || window.location.search);
  const acquisition = getAcquisitionRecord();
  const source = params.get('utm_source') || params.get('source') || acquisition?.source || '';
  const campaign = params.get('utm_campaign') || acquisition?.campaign || '';
  const content = params.get('utm_content') || acquisition?.content || '';
  const referrer = acquisition?.referrer || '';
  const sourceText = `${source} ${referrer}`.toLowerCase();
  const isXVisit = source.toLowerCase() === 'x' || /twitter|x\.com|t\.co/.test(sourceText);

  if (campaign === 'post_share' || (isXVisit && content && content !== 'home')) {
    return {
      id: 'post_share',
      title: 'Xの相談投稿から来た方へ',
      body: 'まずは近い悩みを見て、良い点や気になった秒数を短く返せます。自分の曲も同じ形で相談できます。',
      primaryLabel: '返信募集中を見る',
      primaryAction: 'show_unanswered',
      secondaryLabel: '自分も相談する',
      secondaryAction: 'create',
      campaign: campaign || 'post_share',
      source: source || 'unknown',
    };
  }

  if (campaign === 'profile_share') {
    return {
      id: 'profile_share',
      title: 'プロフィール共有から来た方へ',
      body: 'その人の投稿だけでなく、Sound.back内の相談も見られます。近い悩みがあれば、短い返信から参加できます。',
      primaryLabel: '投稿を見る',
      primaryAction: 'browse',
      secondaryLabel: '相談を投稿',
      secondaryAction: 'create',
      campaign,
      source: source || 'unknown',
    };
  }

  if (campaign === 'app_intro' || isXVisit) {
    return {
      id: 'app_intro',
      title: 'Sound.backへようこそ',
      body: '音源つきで制作の悩みを相談できる場所です。見るだけでも、秒数つきで短く返すだけでも大丈夫です。',
      primaryLabel: '投稿を見る',
      primaryAction: 'browse',
      secondaryLabel: '相談を投稿',
      secondaryAction: 'create',
      campaign: campaign || 'x_visit',
      source: source || 'unknown',
    };
  }

  if (params.get('sort') === 'unanswered') {
    return {
      id: 'unanswered',
      title: '返信募集中の相談を表示しています',
      body: 'まだ返信がない投稿を優先しています。音源を聴いて、良い点や確認したいことを短く返せます。',
      primaryLabel: '相談を見る',
      primaryAction: 'browse',
      secondaryLabel: '自分も相談する',
      secondaryAction: 'create',
      campaign: params.get('source') || 'unanswered',
      source: 'internal',
    };
  }

  return null;
}

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
  const [sortMode, setSortMode] = useState(() => {
    if (typeof window === 'undefined') return 'best';
    const requestedSort = new URLSearchParams(window.location.search).get('sort');
    return SORT_MODES.has(requestedSort) ? requestedSort : 'best';
  });
  const [appShareState, setAppShareState] = useState('idle');
  const [landingContextDismissed, setLandingContextDismissed] = useState(false);
  const [guestGenre, setGuestGenre] = useState(() => {
    if (typeof window === 'undefined') return null;
    const saved = window.sessionStorage.getItem(GUEST_GENRE_KEY);
    return saved && GUEST_GENRE_OPTIONS.includes(saved) ? saved : null;
  });
  const { firebaseUser, userData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const landingImpressionKeyRef = useRef('');
  const landingContext = useMemo(() => buildLandingContext(location.search), [location.search]);

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

  useEffect(() => {
    if (appShareState === 'idle') return undefined;
    const timeoutId = window.setTimeout(() => setAppShareState('idle'), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [appShareState]);

  useEffect(() => {
    if (!landingContext || firebaseUser || landingContextDismissed) return;
    const impressionKey = `${landingContext.id}:${landingContext.campaign}:${landingContext.source}`;
    if (landingImpressionKeyRef.current === impressionKey) return;

    landingImpressionKeyRef.current = impressionKey;
    logAppEvent('home_landing_context_view', {
      context_id: landingContext.id,
      campaign: landingContext.campaign,
      source: landingContext.source,
      signed_in: false,
    });
  }, [firebaseUser, landingContext, landingContextDismissed]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedSort = params.get('sort');
    if (!requestedSort || !SORT_MODES.has(requestedSort)) return;

    logAppEvent('home_feed_sort_deeplink', {
      sort_mode: requestedSort,
      source: params.get('source') || 'url',
      signed_in: Boolean(firebaseUser),
    });
  }, [firebaseUser, location.search]);

  const handleHomeClick = () => {
    refresh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCardClick = (postId) => {
    const selectedPost = posts.find((post) => post.id === postId);
    logAppEvent('home_post_open', {
      post_id: postId,
      signed_in: Boolean(firebaseUser),
      sort_mode: sortMode,
      guest_genre: guestGenre ?? 'all',
      has_audio: Boolean(selectedPost?.audioUrl),
      reply_count: replyCountByPostId[postId] ?? 0,
    });
    navigate(`/post/${postId}`);
  };

  const handleFeedReplyIntent = (post) => {
    if (!post?.id) return;

    logAppEvent('feed_reply_cta_click', {
      post_id: post.id,
      surface: 'home_feed_card',
      signed_in: Boolean(firebaseUser),
      sort_mode: sortMode,
      guest_genre: guestGenre ?? 'all',
      reply_count: replyCountByPostId[post.id] ?? 0,
      has_audio: Boolean(post.audioUrl),
    });

    const returnTo = `/post/${post.id}?comment=1`;
    if (firebaseUser) {
      navigate(returnTo);
      return;
    }

    navigate(buildAuthPath({ returnTo }), {
      state: {
        message: 'コメントするには無料登録が必要です。',
        returnTo,
      },
    });
  };

  const handleCreateIntent = (surface) => {
    logAppEvent('create_post_cta_click', {
      surface,
      signed_in: Boolean(firebaseUser),
    });
    navigate(firebaseUser ? '/create' : buildAuthPath({ returnTo: '/create' }), {
      state: firebaseUser
        ? undefined
        : { message: '投稿するには無料登録が必要です。', returnTo: '/create' },
    });
  };

  const handleBrowseFeedIntent = () => {
    logAppEvent('home_guest_browse_click', {
      surface: 'hero',
    });
    document.querySelector('.home-feed')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleLandingContextAction = (action) => {
    if (!landingContext) return;

    logAppEvent('home_landing_context_click', {
      context_id: landingContext.id,
      action,
      campaign: landingContext.campaign,
      source: landingContext.source,
      signed_in: Boolean(firebaseUser),
    });

    if (action === 'show_unanswered') {
      handleSortModeChange('unanswered');
      document.querySelector('.home-feed')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      return;
    }

    if (action === 'create') {
      handleCreateIntent('landing_context');
      return;
    }

    handleBrowseFeedIntent();
  };

  const handleLandingContextDismiss = () => {
    if (landingContext) {
      logAppEvent('home_landing_context_dismiss', {
        context_id: landingContext.id,
        campaign: landingContext.campaign,
        source: landingContext.source,
      });
    }
    setLandingContextDismissed(true);
  };

  const handleShareApp = async (surface) => {
    const result = await shareOrCopyApp();
    logAppEvent('app_share_click', {
      channel: 'native_or_copy',
      surface,
      result,
      signed_in: Boolean(firebaseUser),
    });
    if (result === 'copied') setAppShareState('copied');
    if (result === 'failed') setAppShareState('failed');
  };

  const handleShareAppOnX = (surface) => {
    const opened = openAppOnX();
    logAppEvent('app_share_click', {
      channel: 'x',
      surface,
      result: opened ? 'opened' : 'failed',
      signed_in: Boolean(firebaseUser),
    });
  };

  const handleAboutClick = (surface) => {
    logAppEvent('home_about_click', {
      surface,
      signed_in: Boolean(firebaseUser),
    });
    navigate('/about');
  };

  const handleLibraryClick = (surface) => {
    logAppEvent('home_library_click', {
      surface,
      signed_in: Boolean(firebaseUser),
    });
    navigate('/library');
  };

  const clearGuestGenre = () => {
    setGuestGenre(null);
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(GUEST_GENRE_KEY);
    }
    logAppEvent('home_guest_genre_filter', {
      genre: 'all',
      action: 'clear',
    });
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
    logAppEvent('home_guest_genre_filter', {
      genre,
      action: 'select',
    });
  };

  const handleSortModeChange = (nextSortMode) => {
    setSortMode(nextSortMode);
    logAppEvent('home_feed_sort_change', {
      sort_mode: nextSortMode,
      signed_in: Boolean(firebaseUser),
      guest_genre: guestGenre ?? 'all',
    });
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

  const unansweredPosts = searchedPosts.filter((post) =>
    !post.isSolved && !post.bestAnswerCommentId && (replyCountByPostId[post.id] ?? 0) === 0
  );
  const replySpotlightPost = [...unansweredPosts].sort((a, b) => {
    const aHasAudio = a.audioUrl ? 1 : 0;
    const bHasAudio = b.audioUrl ? 1 : 0;
    const aHasFocusSecond = Number.isFinite(Number(a.focusSecondSec)) ? 1 : 0;
    const bHasFocusSecond = Number.isFinite(Number(b.focusSecondSec)) ? 1 : 0;
    return bHasAudio - aHasAudio
      || bHasFocusSecond - aHasFocusSecond
      || (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
  })[0] ?? null;

  const sortablePosts = sortMode === 'unanswered' ? unansweredPosts : searchedPosts;

  const visiblePosts = [...sortablePosts].sort((a, b) => {
    if (sortMode === 'new') {
      return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
    }
    if (sortMode === 'unanswered') {
      const aHasAudio = a.audioUrl ? 1 : 0;
      const bHasAudio = b.audioUrl ? 1 : 0;
      return bHasAudio - aHasAudio || (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
    }
    if (sortMode === 'comments') {
      return (replyCountByPostId[b.id] ?? 0) - (replyCountByPostId[a.id] ?? 0);
    }
    return ((replyCountByPostId[b.id] ?? 0) * 2 + (b.audioUrl ? 8 : 0)) -
      ((replyCountByPostId[a.id] ?? 0) * 2 + (a.audioUrl ? 8 : 0));
  });

  const showUnansweredEmpty = sortMode === 'unanswered' && !loading && !error && visiblePosts.length === 0;
  const showGuestFilteredEmpty = !showUnansweredEmpty && !firebaseUser && Boolean(guestGenre) && !loading && !error && visiblePosts.length === 0;
  const showPlainEmpty = !showUnansweredEmpty && !loading && !error && visiblePosts.length === 0 && !showGuestFilteredEmpty;
  const totalReplies = Object.values(replyCountByPostId).reduce((sum, count) => sum + count, 0);
  const communityStats = {
    posts: posts.length,
    audioPosts: posts.filter((post) => Boolean(post.audioUrl)).length,
    answers: totalReplies,
    unanswered: posts.filter((post) =>
      !post.isSolved && !post.bestAnswerCommentId && (replyCountByPostId[post.id] ?? 0) === 0
    ).length,
  };

  const handleReplySpotlightClick = (action) => {
    if (!replySpotlightPost?.id) return;

    logAppEvent('home_reply_spotlight_click', {
      action,
      post_id: replySpotlightPost.id,
      signed_in: Boolean(firebaseUser),
      guest_genre: guestGenre ?? 'all',
      sort_mode: sortMode,
      has_audio: Boolean(replySpotlightPost.audioUrl),
      has_focus_second: Number.isFinite(Number(replySpotlightPost.focusSecondSec)),
    });

    if (action === 'open') {
      navigate(`/post/${replySpotlightPost.id}`);
      return;
    }

    if (action === 'reply') {
      handleFeedReplyIntent(replySpotlightPost);
      return;
    }

    if (action === 'show_unanswered') {
      handleSortModeChange('unanswered');
    }
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
            onClick={() => handleCreateIntent('header')}
          >
            ＋ 作成
          </button>
          <button
            type="button"
            className="home-header__about"
            onClick={() => handleAboutClick('header')}
          >
            とは
          </button>
          <button
            className="home-header__avatar-btn"
            onClick={() => navigate(firebaseUser ? '/mypage' : '/auth')}
            aria-label={firebaseUser ? 'マイページ' : 'ログイン'}
          >
            {!firebaseUser ? (
              <span className="home-header__login-label">ログイン</span>
            ) : userData?.photoUrl ? (
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
          <div className="home-hero__copy">
            <p className="home-hero__eyebrow">音楽制作の相談コミュニティ</p>
            <p className="home-hero__catch">音源で、制作の悩みを相談。</p>
            <p className="home-hero__sub">見るだけでも、短い返信でもOKです。</p>
          </div>
          <div className="home-hero__actions">
            <button className="home-hero__cta" onClick={() => handleCreateIntent('hero')}>
              相談を投稿
            </button>
            <button className="home-hero__secondary" onClick={handleBrowseFeedIntent}>
              投稿を見る
            </button>
          </div>

          <div className="home-guest-genre">
            <p className="home-guest-genre__title">まず見るジャンル</p>
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
          {!firebaseUser && (
            <section className="home-onboarding" aria-label="Sound.backの使い方">
              <div className="home-onboarding__item">
                <span className="home-onboarding__number">1</span>
                <div>
                  <h2>投稿を聴く</h2>
                  <p>近い悩みやジャンルから、音源つきの相談を見られます。</p>
                </div>
              </div>
              <div className="home-onboarding__item">
                <span className="home-onboarding__number">2</span>
                <div>
                  <h2>短く返信する</h2>
                  <p>良い点、気になった秒数、確認したいことだけでも返せます。</p>
                </div>
              </div>
              <div className="home-onboarding__item">
                <span className="home-onboarding__number">3</span>
                <div>
                  <h2>自分も投稿する</h2>
                  <p>音源、悩み、聴いてほしい所を添えて相談できます。</p>
                </div>
              </div>
            </section>
          )}

          <section className="home-library-link" aria-label="制作悩みライブラリ">
            <div>
              <p className="home-library-link__eyebrow">制作悩みライブラリ</p>
              <h2>自分の悩みがまだ言葉にできない時に。</h2>
              <p>ミックス、作曲、DAW、AI作曲など、DTMerがよく詰まる悩みを100件から探せます。</p>
            </div>
            <button type="button" onClick={() => handleLibraryClick('home_feed')}>
              図書館を見る
            </button>
          </section>

          {!firebaseUser && landingContext && !landingContextDismissed && (
            <section className="home-landing-context" aria-label="訪問理由に合わせた案内">
              <div>
                <p className="home-landing-context__eyebrow">はじめてでもOK</p>
                <h2>{landingContext.title}</h2>
                <p>{landingContext.body}</p>
              </div>
              <div className="home-landing-context__actions">
                <button
                  type="button"
                  className="home-landing-context__primary"
                  onClick={() => handleLandingContextAction(landingContext.primaryAction)}
                >
                  {landingContext.primaryLabel}
                </button>
                <button
                  type="button"
                  className="home-landing-context__secondary"
                  onClick={() => handleLandingContextAction(landingContext.secondaryAction)}
                >
                  {landingContext.secondaryLabel}
                </button>
                <button
                  type="button"
                  className="home-landing-context__dismiss"
                  onClick={handleLandingContextDismiss}
                  aria-label="案内を閉じる"
                >
                  閉じる
                </button>
              </div>
            </section>
          )}

          {replySpotlightPost && (
            <section className="home-reply-spotlight" aria-label="返信募集中の相談">
              <div className="home-reply-spotlight__copy">
                <p className="home-reply-spotlight__eyebrow">返信募集中</p>
                <h2>{replySpotlightPost.title || '音源つきの相談があります'}</h2>
                <p>
                  {replySpotlightPost.audioUrl
                    ? 'まだ返信0件。良い点や気になった秒数だけでも返せます。'
                    : 'まだ返信0件。質問や確認だけでも返しやすい投稿です。'}
                </p>
              </div>
              <div className="home-reply-spotlight__meta" aria-label="投稿情報">
                {replySpotlightPost.worryGenre && <span>{replySpotlightPost.worryGenre}</span>}
                {replySpotlightPost.musicGenre && <span>{replySpotlightPost.musicGenre}</span>}
                {replySpotlightPost.daw && <span>{replySpotlightPost.daw}</span>}
                {replySpotlightPost.audioUrl && <span>音源あり</span>}
              </div>
              <div className="home-reply-spotlight__actions">
                <button type="button" onClick={() => handleReplySpotlightClick('open')}>
                  相談を見る
                </button>
                <button type="button" onClick={() => handleReplySpotlightClick('reply')}>
                  返信する
                </button>
                {sortMode !== 'unanswered' && (
                  <button type="button" onClick={() => handleReplySpotlightClick('show_unanswered')}>
                    もっと見る
                  </button>
                )}
              </div>
            </section>
          )}

          <div className="home-feed-toolbar">
            <div className="home-feed-toolbar__heading">
              <span>相談フィード</span>
            </div>
            <div className="home-feed-toolbar__sort" aria-label="並び替え">
              <button
                type="button"
                className={sortMode === 'best' ? 'is-active' : ''}
                onClick={() => handleSortModeChange('best')}
              >
                おすすめ
              </button>
              <button
                type="button"
                className={sortMode === 'new' ? 'is-active' : ''}
                onClick={() => handleSortModeChange('new')}
              >
                新着
              </button>
              <button
                type="button"
                className={sortMode === 'comments' ? 'is-active' : ''}
                onClick={() => handleSortModeChange('comments')}
              >
                返信数
              </button>
              <button
                type="button"
                className={sortMode === 'unanswered' ? 'is-active' : ''}
                onClick={() => handleSortModeChange('unanswered')}
              >
                未返信
              </button>
            </div>
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

          {showPlainEmpty && (
            <div className="home-state home-state--action">
              <p>投稿はまだありません。</p>
              <button className="home-state__cta" onClick={() => handleCreateIntent('empty_feed')}>
                最初の相談を投稿
              </button>
            </div>
          )}

          {showUnansweredEmpty && (
            <div className="home-state home-state--action">
              <p>未返信の相談は今ありません。新着や返信数順も見てみてください。</p>
              <button className="home-state__cta" onClick={() => handleSortModeChange('new')}>
                新着を見る
              </button>
            </div>
          )}

          {showGuestFilteredEmpty && (
            <div className="home-state home-state--action">
              <p>この条件ではまだ投稿が見つかりません。別のジャンルや検索語も試してみてください。</p>
              <button className="home-state__cta" onClick={() => handleCreateIntent('filtered_empty_feed')}>
                自分の相談を投稿
              </button>
            </div>
          )}

          {visiblePosts.length > 0 && (
            <>
              <ul className="home-post-list">
                {visiblePosts.map((post, index) => (
                  <li key={post.id} onClick={() => handleCardClick(post.id)}>
                    <PostCard
                      post={post}
                      isPlaying={currentPlayingId === post.id}
                      onPlay={setCurrentPlayingId}
                      showSolvedBadge
                      authorPhotoUrlOverride={authorPhotoByUid[post.authorUid] ?? null}
                      isSpecialAvatar={Boolean(specialAuthorByUid[post.authorUid])}
                      replyCount={replyCountByPostId[post.id] ?? 0}
                      onReplyIntent={handleFeedReplyIntent}
                    />
                    {!firebaseUser && index === Math.min(2, visiblePosts.length - 1) && (
                      <div className="home-feed-join" onClick={(e) => e.stopPropagation()}>
                        <div>
                          <h2>近い悩みがあったら、自分の音源でも相談できます。</h2>
                          <p>タイトル、気になる秒数、聴いてほしい所を入れるだけで投稿できます。</p>
                        </div>
                        <button type="button" onClick={() => handleCreateIntent('feed_inline')}>
                          相談を投稿
                        </button>
                      </div>
                    )}
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
                <button onClick={() => handleCreateIntent('sidebar_join')}>参加</button>
              </div>
              <p>
                ミックス、AI作曲、DTMの悩みを投稿して、音を聴いた人から具体的な返信をもらうコミュニティ。
              </p>
              <dl className="home-community__stats">
                <div>
                  <dt>{communityStats.posts.toLocaleString('ja-JP')}</dt>
                  <dd>投稿</dd>
                </div>
                <div>
                  <dt>{communityStats.audioPosts.toLocaleString('ja-JP')}</dt>
                  <dd>音源つき</dd>
                </div>
                <div>
                  <dt>{communityStats.unanswered.toLocaleString('ja-JP')}</dt>
                  <dd>返信募集中</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="home-sidebar-panel">
            <h2>Sound.backでできること</h2>
            <p>返信合計 {communityStats.answers.toLocaleString('ja-JP')} 件</p>
            <p>気になる秒数、DAW、ジャンルを添えて投稿できます。聴いた人が改善点を返しやすい設計です。</p>
            <button type="button" className="home-sidebar-panel__link" onClick={() => handleAboutClick('sidebar_about')}>
              Sound.backとは
            </button>
          </section>

          <section className="home-sidebar-panel home-share-panel">
            <h2>Sound.backを広める</h2>
            <p>DTM仲間に紹介すると、相談に返してくれる人も増えます。</p>
            <div className="home-share-panel__actions">
              <button type="button" onClick={() => handleShareApp('sidebar')}>
                {appShareState === 'copied' ? 'コピー済み' : appShareState === 'failed' ? '失敗' : 'URL共有'}
              </button>
              <button type="button" onClick={() => handleShareAppOnX('sidebar')}>
                X下書き
              </button>
            </div>
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
        onClick={() => handleCreateIntent('floating_button')}
        aria-label="投稿する"
      >
        <span className="fab__label">悩みを投稿</span>
      </button>
    </div>
  );
}
