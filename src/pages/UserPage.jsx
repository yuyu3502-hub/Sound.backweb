import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection, query, where, orderBy, getDocs, doc, getDoc, limit, getCountFromServer,
} from 'firebase/firestore';
import { db, logAppEvent } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { PostCard } from '../components/PostCard';
import { BottomNav } from '../components/BottomNav';
import { isSpecialSkinUserId } from '../utils/specialAvatar';
import { fetchReplyCountByPostIds } from '../utils/replyCountCache';
import { openUserOnX, shareOrCopyUser } from '../utils/sharePost';
import { buildAuthPath } from '../utils/authLinks';
import './UserPage.css';

const USER_POSTS_LIMIT = 60;

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

export function UserPage() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const { firebaseUser } = useAuth();

  const [userData, setUserData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [bestAnswerCount, setBestAnswerCount] = useState(0);
  const [replyCountByPostId, setReplyCountByPostId] = useState({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const [profileShareState, setProfileShareState] = useState('idle');

  useEffect(() => {
    if (!uid) return;
    loadUser();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    let cancelled = false;

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

    fetchReplyCounts();

    return () => {
      cancelled = true;
    };
  }, [posts]);

  useEffect(() => {
    if (profileShareState === 'idle') return undefined;
    const timeoutId = window.setTimeout(() => setProfileShareState('idle'), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [profileShareState]);

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
      const postsQuery = query(
        collection(db, 'posts'),
        where('authorUid', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(USER_POSTS_LIMIT)
      );
      const bestAnswersQuery = query(
        collection(db, 'comments'),
        where('authorUid', '==', uid),
        where('isBestAnswer', '==', true)
      );

      const [snap, bestAnswersSnapshot] = await Promise.all([
        getDocs(postsQuery),
        getCountFromServer(bestAnswersQuery),
      ]);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPosts(docs);
      setBestAnswerCount(bestAnswersSnapshot.data().count ?? 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const unsolved = posts.filter((p) => !p.isSolved);
  const solved = posts.filter((p) => p.isSolved);

  const logProfileShare = (channel, result) => {
    logAppEvent('profile_share_click', {
      profile_uid: userData?.uid ?? uid,
      channel,
      surface: 'user_profile',
      result,
      signed_in: Boolean(firebaseUser),
      post_count: posts.length,
      unsolved_count: unsolved.length,
      best_answer_count: bestAnswerCount,
    });
  };

  const handleShareProfile = async () => {
    const result = await shareOrCopyUser(userData);
    logProfileShare('native_or_copy', result);
    if (result === 'copied') setProfileShareState('copied');
    if (result === 'failed') setProfileShareState('failed');
  };

  const handleShareProfileOnX = () => {
    const opened = openUserOnX(userData);
    logProfileShare('x', opened ? 'opened' : 'failed');
  };

  const handleReplyIntent = (post) => {
    if (!post?.id) return;

    logAppEvent('feed_reply_cta_click', {
      post_id: post.id,
      surface: 'user_profile_card',
      signed_in: Boolean(firebaseUser),
      profile_uid: userData?.uid ?? uid,
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
  const isSpecialUser = isSpecialSkinUserId(userData?.userId);

  return (
    <div className="user-page">
      <header className="user-page-header">
        <button className="user-page-back-btn" onClick={() => navigate(-1)}>← 戻る</button>
        <h1 className="user-page-title">プロフィール</h1>
      </header>

      <main className="user-page-main">
        {/* プロフィールエリア */}
        <section className="user-profile">
          <div className={`user-profile__avatar-wrap ${isSpecialUser ? 'user-profile__avatar-wrap--special' : ''}`}>
            {userData?.photoUrl ? (
              <img
                className="user-profile__avatar"
                src={userData.photoUrl}
                alt=""
                decoding="sync"
                fetchPriority="high"
              />
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
            {bestAnswerCount > 0 && (
              <span className="user-profile__best-badge">
                ★ ベストアンサー {bestAnswerCount}回
              </span>
            )}
            <div className="user-profile__actions" aria-label="プロフィール共有">
              <button
                type="button"
                className="user-profile__action-btn"
                onClick={handleShareProfile}
              >
                {profileShareState === 'copied' ? 'URLコピー済み' : profileShareState === 'failed' ? '共有失敗' : 'プロフィール共有'}
              </button>
              <button
                type="button"
                className="user-profile__action-btn user-profile__action-btn--x"
                onClick={handleShareProfileOnX}
              >
                Xで紹介
              </button>
            </div>
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
                    showSolvedBadge
                    replyCount={replyCountByPostId[post.id] ?? 0}
                    onReplyIntent={handleReplyIntent}
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
                    showSolvedBadge
                    replyCount={replyCountByPostId[post.id] ?? 0}
                    onReplyIntent={handleReplyIntent}
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
