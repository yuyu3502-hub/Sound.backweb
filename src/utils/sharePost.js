const BODY_SNIPPET_MAX = 80;
const X_TITLE_MAX = 54;
const X_PROFILE_NAME_MAX = 42;
const X_POST_MAX = 280;
const FALLBACK_PUBLIC_APP_ORIGIN = 'https://sound-fix-ecfcf.web.app';

function normalizeOrigin(value) {
  try {
    const url = new URL(String(value || FALLBACK_PUBLIC_APP_ORIGIN));
    return url.origin;
  } catch {
    return FALLBACK_PUBLIC_APP_ORIGIN;
  }
}

const PUBLIC_APP_ORIGIN = normalizeOrigin(import.meta.env?.VITE_PUBLIC_APP_URL);

function truncateText(value, maxLength) {
  const text = String(value ?? '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function buildContextLine(post) {
  const tags = [post?.worryGenre, post?.musicGenre, post?.daw]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .slice(0, 3);

  if (tags.length === 0) {
    return '音源を聴いて、気になった点を返してもらえると助かります。';
  }

  return `${tags.join(' / ')}の相談です。気になった秒数や良い点を返してもらえると助かります。`;
}

function formatFocusSecond(value) {
  const sec = Number(value);
  if (!Number.isFinite(sec) || sec < 0) return '';

  const normalized = Math.floor(sec);
  const minutes = Math.floor(normalized / 60);
  const seconds = normalized % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function composePostXText({ lead, focusLine, contextLine, title, url }) {
  return [
    lead,
    ...(focusLine ? [focusLine] : []),
    contextLine,
    '',
    title,
    url,
    '',
    '#DTM #DTMer',
  ].join('\n');
}

function buildPostXText(post, url) {
  const lead = '曲の相談、聴いてもらえると助かります。';
  const title = truncateText(post?.title || 'Sound.backの投稿', X_TITLE_MAX);
  const contextLine = buildContextLine(post);
  const focusSecond = formatFocusSecond(post?.focusSecondSec);
  const focusLine = focusSecond ? `${focusSecond}付近を聴いてもらえると助かります。` : '';

  let text = composePostXText({ lead, focusLine, contextLine, title, url });
  if (text.length <= X_POST_MAX) return text;

  text = composePostXText({
    lead,
    focusLine,
    contextLine: '気になった秒数や良い点を返してもらえると助かります。',
    title,
    url,
  });
  if (text.length <= X_POST_MAX) return text;

  const fixedLength = composePostXText({
    lead,
    focusLine,
    contextLine: '気になった点を返してもらえると助かります。',
    title: '',
    url,
  }).length;
  const nextTitleMax = Math.max(18, Math.min(X_TITLE_MAX, X_POST_MAX - fixedLength));
  text = composePostXText({
    lead,
    focusLine,
    contextLine: '気になった点を返してもらえると助かります。',
    title: truncateText(post?.title || 'Sound.backの投稿', nextTitleMax),
    url,
  });
  if (text.length <= X_POST_MAX) return text;

  return [
    lead,
    '',
    url,
    '',
    '#DTM #DTMer',
  ].join('\n');
}

function buildTrackedPostUrl(post, origin, channel) {
  const safeOrigin =
    (origin ? normalizeOrigin(origin) : '')
    || (channel === 'x' ? PUBLIC_APP_ORIGIN : '')
    || (typeof window !== 'undefined' ? window.location.origin : PUBLIC_APP_ORIGIN);
  if (!post?.id) return safeOrigin;

  const url = new URL(`/post/${post.id}`, safeOrigin);
  url.searchParams.set('utm_source', channel === 'x' ? 'x' : 'app_share');
  url.searchParams.set('utm_medium', channel === 'x' ? 'social' : 'share');
  url.searchParams.set('utm_campaign', 'post_share');
  url.searchParams.set('utm_content', post.id);
  return url.toString();
}

function buildTrackedAppUrl(origin, channel) {
  const safeOrigin =
    (origin ? normalizeOrigin(origin) : '')
    || (channel === 'x' ? PUBLIC_APP_ORIGIN : '')
    || (typeof window !== 'undefined' ? window.location.origin : PUBLIC_APP_ORIGIN);

  const url = new URL('/', safeOrigin);
  url.searchParams.set('utm_source', channel === 'x' ? 'x' : 'app_share');
  url.searchParams.set('utm_medium', channel === 'x' ? 'social' : 'share');
  url.searchParams.set('utm_campaign', 'app_intro');
  url.searchParams.set('utm_content', 'home');
  return url.toString();
}

function buildTrackedUserUrl(user, origin, channel) {
  const safeOrigin =
    (origin ? normalizeOrigin(origin) : '')
    || (channel === 'x' ? PUBLIC_APP_ORIGIN : '')
    || (typeof window !== 'undefined' ? window.location.origin : PUBLIC_APP_ORIGIN);

  if (!user?.uid) return safeOrigin;

  const url = new URL(`/users/${user.uid}`, safeOrigin);
  url.searchParams.set('utm_source', channel === 'x' ? 'x' : 'app_share');
  url.searchParams.set('utm_medium', channel === 'x' ? 'social' : 'share');
  url.searchParams.set('utm_campaign', 'profile_share');
  url.searchParams.set('utm_content', user.uid);
  return url.toString();
}

export function buildPostSharePayload(post, origin = '', channel = 'share') {
  const url = buildTrackedPostUrl(post, origin, channel);
  const title = truncateText(post?.title || 'Sound.backの投稿', X_TITLE_MAX);
  const body = post?.body?.trim() || '';
  const snippet = body
    ? `${body.slice(0, BODY_SNIPPET_MAX)}${body.length > BODY_SNIPPET_MAX ? '...' : ''}`
    : 'Sound.backで音楽制作の相談を見てみる';
  const xText = buildPostXText(post, url);

  return {
    url,
    title,
    text: snippet,
    xText,
  };
}

export function buildAppSharePayload(origin = '', channel = 'share') {
  const url = buildTrackedAppUrl(origin, channel);
  const title = 'Sound.back';
  const text = '曲の悩みを音源つきで相談できる場所です。';
  const xText = [
    '曲を作っていて、どこを直せばいいか迷う時に。',
    '',
    'Sound.backは、ミックス/AI作曲/DAW操作などの悩みを音源つきで相談できる場所です。',
    '見るだけ、短く返すだけでもOK。',
    '',
    url,
    '',
    '#DTM #DTMer',
  ].join('\n');

  return {
    url,
    title,
    text,
    xText,
  };
}

export function buildUserSharePayload(user, origin = '', channel = 'share') {
  const url = buildTrackedUserUrl(user, origin, channel);
  const displayName = truncateText(user?.displayName || 'Sound.backユーザー', X_PROFILE_NAME_MAX);
  const userId = String(user?.userId || '').trim();
  const handleLine = userId ? `${displayName}（@${userId}）` : displayName;
  const title = `${displayName} - Sound.back`;
  const text = user?.bio?.trim() || 'Sound.backのプロフィールです。';
  const xText = [
    'Sound.backで音楽制作の相談をしているプロフィールです。',
    '',
    handleLine,
    url,
    '',
    '#DTM #DTMer',
  ].join('\n');

  return {
    url,
    title,
    text,
    xText,
  };
}

export async function shareOrCopyPost(post) {
  if (!post?.id || typeof window === 'undefined') return 'failed';

  const payload = buildPostSharePayload(post, '', 'share');

  try {
    if (navigator.share) {
      await navigator.share({
        title: payload.title,
        text: payload.text,
        url: payload.url,
      });
      return 'shared';
    }

    await navigator.clipboard.writeText(payload.url);
    return 'copied';
  } catch (err) {
    return err?.name === 'AbortError' ? 'aborted' : 'failed';
  }
}

export async function shareOrCopyApp() {
  if (typeof window === 'undefined') return 'failed';

  const payload = buildAppSharePayload('', 'share');

  try {
    if (navigator.share) {
      await navigator.share({
        title: payload.title,
        text: payload.text,
        url: payload.url,
      });
      return 'shared';
    }

    await navigator.clipboard.writeText(payload.url);
    return 'copied';
  } catch (err) {
    return err?.name === 'AbortError' ? 'aborted' : 'failed';
  }
}

export async function shareOrCopyUser(user) {
  if (!user?.uid || typeof window === 'undefined') return 'failed';

  const payload = buildUserSharePayload(user, '', 'share');

  try {
    if (navigator.share) {
      await navigator.share({
        title: payload.title,
        text: payload.text,
        url: payload.url,
      });
      return 'shared';
    }

    await navigator.clipboard.writeText(payload.url);
    return 'copied';
  } catch (err) {
    return err?.name === 'AbortError' ? 'aborted' : 'failed';
  }
}

export function openUserOnX(user) {
  if (!user?.uid || typeof window === 'undefined') return false;

  const payload = buildUserSharePayload(user, '', 'x');
  const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(payload.xText)}`;
  window.open(intentUrl, '_blank', 'noopener,noreferrer');
  return true;
}

export function openPostOnX(post) {
  if (!post?.id || typeof window === 'undefined') return false;

  const payload = buildPostSharePayload(post, '', 'x');
  const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(payload.xText)}`;
  window.open(intentUrl, '_blank', 'noopener,noreferrer');
  return true;
}

export function openAppOnX() {
  if (typeof window === 'undefined') return false;

  const payload = buildAppSharePayload('', 'x');
  const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(payload.xText)}`;
  window.open(intentUrl, '_blank', 'noopener,noreferrer');
  return true;
}
