const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const REGION = 'asia-northeast1';
const RANKING_COLLECTION = 'rankingBestAnswers';
const DAILY_SAMPLE_LIMIT = 10;
const X_DRAFT_LIMIT = 20;
const DAILY_SAMPLE_SEED_ENABLED = process.env.ENABLE_DAILY_SAMPLE_SEED === 'true';
const X_SOURCE_TYPES = new Set(['AI', 'DAW', 'Trend', 'Singer', 'Thought']);
const X_DRAFT_STATUS = new Set(['queued', 'needs_review', 'approved', 'rejected', 'posted']);

const WORRY_GENRES = new Set([
  'ミックス',
  'アレンジ',
  'マスタリング',
  'DAW操作',
  'AI作曲',
  'メロディ',
  'コード進行',
  'リズム',
  'その他',
]);

const MUSIC_GENRES = new Set([
  'J-POP',
  'Rock',
  'Hip-Hop',
  'EDM',
  'Lo-fi',
  'Ballad',
  'Anime',
  'その他',
]);

const DAW_OPTIONS = new Set([
  'Logic Pro',
  'Ableton Live',
  'FL Studio',
  'Cubase',
  'Studio One',
  'Pro Tools',
  'GarageBand',
  'Reaper',
  'Cakewalk',
  'その他',
]);

function normalizeText(value, maxLength = 300) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeOptionalText(value, maxLength = 120) {
  const normalized = normalizeText(value, maxLength);
  return normalized || null;
}

function normalizeFromSet(value, allowedSet) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return allowedSet.has(trimmed) ? trimmed : null;
}

function ensureDraftArray(value) {
  return Array.isArray(value) ? value.slice(0, DAILY_SAMPLE_LIMIT) : [];
}

function ensureXDraftArray(value) {
  return Array.isArray(value) ? value.slice(0, X_DRAFT_LIMIT) : [];
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function getClientIp(req) {
  return req.get('x-forwarded-for') || req.ip || 'unknown';
}

function normalizeXSourceType(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return X_SOURCE_TYPES.has(normalized) ? normalized : null;
}

function normalizeXSlotTime(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized) ? normalized : null;
}

function normalizeXDate(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function normalizeXStatus(value) {
  if (typeof value !== 'string') return 'queued';
  const normalized = value.trim();
  return X_DRAFT_STATUS.has(normalized) ? normalized : 'queued';
}

function normalizeRecommendationScore(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeQualityFlags(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeText(item, 120))
    .filter(Boolean)
    .slice(0, 20);
}

function buildXDraftPayload(rawDraft, createdBy) {
  const date = normalizeXDate(rawDraft?.date);
  const slotTime = normalizeXSlotTime(rawDraft?.slotTime);
  const sourceType = normalizeXSourceType(rawDraft?.sourceType);
  const cardId = normalizeOptionalText(rawDraft?.cardId, 120);
  const postText = normalizeText(rawDraft?.postText, 500);
  const sourceUrl = normalizeOptionalText(rawDraft?.sourceUrl, 400);
  const headline = normalizeOptionalText(rawDraft?.headline, 160);
  const postKind =
    normalizeOptionalText(rawDraft?.postKind, 40) ?? (sourceType === 'Thought' ? 'thought' : 'news');
  const recommendationScore = normalizeRecommendationScore(rawDraft?.recommendationScore);
  const status = normalizeXStatus(rawDraft?.status);
  const qualityFlags = normalizeQualityFlags(rawDraft?.qualityFlags);

  if (!date || !slotTime || !sourceType || !cardId || !postText) {
    return null;
  }

  return {
    date,
    slotTime,
    sourceType,
    cardId,
    postText,
    sourceUrl,
    headline,
    postKind,
    recommendationScore,
    status,
    qualityFlags,
    createdBy,
    updatedBy: createdBy,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function getUserProfile(uid, fallbackDisplayName) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) {
    return {
      userId: null,
      displayName: fallbackDisplayName,
      photoUrl: null,
    };
  }

  const data = snap.data() ?? {};
  return {
    userId: typeof data.userId === 'string' ? data.userId : null,
    displayName: typeof data.displayName === 'string' ? data.displayName : fallbackDisplayName,
    photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : null,
  };
}

function buildPostPayload(authorUid, profile, rawDraft) {
  const body = normalizeText(rawDraft?.body, 300);
  if (!body) return null;

  return {
    authorUid,
    authorDisplayName: profile.displayName,
    authorPhotoUrl: profile.photoUrl,
    body,
    worryGenre: normalizeFromSet(rawDraft?.worryGenre, WORRY_GENRES),
    musicGenre: normalizeFromSet(rawDraft?.musicGenre, MUSIC_GENRES),
    daw: normalizeFromSet(rawDraft?.daw, DAW_OPTIONS),
    imageUrl: null,
    audioUrl: null,
    audioDurationSec: null,
    focusSecondSec: null,
    allowExternalFeature: false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    isSolved: false,
    bestAnswerCommentId: null,
    deleted: false,
    questionType: 'open',
    isPriority: false,
    likeCount: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildCommentPayload(authorUid, profile, rawDraft, postId) {
  const body = normalizeText(rawDraft?.body, 300);
  if (!body || !postId) return null;

  return {
    postId,
    authorUid,
    authorUserId: profile.userId,
    authorDisplayName: profile.displayName,
    authorPhotoUrl: profile.photoUrl,
    body,
    imageUrl: null,
    replyToCommentId: normalizeOptionalText(rawDraft?.replyToCommentId, 120),
    replyToAuthorUid: normalizeOptionalText(rawDraft?.replyToAuthorUid, 120),
    replyToAuthorName: normalizeOptionalText(rawDraft?.replyToAuthorName, 60),
    isBestAnswer: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function getFallbackPostIds(excludeUid) {
  const snap = await db
    .collection('posts')
    .orderBy('createdAt', 'desc')
    .limit(40)
    .get();

  return snap.docs
    .map((docSnap) => ({ id: docSnap.id, authorUid: docSnap.data()?.authorUid ?? null }))
    .filter((item) => item.authorUid && item.authorUid !== excludeUid)
    .map((item) => item.id)
    .slice(0, 20);
}

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
    if (!configuredKey) {
      res.status(500).json({ error: 'BACKFILL_KEY is not configured' });
      return;
    }

    const requestKey = req.get('x-backfill-key') ?? '';
    if (requestKey !== configuredKey) {
      res.status(403).json({ error: 'Forbidden' });
      return;
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

exports.seedDailySamples = onRequest(
  {
    region: REGION,
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    if (!DAILY_SAMPLE_SEED_ENABLED) {
      logger.info('seedDailySamples disabled');
      res.status(403).json({ error: 'seedDailySamples is disabled' });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const configuredKey = process.env.N8N_AUTOMATION_KEY ?? '';
    if (!configuredKey) {
      res.status(500).json({ error: 'N8N_AUTOMATION_KEY is not configured' });
      return;
    }

    const requestKey = req.get('x-automation-key') ?? '';
    if (requestKey !== configuredKey) {
      logger.warn('seedDailySamples forbidden', { ip: getClientIp(req) });
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const postAuthorUid = process.env.SAMPLE_POST_AUTHOR_UID ?? '';
    const commentAuthorUid = process.env.SAMPLE_COMMENT_AUTHOR_UID ?? postAuthorUid;

    if (!postAuthorUid || !commentAuthorUid) {
      res.status(500).json({ error: 'Sample author uid env vars are not configured' });
      return;
    }

    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const postDrafts = ensureDraftArray(body.postDrafts);
      const commentDrafts = ensureDraftArray(body.commentDrafts);
      const dryRun = body.dryRun === true;

      if (!isNonEmptyArray(postDrafts) && !isNonEmptyArray(commentDrafts)) {
        res.status(400).json({ error: 'postDrafts or commentDrafts is required' });
        return;
      }

      const [postProfile, commentProfile] = await Promise.all([
        getUserProfile(postAuthorUid, '運営サンプル'),
        getUserProfile(commentAuthorUid, '運営コメント'),
      ]);

      const postPayloads = postDrafts
        .map((draft) => buildPostPayload(postAuthorUid, postProfile, draft))
        .filter(Boolean);

      const createdPostRefs = [];

      if (!dryRun) {
        for (const payload of postPayloads) {
          const ref = await db.collection('posts').add(payload);
          createdPostRefs.push(ref);
        }
      }

      let candidatePostIds = createdPostRefs.map((ref) => ref.id);
      if (commentDrafts.length > 0 && candidatePostIds.length < commentDrafts.length) {
        const fallbackIds = await getFallbackPostIds(commentAuthorUid);
        const merged = new Set([...candidatePostIds, ...fallbackIds]);
        candidatePostIds = Array.from(merged);
      }

      const commentPayloads = commentDrafts
        .map((draft, index) => {
          const postId = normalizeOptionalText(draft?.postId, 120) ?? candidatePostIds[index] ?? null;
          return buildCommentPayload(commentAuthorUid, commentProfile, draft, postId);
        })
        .filter(Boolean);

      const createdCommentRefs = [];
      if (!dryRun) {
        for (const payload of commentPayloads) {
          const ref = await db.collection('comments').add(payload);
          createdCommentRefs.push(ref);
        }
      }

      logger.info('seedDailySamples success', {
        dryRun,
        posts: postPayloads.length,
        comments: commentPayloads.length,
      });

      res.status(200).json({
        ok: true,
        dryRun,
        postsCreated: dryRun ? postPayloads.length : createdPostRefs.length,
        commentsCreated: dryRun ? commentPayloads.length : createdCommentRefs.length,
        postIds: dryRun ? [] : createdPostRefs.map((ref) => ref.id),
        commentIds: dryRun ? [] : createdCommentRefs.map((ref) => ref.id),
      });
    } catch (err) {
      logger.error('seedDailySamples failed', err);
      res.status(500).json({ error: 'seedDailySamples failed' });
    }
  }
);

exports.seedXDrafts = onRequest(
  {
    region: REGION,
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const configuredKey = process.env.N8N_AUTOMATION_KEY ?? '';
    if (!configuredKey) {
      res.status(500).json({ error: 'N8N_AUTOMATION_KEY is not configured' });
      return;
    }

    const requestKey = req.get('x-automation-key') ?? '';
    if (requestKey !== configuredKey) {
      logger.warn('seedXDrafts forbidden', { ip: getClientIp(req) });
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const drafts = ensureXDraftArray(body.drafts ?? body.postDrafts);
      const createdBy = normalizeOptionalText(body.createdBy, 80) ?? 'n8n';

      if (!isNonEmptyArray(drafts)) {
        res.status(400).json({ error: 'drafts is required' });
        return;
      }

      const preparedDrafts = drafts
        .map((draft) => ({
          draft,
          payload: buildXDraftPayload(draft, createdBy),
        }))
        .filter((item) => Boolean(item.payload));

      const payloads = preparedDrafts.map((item) => item.payload);

      if (!isNonEmptyArray(payloads)) {
        res.status(400).json({ error: 'No valid drafts in payload' });
        return;
      }

      const createdIds = [];
      for (const payload of payloads) {
        const ref = await db.collection('x_post_drafts').add(payload);
        createdIds.push(ref.id);
      }

      const usedNewsSourceIds = [];
      for (const item of preparedDrafts) {
        const postKind =
          typeof item.payload?.postKind === 'string' ? item.payload.postKind.trim().toLowerCase() : '';

        if (postKind !== 'news' || !item.payload.sourceUrl) {
          continue;
        }

        const usedSourcePayload = {
          sourceUrl: item.payload.sourceUrl,
          headline: item.payload.headline,
          sourceType: item.payload.sourceType,
          postText: item.payload.postText,
          recommendationScore: normalizeRecommendationScore(item.draft?.recommendationScore),
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: 'n8n',
        };

        const usedSourceRef = await db.collection('xUsedNewsSources').add(usedSourcePayload);
        usedNewsSourceIds.push(usedSourceRef.id);
      }

      logger.info('seedXDrafts success', {
        drafts: payloads.length,
        usedNewsSources: usedNewsSourceIds.length,
      });

      res.status(200).json({
        ok: true,
        draftsCreated: payloads.length,
        draftIds: createdIds,
        usedNewsSourcesCreated: usedNewsSourceIds.length,
        usedNewsSourceIds,
      });
    } catch (err) {
      logger.error('seedXDrafts failed', err);
      res.status(500).json({ error: 'seedXDrafts failed' });
    }
  }
);

exports.getUsedXNewsSources = onRequest(
  {
    region: REGION,
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const configuredKey = process.env.N8N_AUTOMATION_KEY ?? '';
    if (!configuredKey) {
      res.status(500).json({ error: 'N8N_AUTOMATION_KEY is not configured' });
      return;
    }

    const requestKey = req.get('x-automation-key') ?? '';
    if (requestKey !== configuredKey) {
      logger.warn('getUsedXNewsSources forbidden', { ip: getClientIp(req) });
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    try {
      const cutoffDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const snap = await db
        .collection('xUsedNewsSources')
        .where('usedAt', '>=', cutoffDate)
        .orderBy('usedAt', 'desc')
        .limit(200)
        .get();

      const usedSources = snap.docs.map((docSnap) => {
        const data = docSnap.data() ?? {};
        const usedAt = data.usedAt && typeof data.usedAt.toDate === 'function'
          ? data.usedAt.toDate().toISOString()
          : null;

        return {
          sourceUrl: normalizeOptionalText(data.sourceUrl, 400),
          headline: normalizeOptionalText(data.headline, 160),
          sourceType: normalizeOptionalText(data.sourceType, 40),
          usedAt,
        };
      });

      const usedUrls = Array.from(
        new Set(usedSources.map((item) => item.sourceUrl).filter(Boolean))
      );
      const usedHeadlines = Array.from(
        new Set(usedSources.map((item) => item.headline).filter(Boolean))
      );

      res.status(200).json({
        ok: true,
        usedUrls,
        usedHeadlines,
        usedSources,
      });
    } catch (err) {
      logger.error('getUsedXNewsSources failed', err);
      res.status(500).json({ error: 'getUsedXNewsSources failed' });
    }
  }
);
