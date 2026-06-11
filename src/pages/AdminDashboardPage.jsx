import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { hasAdminAccess } from '../utils/adminAccess';
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

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatUpdatedAt(value) {
  if (!value || typeof value.toDate !== 'function') {
    return '-';
  }
  return value.toDate().toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status) {
  if (status === 'queued') return '生成済み';
  if (status === 'needs_review') return '要確認';
  if (status === 'approved') return '承認済み';
  if (status === 'rejected') return '差し戻し';
  if (status === 'posted') return '投稿済み';
  return status || '-';
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
  const [xDrafts, setXDrafts] = useState([]);
  const [xDraftError, setXDraftError] = useState('');
  const [updatingDraftId, setUpdatingDraftId] = useState('');

  useEffect(() => {
    if (isLoading) return;
    if (!firebaseUser) {
      navigate('/auth');
      return;
    }
    if (!hasAdminAccess(firebaseUser, userData)) {
      navigate('/mypage');
      return;
    }

    let cancelled = false;

    const fetchStats = async () => {
      setLoading(true);
      setError('');
      setXDraftError('');

      try {
        const usersRef = collection(db, 'users');
        const postsRef = collection(db, 'posts');
        const commentsRef = collection(db, 'comments');
        const xDraftsRef = collection(db, 'x_post_drafts');
        const pageViewSummaryRef = doc(db, 'analytics_summary', 'pageViews');

        const now = new Date();
        const today = startOfDay(now);
        const last7Start = addDays(today, -(DAYS_TO_SHOW - 1));
        const todayKey = formatDateKey(today);
        const todayPageViewRef = doc(db, 'analytics_page_views_daily', todayKey);

        const [
          totalUsersSnap,
          todayUsersSnap,
          totalPostsSnap,
          todayPostsSnap,
          totalCommentsSnap,
          todayCommentsSnap,
          solvedPostsSnap,
          bestAnswerSnap,
          pageViewSummarySnap,
          todayPageViewSnap,
          xDraftsSnap,
        ] = await Promise.all([
          getCountFromServer(usersRef),
          getCountFromServer(query(usersRef, where('createdAt', '>=', Timestamp.fromDate(today)))),
          getCountFromServer(postsRef),
          getCountFromServer(query(postsRef, where('createdAt', '>=', Timestamp.fromDate(today)))),
          getCountFromServer(commentsRef),
          getCountFromServer(query(commentsRef, where('createdAt', '>=', Timestamp.fromDate(today)))),
          getCountFromServer(query(postsRef, where('isSolved', '==', true))),
          getCountFromServer(query(commentsRef, where('isBestAnswer', '==', true))),
          getDoc(pageViewSummaryRef),
          getDoc(todayPageViewRef),
          getDocs(query(xDraftsRef, orderBy('createdAt', 'desc'), limit(40))),
        ]);

        const dayStarts = Array.from({ length: DAYS_TO_SHOW }, (_, index) => addDays(last7Start, index));

        const [userTrend, postTrend, commentTrend, pageViewTrend] = await Promise.all([
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
          Promise.all(
            dayStarts.map(async (dayStart) => {
              const dayKey = formatDateKey(dayStart);
              const snap = await getDoc(doc(db, 'analytics_page_views_daily', dayKey));
              return { label: formatDayLabel(dayStart), count: Number(snap.data()?.count ?? 0) };
            })
          ),
        ]);

        const totalPosts = Number(totalPostsSnap.data().count ?? 0);
        const solvedPosts = Number(solvedPostsSnap.data().count ?? 0);
        const solvedRate = totalPosts === 0 ? 0 : (solvedPosts / totalPosts) * 100;
        const draftRows = xDraftsSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

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
            totalPageViews: Number(pageViewSummarySnap.data()?.totalCount ?? 0),
            todayPageViews: Number(todayPageViewSnap.data()?.count ?? 0),
            userTrend,
            postTrend,
            commentTrend,
            pageViewTrend,
          });
          setXDrafts(draftRows);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError('運営データの取得に失敗しました。');
          setXDraftError('X原稿の取得に失敗しました。');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchStats();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, isLoading, navigate, userData]);

  const updateXDraftStatus = async (draftId, nextStatus) => {
    if (!draftId || !nextStatus || !firebaseUser?.uid) return;
    setUpdatingDraftId(draftId);
    setXDraftError('');

    try {
      await updateDoc(doc(db, 'x_post_drafts', draftId), {
        status: nextStatus,
        updatedBy: firebaseUser.uid,
        updatedAt: serverTimestamp(),
      });

      setXDrafts((current) =>
        current.map((item) =>
          item.id === draftId
            ? {
                ...item,
                status: nextStatus,
                updatedBy: firebaseUser.uid,
                updatedAt: Timestamp.now(),
              }
            : item
        )
      );
    } catch (err) {
      console.error(err);
      setXDraftError('X原稿の更新に失敗しました。');
    } finally {
      setUpdatingDraftId('');
    }
  };

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
                <MetricCard label="総閲覧数" value={`${stats.totalPageViews}PV`} sublabel={`今日 +${stats.todayPageViews}PV`} />
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

                <section className="admin-trend-card">
                  <h3 className="admin-trend-card__title">閲覧数（PV）</h3>
                  <ul className="admin-trend-list">
                    {stats.pageViewTrend.map((item) => (
                      <li key={`pv-${item.label}`} className="admin-trend-list__item">
                        <span>{item.label}</span>
                        <strong>{item.count}PV</strong>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </section>

            <section className="admin-section">
              <h2 className="admin-section__title">X原稿キュー</h2>
              {xDraftError && <p className="admin-state admin-state--error">{xDraftError}</p>}
              {!xDraftError && xDrafts.length === 0 && <p className="admin-state">原稿はまだありません。</p>}

              {xDrafts.length > 0 && (
                <div className="admin-xdraft-list">
                  {xDrafts.map((draft) => {
                    const isWorking = updatingDraftId === draft.id;
                    const status = typeof draft.status === 'string' ? draft.status : '';
                    const qualityFlags = Array.isArray(draft.qualityFlags) ? draft.qualityFlags : [];

                    return (
                      <article className="admin-xdraft-card" key={draft.id}>
                        <div className="admin-xdraft-card__head">
                          <p className="admin-xdraft-card__meta">
                            {draft.date || '-'} {draft.slotTime || '--:--'} / {draft.sourceType || '-'}
                          </p>
                          <span className={`admin-xdraft-status admin-xdraft-status--${status || 'unknown'}`}>
                            {statusLabel(status)}
                          </span>
                        </div>

                        <h3 className="admin-xdraft-card__title">{draft.headline || '見出しなし'}</h3>
                        <p className="admin-xdraft-card__body">{draft.postText || '-'}</p>

                        <div className="admin-xdraft-card__subline">
                          <span>URL: {draft.sourceUrl || '-'}</span>
                          <span>更新: {formatUpdatedAt(draft.updatedAt)}</span>
                        </div>

                        {qualityFlags.length > 0 && (
                          <ul className="admin-xdraft-flags">
                            {qualityFlags.map((flag) => (
                              <li key={`${draft.id}-${flag}`}>{flag}</li>
                            ))}
                          </ul>
                        )}

                        <div className="admin-xdraft-actions">
                          <button
                            className="admin-xdraft-btn admin-xdraft-btn--approve"
                            onClick={() => updateXDraftStatus(draft.id, 'approved')}
                            disabled={isWorking}
                          >
                            承認
                          </button>
                          <button
                            className="admin-xdraft-btn admin-xdraft-btn--review"
                            onClick={() => updateXDraftStatus(draft.id, 'needs_review')}
                            disabled={isWorking}
                          >
                            要確認
                          </button>
                          <button
                            className="admin-xdraft-btn admin-xdraft-btn--reject"
                            onClick={() => updateXDraftStatus(draft.id, 'rejected')}
                            disabled={isWorking}
                          >
                            差し戻し
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <BottomNav active="" />
    </div>
  );
}
