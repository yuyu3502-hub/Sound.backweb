import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, documentId, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { BottomNav } from '../components/BottomNav';
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
  }, []);

  return (
    <div className="ranking-page">
      <div className="ranking-bg" aria-hidden="true">
        <div className="ranking-bg__base" />
        <div className="ranking-bg__stage-lights">
          <div className="ranking-bg__spot ranking-bg__spot--left" />
          <div className="ranking-bg__spot ranking-bg__spot--center" />
          <div className="ranking-bg__spot ranking-bg__spot--right" />
        </div>
        <div className="ranking-bg__center-glow" />
        <div className="ranking-bg__laser ranking-bg__laser--a" />
        <div className="ranking-bg__laser ranking-bg__laser--b" />
        <div className="ranking-bg__fog" />
        <div className="ranking-bg__particles ranking-bg__particles--near" />
        <div className="ranking-bg__uplights">
          <div className="ranking-bg__uplight ranking-bg__uplight--1" />
          <div className="ranking-bg__uplight ranking-bg__uplight--2" />
          <div className="ranking-bg__uplight ranking-bg__uplight--3" />
          <div className="ranking-bg__uplight ranking-bg__uplight--4" />
          <div className="ranking-bg__uplight ranking-bg__uplight--5" />
        </div>
        <div className="ranking-bg__bokeh ranking-bg__bokeh--near" />
      </div>

      <header className="ranking-header">
        <div className="ranking-header__inner">
          <h1 className="ranking-title">Ranking</h1>
        </div>
      </header>

      <main className="ranking-main">
        {loading ? (
          <p className="ranking-state">集計中...</p>
        ) : rows.length === 0 ? (
          <p className="ranking-state">まだランキングデータがありません。</p>
        ) : (
          <ul className="ranking-list">
            {rows.map((row) => (
              <li
                key={row.uid}
                className={`ranking-item ${row.rank === 1 ? 'ranking-item--champion' : ''}`}
                onClick={() => navigate(`/users/${row.uid}`)}
              >
                <span className={`ranking-rank ${row.rank <= 3 ? 'ranking-rank--top' : ''}`}>{row.rank}</span>
                {row.photoUrl ? (
                  <img className="ranking-avatar" src={row.photoUrl} alt="" loading="lazy" fetchPriority="low" decoding="async" />
                ) : (
                  <div className="ranking-avatar-fallback">{row.displayName?.[0]?.toUpperCase() ?? '?'}</div>
                )}
                <div className="ranking-user">
                  {row.rank === 1 && <p className="ranking-champion-title">👑 MIX KING</p>}
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
