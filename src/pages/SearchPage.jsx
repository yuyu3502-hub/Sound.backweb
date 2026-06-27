import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, orderBy, limit,
} from 'firebase/firestore';
import { db, logAppEvent } from '../firebase';
import { PostCard } from '../components/PostCard';
import { BottomNav } from '../components/BottomNav';
import { useAuth } from '../context/AuthContext';
import { isSpecialSkinUserId } from '../utils/specialAvatar';
import { fetchReplyCountByPostIds } from '../utils/replyCountCache';
import { buildAuthPath } from '../utils/authLinks';
import './SearchPage.css';

const WORRY_GENRES = [
  'ミックス', 'アレンジ', 'マスタリング', 'DAW操作', 'AI作曲',
  'メロディ', 'コード進行', 'リズム', 'その他',
];
const MUSIC_GENRES = [
  'J-POP', 'Rock', 'Hip-Hop', 'EDM',
  'Lo-fi', 'Ballad', 'Anime', 'その他',
];
const DAW_OPTIONS = [
  'Logic Pro', 'Ableton Live', 'FL Studio', 'Cubase',
  'Studio One', 'Pro Tools', 'GarageBand', 'Reaper',
  'Cakewalk', 'その他',
];
const SEARCH_POSTS_LIMIT = 50;
const QUICK_SEARCHES = [
  {
    id: 'mix',
    label: 'ミックス相談',
    worryGenre: 'ミックス',
    description: '音量バランスや抜け感を見る',
  },
  {
    id: 'ai',
    label: 'AI作曲',
    worryGenre: 'AI作曲',
    description: '自然に聴こえる直し方を探す',
  },
  {
    id: 'daw',
    label: 'DAW操作',
    worryGenre: 'DAW操作',
    description: '詰まった操作の相談を見る',
  },
  {
    id: 'arrange',
    label: 'アレンジ',
    worryGenre: 'アレンジ',
    description: '展開や楽器構成の悩みを見る',
  },
];

export function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { firebaseUser } = useAuth();
  const aboutContextViewedRef = useRef(false);

  /* タブ */
  const [tab, setTab] = useState('post'); // 'user' | 'post'

  /* ユーザー検索 */
  const [userIdInput, setUserIdInput] = useState('');
  const [userResult, setUserResult] = useState(null); // null | 'none' | object
  const [userLoading, setUserLoading] = useState(false);

  /* 投稿検索 */
  const [keyword, setKeyword] = useState('');
  const [worryGenre, setWorryGenre] = useState('');
  const [musicGenre, setMusicGenre] = useState('');
  const [daw, setDaw] = useState('');
  const [postResults, setPostResults] = useState([]);
  const [postLoading, setPostLoading] = useState(false);
  const [postSearched, setPostSearched] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const [replyCountByPostId, setReplyCountByPostId] = useState({});
  const isAboutSearchVisit = new URLSearchParams(location.search).get('source') === 'about';

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const keywordParam = params.get('keyword');
    if (!keywordParam) return;

    setTab('post');
    setKeyword(keywordParam);
    setWorryGenre('');
    setMusicGenre('');
    setDaw('');
    runPostSearch({
      nextKeyword: keywordParam,
      nextWorryGenre: '',
      nextMusicGenre: '',
      nextDaw: '',
      source: params.get('source') || 'url_keyword',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    if (!isAboutSearchVisit || aboutContextViewedRef.current) return;

    aboutContextViewedRef.current = true;
    logAppEvent('search_about_context_view', {
      signed_in: Boolean(firebaseUser),
    });
  }, [firebaseUser, isAboutSearchVisit]);

  useEffect(() => {
    let cancelled = false;

    const fetchReplyCounts = async () => {
      const postIds = postResults.map((post) => post.id).filter(Boolean);
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

    fetchReplyCounts();

    return () => {
      cancelled = true;
    };
  }, [postResults]);

  /* ---- ユーザー検索 ---- */
  const handleUserSearch = async () => {
    const id = userIdInput.trim();
    if (!id) return;
    setUserLoading(true);
    setUserResult(null);
    try {
      const q = query(collection(db, 'users'), where('userId', '==', id));
      const snap = await getDocs(q);
      if (snap.empty) {
        setUserResult('none');
      } else {
        const d = snap.docs[0];
        setUserResult({ uid: d.id, ...d.data() });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUserLoading(false);
    }
  };

  /* ---- 投稿検索 ---- */
  const runPostSearch = async ({
    nextKeyword = keyword,
    nextWorryGenre = worryGenre,
    nextMusicGenre = musicGenre,
    nextDaw = daw,
    source = 'manual',
  } = {}) => {
    const kw = nextKeyword.trim();
    if (!kw && !nextWorryGenre && !nextMusicGenre && !nextDaw) return;
    if (kw && kw.length < 2) return;

    setPostLoading(true);
    setPostSearched(false);
    setPostResults([]);

    try {
      const constraints = [orderBy('createdAt', 'desc'), limit(SEARCH_POSTS_LIMIT)];
      if (nextWorryGenre) constraints.unshift(where('worryGenre', '==', nextWorryGenre));
      if (nextMusicGenre) constraints.unshift(where('musicGenre', '==', nextMusicGenre));
      if (nextDaw) constraints.unshift(where('daw', '==', nextDaw));
      const q = query(collection(db, 'posts'), ...constraints);

      const snap = await getDocs(q);
      let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (kw) {
        const lower = kw.toLowerCase();
        docs = docs.filter((p) =>
          (p.title ?? '').toLowerCase().includes(lower)
          || (p.body ?? '').toLowerCase().includes(lower)
        );
      }

      setPostResults(docs);
      logAppEvent('search_post_submit', {
        source,
        has_keyword: Boolean(kw),
        worry_genre: nextWorryGenre || 'all',
        music_genre: nextMusicGenre || 'all',
        daw: nextDaw || 'all',
        result_count: docs.length,
      });
    } catch (err) {
      console.error(err);
      logAppEvent('search_post_submit', {
        source,
        has_keyword: Boolean(kw),
        worry_genre: nextWorryGenre || 'all',
        music_genre: nextMusicGenre || 'all',
        daw: nextDaw || 'all',
        result_count: -1,
      });
    } finally {
      setPostLoading(false);
      setPostSearched(true);
    }
  };

  const handlePostSearch = () => {
    runPostSearch({ source: 'manual' });
  };

  const handleQuickSearch = (preset) => {
    setTab('post');
    setKeyword('');
    setWorryGenre(preset.worryGenre);
    setMusicGenre('');
    setDaw('');
    logAppEvent('search_quick_filter_click', {
      preset_id: preset.id,
      worry_genre: preset.worryGenre,
    });
    runPostSearch({
      nextKeyword: '',
      nextWorryGenre: preset.worryGenre,
      nextMusicGenre: '',
      nextDaw: '',
      source: 'quick_filter',
    });
  };

  const handleAboutContextAction = (action) => {
    logAppEvent('search_about_context_click', {
      action,
      signed_in: Boolean(firebaseUser),
    });

    if (action === 'mix') {
      handleQuickSearch(QUICK_SEARCHES.find((preset) => preset.id === 'mix'));
      return;
    }

    if (action === 'ai') {
      handleQuickSearch(QUICK_SEARCHES.find((preset) => preset.id === 'ai'));
      return;
    }

    handleEmptyCreateClick();
  };

  const handleClearPostSearch = () => {
    setKeyword('');
    setWorryGenre('');
    setMusicGenre('');
    setDaw('');
    setPostResults([]);
    setPostSearched(false);
    logAppEvent('search_post_clear');
  };

  const handleSearchResultOpen = (event, post) => {
    if (event.target.closest('button, audio, input, select, textarea, a')) return;

    logAppEvent('search_post_open', {
      post_id: post.id,
      has_audio: Boolean(post.audioUrl),
      worry_genre: post.worryGenre ?? 'none',
      music_genre: post.musicGenre ?? 'none',
      daw: post.daw ?? 'none',
      result_count: postResults.length,
    });
    navigate(`/post/${post.id}`);
  };

  const handleSearchReplyIntent = (post) => {
    if (!post?.id) return;

    logAppEvent('feed_reply_cta_click', {
      post_id: post.id,
      surface: 'search_result_card',
      signed_in: Boolean(firebaseUser),
      reply_count: replyCountByPostId[post.id] ?? 0,
      has_audio: Boolean(post.audioUrl),
      worry_genre: post.worryGenre ?? 'none',
      music_genre: post.musicGenre ?? 'none',
      daw: post.daw ?? 'none',
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

  const handleEmptyCreateClick = () => {
    logAppEvent('search_empty_create_click', {
      signed_in: Boolean(firebaseUser),
      has_keyword: Boolean(keyword.trim()),
      worry_genre: worryGenre || 'all',
      music_genre: musicGenre || 'all',
      daw: daw || 'all',
    });

    if (firebaseUser) {
      navigate('/create');
      return;
    }

    navigate(buildAuthPath({ returnTo: '/create' }), {
      state: {
        message: '投稿するには無料登録が必要です。',
        returnTo: '/create',
      },
    });
  };

  const postSearchDisabled = postLoading
    || (!keyword.trim() && !worryGenre && !musicGenre && !daw)
    || (keyword.trim().length > 0 && keyword.trim().length < 2);

  return (
    <div className="search-page">
      <header className="search-header">
        <div className="search-header__inner">
          <h1 className="search-title">探す</h1>
        </div>
      </header>

      {/* タブ */}
      <div className="search-tabs">
        <button
          className={`search-tab ${tab === 'user' ? 'search-tab--active' : ''}`}
          onClick={() => setTab('user')}
        >
          ユーザー
        </button>
        <button
          className={`search-tab ${tab === 'post' ? 'search-tab--active' : ''}`}
          onClick={() => setTab('post')}
        >
          投稿
        </button>
      </div>

      <main className="search-main">
        {/* ---- ユーザー検索 ---- */}
        {tab === 'user' && (
          <div className="search-section">
            <p className="search-hint">ユーザーIDで検索します（完全一致）</p>
            <div className="search-row">
              <input
                className="search-input"
                type="text"
                  placeholder="ユーザーID（@なし）"
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUserSearch()}
              />
              <button
                className="search-btn"
                onClick={handleUserSearch}
                disabled={userLoading || !userIdInput.trim()}
              >
                {userLoading ? '...' : '検索'}
              </button>
            </div>
            <p className="search-hint">@は含めずに入力してください</p>

            {userResult === 'none' && (
              <p className="search-empty">ユーザーが見つかりませんでした。</p>
            )}
            {userResult && userResult !== 'none' && (
              <button
                className="search-user-card"
                onClick={() => navigate(`/users/${userResult.uid}`)}
              >
                <span className={`search-user-avatar-shell ${isSpecialSkinUserId(userResult.userId) ? 'search-user-avatar-shell--special' : ''}`}>
                  {userResult.photoUrl ? (
                    <img className="search-user-avatar" src={userResult.photoUrl} alt="" decoding="sync" fetchPriority="high" />
                  ) : (
                    <div className="search-user-avatar-fallback">
                      {userResult.displayName?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                </span>
                <div className="search-user-info">
                  <span className="search-user-name">{userResult.displayName}</span>
                  <span className="search-user-id">@{userResult.userId}</span>
                </div>
                <span className="search-user-arrow">›</span>
              </button>
            )}
          </div>
        )}

        {/* ---- 投稿検索 ---- */}
        {tab === 'post' && (
          <div className="search-section">
            {isAboutSearchVisit && (
              <section className="search-about-context" aria-label="Sound.backの相談探し">
                <div>
                  <p className="search-about-context__eyebrow">Sound.backを見に来た方へ</p>
                  <h2>近い悩みから見ると、使い方が掴みやすいです。</h2>
                  <p>ミックスやAI作曲など、気になるジャンルを選ぶと相談例を探せます。見つからなければ自分の曲で相談できます。</p>
                </div>
                <div className="search-about-context__actions">
                  <button type="button" onClick={() => handleAboutContextAction('mix')}>
                    ミックスを見る
                  </button>
                  <button type="button" onClick={() => handleAboutContextAction('ai')}>
                    AI作曲を見る
                  </button>
                  <button type="button" onClick={() => handleAboutContextAction('create')}>
                    相談を投稿
                  </button>
                </div>
              </section>
            )}

            <div className="search-section__head">
              <div>
                <h2>相談を探す</h2>
                <p className="search-hint">聴ける投稿や、近い悩みをキーワード・ジャンルで探せます。</p>
              </div>
              {(keyword || worryGenre || musicGenre || daw || postSearched) && (
                <button type="button" className="search-clear-btn" onClick={handleClearPostSearch}>
                  クリア
                </button>
              )}
            </div>

            <div className="search-quick-list" aria-label="よく見る相談">
              {QUICK_SEARCHES.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`search-quick-card ${worryGenre === preset.worryGenre ? 'is-active' : ''}`}
                  onClick={() => handleQuickSearch(preset)}
                >
                  <strong>{preset.label}</strong>
                  <span>{preset.description}</span>
                </button>
              ))}
            </div>

            <input
              className="search-input search-input--full"
              type="text"
              placeholder="キーワード（2文字以上）"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !postSearchDisabled && handlePostSearch()}
            />

            <div className="search-selects">
              <select
                className="search-select"
                value={worryGenre}
                onChange={(e) => setWorryGenre(e.target.value)}
              >
                <option value="">お悩みジャンル（全て）</option>
                {WORRY_GENRES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <select
                className="search-select"
                value={musicGenre}
                onChange={(e) => setMusicGenre(e.target.value)}
              >
                <option value="">音楽ジャンル（全て）</option>
                {MUSIC_GENRES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <select
                className="search-select"
                value={daw}
                onChange={(e) => setDaw(e.target.value)}
              >
                <option value="">DAW（全て）</option>
                {DAW_OPTIONS.map((dawOption) => (
                  <option key={dawOption} value={dawOption}>{dawOption}</option>
                ))}
              </select>
            </div>

            <button
              className="search-btn search-btn--full"
              onClick={handlePostSearch}
              disabled={postSearchDisabled}
            >
              {postLoading ? '検索中...' : '検索する'}
            </button>

            {postSearched && (
              postResults.length === 0 ? (
                <section className="search-empty search-empty--action">
                  <h2>近い相談はまだ見つかりません</h2>
                  <p>同じ悩みを持つ人が後から見つけやすいので、音源や気になる秒数を添えて投稿しておくのも手です。</p>
                  <button type="button" onClick={handleEmptyCreateClick}>
                    自分の相談を投稿
                  </button>
                </section>
              ) : (
                <div className="search-post-list">
                  {postResults.map((post) => (
                    <div
                      key={post.id}
                      className="search-post-item"
                      onClick={(event) => handleSearchResultOpen(event, post)}
                    >
                      <PostCard
                        post={post}
                        isPlaying={playingId === post.id}
                        onPlay={(id) => setPlayingId(id)}
                        replyCount={replyCountByPostId[post.id] ?? 0}
                        onReplyIntent={handleSearchReplyIntent}
                      />
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </main>

      <BottomNav active="search" />
    </div>
  );
}
