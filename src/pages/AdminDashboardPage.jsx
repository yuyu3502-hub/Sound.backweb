import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getCountFromServer, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import './AdminDashboardPage.css';

const DAYS_TO_SHOW = 7;

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDayLabel(date) {
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function MetricCard({ label, value, sublabel }) {
  return (
    <article className="admin-metric-card">
      <p className="admin-metric-card__label">{label}</p>
      <p className="admin-metric-card__value">{value}</p>
      {sublabel && <p className="admin-metric-card__sub">{sublabel}</p>}
    </article>
  );
}

export function AdminDashboardPage() {
  const { firebaseUser, userData, isLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (isLoading) return;
    if (!firebaseUser) {
      navigate('/auth');
      return;
    }
    if (userData?.role !== 'admin') {
      navigate('/mypage');
      return;
    }

    let cancelled = false;

    const fetchStats = async () => {
      setLoading(true);
      setError('');

      try {
        const usersRef = collection(db, 'users');
        const postsRef = collection(db, 'posts');
        const commentsRef = collection(db, 'comments');

        const now = new Date();
        const today = startOfDay(now);
        const last7Start = addDays(today, -(DAYS_TO_SHOW - 1));

        const [
          totalUsersSnap,
          todayUsersSnap,
          totalPostsSnap,
          todayPostsSnap,
          totalCommentsSnap,
          todayCommentsSnap,
          solvedPostsSnap,
          bestAnswerSnap,
        ] = await Promise.all([
          getCountFromServer(usersRef),
          getCountFromServer(query(usersRef, where('createdAt', '>=', Timestamp.fromDate(today)))),
          getCountFromServer(postsRef),
          getCountFromServer(query(postsRef, where('createdAt', '>=', Timestamp.fromDate(today)))),
          getCountFromServer(commentsRef),
          getCountFromServer(query(commentsRef, where('createdAt', '>=', Timestamp.fromDate(today)))),
          getCountFromServer(query(postsRef, where('isSolved', '==', true))),
          getCountFromServer(query(commentsRef, where('isBestAnswer', '==', true))),
        ]);

        const dayStarts = Array.from({ length: DAYS_TO_SHOW }, (_, index) => addDays(last7Start, index));

        const [userTrend, postTrend, commentTrend] = await Promise.all([
          Promise.all(
            dayStarts.map(async (dayStart) => {
              const nextDay = addDays(dayStart, 1);
              const snap = await getCountFromServer(
                query(
                  usersRef,
                  where('createdAt', '>=', Timestamp.fromDate(dayStart)),
                  where('createdAt', '<', Timestamp.fromDate(nextDay))
                )
              );
              return { label: formatDayLabel(dayStart), count: snap.data().count ?? 0 };
            })
          ),
          Promise.all(
            dayStarts.map(async (dayStart) => {
              const nextDay = addDays(dayStart, 1);
              const snap = await getCountFromServer(
                query(
                  postsRef,
                  where('createdAt', '>=', Timestamp.fromDate(dayStart)),
                  where('createdAt', '<', Timestamp.fromDate(nextDay))
                )
              );
              return { label: formatDayLabel(dayStart), count: snap.data().count ?? 0 };
            })
          ),
          Promise.all(
            dayStarts.map(async (dayStart) => {
              const nextDay = addDays(dayStart, 1);
              const snap = await getCountFromServer(
                query(
                  commentsRef,
                  where('createdAt', '>=', Timestamp.fromDate(dayStart)),
                  where('createdAt', '<', Timestamp.fromDate(nextDay))
                )
              );
              return { label: formatDayLabel(dayStart), count: snap.data().count ?? 0 };
            })
          ),
        ]);

        const totalPosts = Number(totalPostsSnap.data().count ?? 0);
        const solvedPosts = Number(solvedPostsSnap.data().count ?? 0);
        const solvedRate = totalPosts === 0 ? 0 : (solvedPosts / totalPosts) * 100;

        if (!cancelled) {
          setStats({
            totalUsers: Number(totalUsersSnap.data().count ?? 0),
            todayUsers: Number(todayUsersSnap.data().count ?? 0),
            totalPosts,
            todayPosts: Number(todayPostsSnap.data().count ?? 0),
            totalComments: Number(totalCommentsSnap.data().count ?? 0),
            todayComments: Number(todayCommentsSnap.data().count ?? 0),
            solvedPosts,
            solvedRate,
            bestAnswers: Number(bestAnswerSnap.data().count ?? 0),
            userTrend,
            postTrend,
            commentTrend,
          });
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('運営データの取得に失敗しました。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchStats();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, isLoading, navigate, userData?.role]);

  if (isLoading || !firebaseUser) return null;

  return (
    <div className="admin-page">
      <header className="admin-header">
        <button className="admin-back-btn" onClick={() => navigate('/mypage')}>
          ← マイページ
        </button>
        <div>
          <h1 className="admin-title">運営ダッシュボード</h1>
          <p className="admin-subtitle">登録・投稿・返信の主要指標</p>
        </div>
      </header>

      <main className="admin-main">
        {loading && <p className="admin-state">集計中...</p>}
        {!loading && error && <p className="admin-state admin-state--error">{error}</p>}

        {!loading && !error && stats && (
          <>
            <section className="admin-section">
              <h2 className="admin-section__title">サマリー</h2>
              <div className="admin-metric-grid">
                <MetricCard label="総ユーザー数" value={`${stats.totalUsers}人`} sublabel={`今日 +${stats.todayUsers}人`} />
                <MetricCard label="総投稿数" value={`${stats.totalPosts}件`} sublabel={`今日 +${stats.todayPosts}件`} />
                <MetricCard label="総コメント数" value={`${stats.totalComments}件`} sublabel={`今日 +${stats.todayComments}件`} />
                <MetricCard label="解決済み投稿" value={`${stats.solvedPosts}件`} sublabel={`解決率 ${formatPercent(stats.solvedRate)}`} />
                <MetricCard label="ベストアンサー数" value={`${stats.bestAnswers}件`} sublabel="累計" />
              </div>
            </section>

            <section className="admin-section">
              <h2 className="admin-section__title">直近7日</h2>
              <div className="admin-trend-grid">
                <section className="admin-trend-card">
                  <h3 className="admin-trend-card__title">新規ユーザー</h3>
                  <ul className="admin-trend-list">
                    {stats.userTrend.map((item) => (
                      <li key={`users-${item.label}`} className="admin-trend-list__item">
                        <span>{item.label}</span>
                        <strong>{item.count}人</strong>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="admin-trend-card">
                  <h3 className="admin-trend-card__title">投稿数</h3>
                  <ul className="admin-trend-list">
                    {stats.postTrend.map((item) => (
                      <li key={`posts-${item.label}`} className="admin-trend-list__item">
                        <span>{item.label}</span>
                        <strong>{item.count}件</strong>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="admin-trend-card">
                  <h3 className="admin-trend-card__title">コメント数</h3>
                  <ul className="admin-trend-list">
                    {stats.commentTrend.map((item) => (
                      <li key={`comments-${item.label}`} className="admin-trend-list__item">
                        <span>{item.label}</span>
                        <strong>{item.count}件</strong>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </section>
          </>
        )}
      </main>

      <BottomNav active="" />
    </div>
  );
}
