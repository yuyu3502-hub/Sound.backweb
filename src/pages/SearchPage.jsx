import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { PostCard } from '../components/PostCard';
import { BottomNav } from '../components/BottomNav';
import './SearchPage.css';

const WORRY_GENRES = [
  'ミックス', 'アレンジ', 'マスタリング', 'DAW操作',
  'メロディ', 'コード進行', 'リズム', 'その他',
];
const MUSIC_GENRES = [
  'J-POP', 'Rock', 'Hip-Hop', 'EDM',
  'Lo-fi', 'Ballad', 'Anime', 'その他',
];

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
  const [postResults, setPostResults] = useState([]);
  const [postLoading, setPostLoading] = useState(false);
  const [postSearched, setPostSearched] = useState(false);
  const [playingId, setPlayingId] = useState(null);

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
    if (!kw && !worryGenre && !musicGenre) return;
    if (kw && kw.length < 2) return;

    setPostLoading(true);
    setPostSearched(false);
    setPostResults([]);

    try {
      let q;
      if (worryGenre && musicGenre) {
        q = query(
          collection(db, 'posts'),
          where('worryGenre', '==', worryGenre),
          where('musicGenre', '==', musicGenre),
          orderBy('createdAt', 'desc'),
        );
      } else if (worryGenre) {
        q = query(
          collection(db, 'posts'),
          where('worryGenre', '==', worryGenre),
          orderBy('createdAt', 'desc'),
        );
      } else if (musicGenre) {
        q = query(
          collection(db, 'posts'),
          where('musicGenre', '==', musicGenre),
          orderBy('createdAt', 'desc'),
        );
      } else {
        q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
      }

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
        <h1 className="search-title">検索</h1>
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
                {userResult.photoUrl ? (
                  <img className="search-user-avatar" src={userResult.photoUrl} alt="" />
                ) : (
                  <div className="search-user-avatar-fallback">
                    {userResult.displayName?.[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
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
