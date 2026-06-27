import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, documentId, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db, logAppEvent } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { isSpecialSkinUserId } from '../utils/specialAvatar';
import { buildAuthPath } from '../utils/authLinks';
import './RankingPage.css';

const RANKING_FETCH_LIMIT = 100;

function chunkArray(values, size) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

export function RankingPage() {
  const navigate = useNavigate();
  const { firebaseUser } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchRanking = async () => {
      setLoading(true);
      try {
        const rankingSnap = await getDocs(
          query(
            collection(db, 'rankingBestAnswers'),
            orderBy('bestAnswerCount', 'desc'),
            limit(RANKING_FETCH_LIMIT)
          )
        );

        const rawRows = rankingSnap.docs.map((docSnap) => {
          const data = docSnap.data() ?? {};
          return {
            uid: docSnap.id,
            userId: data.userId ?? null,
            displayName: data.displayName ?? null,
            photoUrl: data.photoUrl ?? null,
            bestAnswerCount: Number(data.bestAnswerCount ?? 0),
          };
        });

        const uids = rawRows.map((row) => row.uid);
        if (uids.length === 0) {
          if (!cancelled) setRows([]);
          return;
        }

        const userByUid = new Map();
        const missingProfileUids = rawRows.filter((row) => !row.displayName || !row.userId).map((row) => row.uid);
        if (missingProfileUids.length > 0) {
          const userSnaps = await Promise.all(
            chunkArray(missingProfileUids, 30).map((uidChunk) =>
              getDocs(query(collection(db, 'users'), where(documentId(), 'in', uidChunk)))
            )
          );

          userSnaps.forEach((snap) => {
            snap.docs.forEach((userDoc) => {
              userByUid.set(userDoc.id, userDoc.data() ?? {});
            });
          });
        }

        const nextRows = rawRows
          .map((row) => {
            const fallbackUser = userByUid.get(row.uid) ?? {};
            return {
              uid: row.uid,
              userId: row.userId ?? fallbackUser.userId ?? 'unknown',
              displayName: row.displayName ?? fallbackUser.displayName ?? 'ユーザー',
              photoUrl: row.photoUrl ?? fallbackUser.photoUrl ?? null,
              bestAnswerCount: row.bestAnswerCount,
            };
          })
          .filter((row) => row.bestAnswerCount > 0)
          .sort((a, b) => b.bestAnswerCount - a.bestAnswerCount || a.displayName.localeCompare(b.displayName))
          .map((row, index) => ({ ...row, rank: index + 1 }));

        if (!cancelled) setRows(nextRows);
        if (!cancelled) {
          logAppEvent('ranking_view', {
            row_count: nextRows.length,
            signed_in: Boolean(firebaseUser),
            top_score: nextRows[0]?.bestAnswerCount ?? 0,
          });
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRanking();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  const totalBestAnswers = rows.reduce((sum, row) => sum + row.bestAnswerCount, 0);
  const topHelper = rows[0] ?? null;

  const handleRankingCta = (action) => {
    logAppEvent('ranking_cta_click', {
      action,
      signed_in: Boolean(firebaseUser),
      row_count: rows.length,
      top_score: topHelper?.bestAnswerCount ?? 0,
    });

    if (action === 'browse_unanswered') {
      navigate('/?sort=unanswered&source=ranking');
      return;
    }

    if (action === 'create_post') {
      navigate(firebaseUser ? '/create' : buildAuthPath({ returnTo: '/create' }), {
        state: firebaseUser
          ? undefined
          : { message: '投稿するには無料登録が必要です。', returnTo: '/create' },
      });
    }
  };

  return (
    <div className="ranking-page">
      <header className="ranking-header">
        <div className="ranking-header__inner">
          <h1 className="ranking-title">返してくれる人</h1>
          <p className="ranking-subtitle">ベストアンサーから、相談に具体的に返している人を見られます。</p>
        </div>
      </header>

      <main className="ranking-main">
        <section className="ranking-summary" aria-label="ランキング概要">
          <div>
            <p className="ranking-summary__label">ベストアンサー合計</p>
            <strong>{totalBestAnswers.toLocaleString('ja-JP')}回</strong>
          </div>
          <div>
            <p className="ranking-summary__label">掲載ユーザー</p>
            <strong>{rows.length.toLocaleString('ja-JP')}人</strong>
          </div>
          <div>
            <p className="ranking-summary__label">トップ</p>
            <strong>{topHelper ? `${topHelper.bestAnswerCount}回` : '-'}</strong>
          </div>
        </section>

        <section className="ranking-join" aria-label="ランキング参加導線">
          <div>
            <p className="ranking-join__eyebrow">参加するなら</p>
            <h2>返信募集中の相談に、短く返すところから。</h2>
            <p>良い点、気になった秒数、確認したいこと。ひとことでも投稿者の判断材料になります。</p>
          </div>
          <div className="ranking-join__actions">
            <button type="button" onClick={() => handleRankingCta('browse_unanswered')}>
              返信募集中を見る
            </button>
            <button type="button" onClick={() => handleRankingCta('create_post')}>
              自分も相談する
            </button>
          </div>
        </section>

        {loading ? (
          <p className="ranking-state">集計中...</p>
        ) : rows.length === 0 ? (
          <div className="ranking-state ranking-state--empty">
            <p>まだランキングデータがありません。</p>
            <button type="button" onClick={() => handleRankingCta('browse_unanswered')}>
              最初の返信を探す
            </button>
          </div>
        ) : (
          <ul className="ranking-list">
            {rows.map((row) => (
              <li
                key={row.uid}
                className={`ranking-item ${row.rank === 1 ? 'ranking-item--champion' : ''}`}
                onClick={() => navigate(`/users/${row.uid}`)}
              >
                <span className={`ranking-rank ${row.rank <= 3 ? 'ranking-rank--top' : ''}`}>{row.rank}</span>
                <span className={`ranking-avatar-shell ${isSpecialSkinUserId(row.userId) ? 'ranking-avatar-shell--special' : ''}`}>
                  {row.photoUrl ? (
                    <img className="ranking-avatar" src={row.photoUrl} alt="" loading="lazy" fetchPriority="low" decoding="async" />
                  ) : (
                    <div className="ranking-avatar-fallback">{row.displayName?.[0]?.toUpperCase() ?? '?'}</div>
                  )}
                </span>
                <div className="ranking-user">
                  {row.rank === 1 && <p className="ranking-champion-title">よく選ばれています</p>}
                  <p className="ranking-name">{row.displayName}</p>
                  <p className="ranking-id">@{row.userId}</p>
                </div>
                <div className="ranking-score">
                  <span className="ranking-score__label">ベストアンサー</span>
                  <span className="ranking-score__value">{row.bestAnswerCount}回</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <BottomNav active="ranking" />
    </div>
  );
}
