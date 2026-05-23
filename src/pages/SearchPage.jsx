import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, orderBy, limit,
} from 'firebase/firestore';
import { db } from '../firebase';
import { PostCard } from '../components/PostCard';
import { BottomNav } from '../components/BottomNav';
import { isSpecialSkinUserId } from '../utils/specialAvatar';
import { fetchReplyCountByPostIds } from '../utils/replyCountCache';
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

export function SearchPage() {
  const navigate = useNavigate();

  /* タブ */
  const [tab, setTab] = useState('user'); // 'user' | 'post'

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
  const handlePostSearch = async () => {
    const kw = keyword.trim();
    if (!kw && !worryGenre && !musicGenre && !daw) return;
    if (kw && kw.length < 2) return;

    setPostLoading(true);
    setPostSearched(false);
    setPostResults([]);

    try {
      const constraints = [orderBy('createdAt', 'desc'), limit(SEARCH_POSTS_LIMIT)];
      if (worryGenre) constraints.unshift(where('worryGenre', '==', worryGenre));
      if (musicGenre) constraints.unshift(where('musicGenre', '==', musicGenre));
      if (daw) constraints.unshift(where('daw', '==', daw));
      const q = query(collection(db, 'posts'), ...constraints);

      const snap = await getDocs(q);
      let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (kw) {
        const lower = kw.toLowerCase();
        docs = docs.filter((p) =>
          (p.body ?? '').toLowerCase().includes(lower)
        );
      }

      setPostResults(docs);
    } catch (err) {
      console.error(err);
    } finally {
      setPostLoading(false);
      setPostSearched(true);
    }
  };

  return (
    <div className="search-page">
      <header className="search-header">
        <div className="search-header__inner">
          <h1 className="search-title">Search</h1>
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
            <p className="search-hint">キーワード・ジャンルで投稿を検索します</p>

            <input
              className="search-input search-input--full"
              type="text"
              placeholder="キーワード（2文字以上）"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
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
              disabled={postLoading}
            >
              {postLoading ? '検索中...' : '検索する'}
            </button>

            {postSearched && (
              postResults.length === 0 ? (
                <p className="search-empty">投稿が見つかりませんでした。</p>
              ) : (
                <div className="search-post-list">
                  {postResults.map((post) => (
                    <div
                      key={post.id}
                      className="search-post-item"
                      onClick={() => navigate(`/post/${post.id}`)}
                    >
                      <PostCard
                        post={post}
                        isPlaying={playingId === post.id}
                        onPlay={(id) => setPlayingId(id)}
                        replyCount={replyCountByPostId[post.id] ?? 0}
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
