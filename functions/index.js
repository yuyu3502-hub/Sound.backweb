const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const REGION = 'asia-northeast1';
const RANKING_COLLECTION = 'rankingBestAnswers';

function getIsBestAnswer(data) {
  return data?.isBestAnswer === true;
}

function addDelta(deltaByUid, uid, delta) {
  if (!uid || delta === 0) return;
  const current = deltaByUid.get(uid) ?? 0;
  const next = current + delta;
  if (next === 0) {
    deltaByUid.delete(uid);
    return;
  }
  deltaByUid.set(uid, next);
}

function computeBestAnswerDeltas(beforeData, afterData) {
  const deltaByUid = new Map();

  if (getIsBestAnswer(beforeData)) {
    addDelta(deltaByUid, beforeData.authorUid, -1);
  }

  if (getIsBestAnswer(afterData)) {
    addDelta(deltaByUid, afterData.authorUid, 1);
  }

  return deltaByUid;
}

async function applyRankingDeltas(deltaByUid) {
  if (deltaByUid.size === 0) return;

  const touchedUids = Array.from(deltaByUid.keys());
  const userRefs = touchedUids.map((uid) => db.collection('users').doc(uid));
  const userSnaps = await db.getAll(...userRefs);

  const userByUid = new Map();
  userSnaps.forEach((snap) => {
    if (snap.exists) {
      userByUid.set(snap.id, snap.data() ?? {});
    }
  });

  await db.runTransaction(async (tx) => {
    for (const uid of touchedUids) {
      const delta = deltaByUid.get(uid) ?? 0;
      if (!delta) continue;

      const rankingRef = db.collection(RANKING_COLLECTION).doc(uid);
      const rankingSnap = await tx.get(rankingRef);
      const userData = userByUid.get(uid) ?? {};
      const currentCount = Number(rankingSnap.data()?.bestAnswerCount ?? 0);
      const nextCount = Math.max(0, currentCount + delta);

      if (nextCount <= 0) {
        tx.delete(rankingRef);
        continue;
      }

      tx.set(
        rankingRef,
        {
          uid,
          bestAnswerCount: nextCount,
          userId: userData.userId ?? rankingSnap.data()?.userId ?? null,
          displayName: userData.displayName ?? rankingSnap.data()?.displayName ?? null,
          photoUrl: userData.photoUrl ?? rankingSnap.data()?.photoUrl ?? null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });
}

exports.onCommentBestAnswerChange = onDocumentWritten(
  {
    region: REGION,
    document: 'comments/{commentId}',
  },
  async (event) => {
    const beforeData = event.data?.before?.exists ? event.data.before.data() : null;
    const afterData = event.data?.after?.exists ? event.data.after.data() : null;

    const deltaByUid = computeBestAnswerDeltas(beforeData, afterData);
    if (deltaByUid.size === 0) return;

    await applyRankingDeltas(deltaByUid);
  }
);

exports.onUserProfileUpdateForRanking = onDocumentWritten(
  {
    region: REGION,
    document: 'users/{uid}',
  },
  async (event) => {
    if (!event.data?.after?.exists) return;

    const uid = event.params.uid;
    const afterData = event.data.after.data() ?? {};
    const rankingRef = db.collection(RANKING_COLLECTION).doc(uid);
    const rankingSnap = await rankingRef.get();
    if (!rankingSnap.exists) return;

    await rankingRef.set(
      {
        userId: afterData.userId ?? null,
        displayName: afterData.displayName ?? null,
        photoUrl: afterData.photoUrl ?? null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
);

exports.backfillBestAnswerRanking = onRequest(
  {
    region: REGION,
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const configuredKey = process.env.BACKFILL_KEY ?? '';
    if (configuredKey) {
      const requestKey = req.get('x-backfill-key') ?? '';
      if (requestKey !== configuredKey) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    try {
      const commentsSnap = await db
        .collection('comments')
        .where('isBestAnswer', '==', true)
        .get();

      const countsByUid = new Map();
      commentsSnap.docs.forEach((docSnap) => {
        const data = docSnap.data() ?? {};
        if (!data.authorUid) return;
        const current = countsByUid.get(data.authorUid) ?? 0;
        countsByUid.set(data.authorUid, current + 1);
      });

      const uids = Array.from(countsByUid.keys());
      const userByUid = new Map();

      for (let i = 0; i < uids.length; i += 200) {
        const uidChunk = uids.slice(i, i + 200);
        const refs = uidChunk.map((uid) => db.collection('users').doc(uid));
        const snaps = await db.getAll(...refs);
        snaps.forEach((snap) => {
          if (snap.exists) userByUid.set(snap.id, snap.data() ?? {});
        });
      }

      const batch = db.batch();
      uids.forEach((uid) => {
        const user = userByUid.get(uid) ?? {};
        batch.set(
          db.collection(RANKING_COLLECTION).doc(uid),
          {
            uid,
            bestAnswerCount: countsByUid.get(uid) ?? 0,
            userId: user.userId ?? null,
            displayName: user.displayName ?? null,
            photoUrl: user.photoUrl ?? null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });

      const currentRankingSnap = await db.collection(RANKING_COLLECTION).get();
      currentRankingSnap.docs.forEach((docSnap) => {
        if (!countsByUid.has(docSnap.id)) {
          batch.delete(docSnap.ref);
        }
      });

      await batch.commit();

      logger.info('Backfill completed', {
        users: uids.length,
        comments: commentsSnap.size,
      });

      res.status(200).json({
        ok: true,
        users: uids.length,
        comments: commentsSnap.size,
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: 'Backfill failed' });
    }
  }
);
