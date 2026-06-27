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
import { db, logAppEvent } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { hasAdminAccess } from '../utils/adminAccess';
import { buildPostSharePayload } from '../utils/sharePost';
import './AdminDashboardPage.css';

const DAYS_TO_SHOW = 7;
const X_MAX_CHARS = 280;
const X_BIO_MAX_CHARS = 160;
const PUBLIC_APP_ORIGIN = 'https://sound-fix-ecfcf.web.app';
const PUBLIC_CHECK_LINKS = [
  { id: 'home', label: '公開トップ', path: '/' },
  { id: 'about', label: '説明ページ', path: '/about' },
  { id: 'og', label: 'OG画像', path: '/og-image.png' },
  { id: 'robots', label: 'robots.txt', path: '/robots.txt' },
  { id: 'sitemap', label: 'sitemap.xml', path: '/sitemap.xml' },
  { id: 'manifest', label: 'manifest', path: '/site.webmanifest' },
];
const PRE_DEPLOY_CHECK_COMMANDS = [
  'npm run check:predeploy',
];
const APP_INTRO_DRAFTS = [
  {
    id: 'intro',
    label: '初回紹介',
    description: 'プロフィールや固定ポストの近くで使いやすい基本文',
    path: '/about',
    lines: [
      '曲を作っていて、どこを直せばいいか迷う時に。',
      '',
      'Sound.backは、ミックス/AI作曲/DAW操作などの悩みを音源つきで相談できる場所です。',
      '見るだけ、短く返すだけでもOK。',
    ],
  },
  {
    id: 'browse',
    label: '見るだけ導線',
    description: '初回訪問の心理的ハードルを下げる文',
    path: '/',
    lines: [
      'いきなり投稿しなくても大丈夫です。',
      '',
      'Sound.backは、他の人の相談を聴いて「良い点」「気になった秒数」「確認したいこと」から短く返せる場所です。',
      'DTMの壁打ち場所として育てています。',
    ],
  },
  {
    id: 'creator',
    label: '投稿促進',
    description: '自分の曲を相談してほしい時の文',
    path: '/create',
    lines: [
      'ミックスやアレンジ、一人で聴き続けると判断が鈍る。',
      '',
      'Sound.backでは、曲の気になる秒数・DAW・ジャンルを添えて相談できます。',
      '聴いた人が返しやすい形にしています。',
    ],
  },
  {
    id: 'reply_unanswered',
    label: '返信募集',
    description: '見るだけの人を短い返信へ誘導する文',
    path: '/?sort=unanswered&source=x_intro',
    lines: [
      'DTMで人の曲を聴く練習にもなります。',
      '',
      'Sound.backでは、まだ返信がない制作相談を見て、良い点や気になった秒数を短く返せます。',
      '長文レビューじゃなくて大丈夫です。',
    ],
  },
  {
    id: 'ai_fix',
    label: 'AI作曲',
    description: 'AI作曲の手直し相談に寄せた文',
    path: '/?source=x_ai_fix',
    lines: [
      'AIで曲は作れるけど、自然に直すところで迷う時がある。',
      '',
      'Sound.backでは、AI作曲の違和感やアレンジの詰まりを音源つきで相談できます。',
      '気になる秒数を添えて投稿できます。',
    ],
  },
  {
    id: 'mix_wall',
    label: 'ミックス相談',
    description: 'ミックスで詰まる層へ向けた文',
    path: '/?source=x_mix',
    lines: [
      'ミックス、同じ曲を聴きすぎると判断が鈍る。',
      '',
      'Sound.backでは、ボーカルの抜け、低音、音圧などの悩みを音源つきで相談できます。',
      '聴いてほしい秒数も添えられます。',
    ],
  },
];
const SAMPLE_POST_DRAFTS = [
  {
    id: 'mix_vocal',
    label: 'ミックス相談',
    title: 'サビでボーカルが少し埋もれて聴こえます',
    description: 'X固定ポスト後に最初に置きやすい、秒数つきの相談例',
    worryGenre: 'ミックス',
    musicGenre: 'J-POP',
    daw: 'Logic Pro',
    focusSecond: '0:42',
  },
  {
    id: 'ai_arrange',
    label: 'AI作曲',
    title: 'AIで作った曲の2番以降が単調に感じます',
    description: 'AI作曲ユーザー向けに、手直し相談の使い方を見せる例',
    worryGenre: 'AI作曲',
    musicGenre: 'Anime',
    daw: 'Studio One',
    focusSecond: '1:05',
  },
  {
    id: 'low_end',
    label: '低音整理',
    title: 'キックとベースが重なって低音が膨らみます',
    description: 'EDM/低音相談の入口として、返信しやすい論点を作る例',
    worryGenre: 'ミックス',
    musicGenre: 'EDM',
    daw: 'Ableton Live',
    focusSecond: '0:30',
  },
];
const DAILY_GROWTH_ACTIONS = [
  {
    id: 'profile',
    label: '1',
    title: 'プロフィールURLを /about にする',
    description: 'XプロフィールのURL欄を説明ページへ。変更はX側で手動確認して行う。',
    actionLabel: '説明ページを開く',
    actionType: 'public_check',
    targetId: 'about',
  },
  {
    id: 'pinned',
    label: '2',
    title: '固定ポストを出す',
    description: 'Xプロフィール素材の固定ポスト候補をコピーして、投稿ボタンだけ手動で押す。',
    actionLabel: '素材を見る',
    actionType: 'scroll',
    targetId: 'x_profile',
  },
  {
    id: 'sample',
    label: '3',
    title: '運営サンプル相談を1件作る',
    description: '音源を添えて、秒数つき相談の使い方を見せる。',
    actionLabel: '作成へ',
    actionType: 'sample',
    targetId: 'mix_vocal',
  },
  {
    id: 'browse',
    label: '4',
    title: '見るだけOK投稿を出す',
    description: '固定ポスト直後に、返信募集中の相談へ誘導する。',
    actionLabel: 'X下書き',
    actionType: 'app_intro',
    targetId: 'browse',
  },
  {
    id: 'reply_unanswered',
    label: '5',
    title: '未返信相談へ誘導する',
    description: '返信が少ない日は、短い返信でも参加できることを出す。',
    actionLabel: 'X下書き',
    actionType: 'app_intro',
    targetId: 'reply_unanswered',
  },
  {
    id: 'measure',
    label: '6',
    title: '24時間後に数字を見る',
    description: 'page_view, about_cta_click, home_post_open, create_post_cta_click を見る。',
    actionLabel: '計測ガイド',
    actionType: 'scroll',
    targetId: 'growth_guide',
  },
];
const X_PROFILE_DRAFTS = [
  {
    id: 'bio',
    label: 'プロフィール文',
    maxChars: X_BIO_MAX_CHARS,
    text: 'Sound.back｜曲の悩みを音源つきで相談できる場所。ミックス/AI作曲/DAW操作など、気になる秒数を添えて壁打ちできます。#DTM',
  },
  {
    id: 'pinned',
    label: '固定ポスト',
    maxChars: X_MAX_CHARS,
    text: [
      '曲を作っていて、',
      '「どこが悪いのか分からない」',
      '「ミックスが一人だと詰まる」',
      '「AI作曲を自然に直したい」',
      'みたいな時に、音源つきで相談できる場所を作っています。',
      '',
      'Sound.back',
      '音楽制作の悩みを、音で相談するコミュニティ。',
      '',
      `${PUBLIC_APP_ORIGIN}/about`,
      '#DTM #DTMer',
    ].join('\n'),
  },
];
const GROWTH_MEASUREMENT_CARDS = [
  {
    id: 'traffic',
    title: '流入と共有',
    focus: 'X投稿やアプリ内共有が、訪問から登録/投稿に繋がっているかを見る。',
    events: ['page_view', 'app_share_click', 'post_share_click', 'profile_share_click', 'mypage_public_profile_open', 'profile_bio_prompt_apply', 'profile_update_success', 'post_x_text_copy', 'admin_app_intro_x_draft_open'],
  },
  {
    id: 'attribution',
    title: '流入元',
    focus: '主要イベントの acquisition_* パラメータで、どの共有導線が効いたかを見る。',
    events: ['acquisition_source', 'acquisition_medium', 'acquisition_campaign', 'acquisition_content', 'acquisition_landing_path'],
  },
  {
    id: 'first_visit',
    title: '初回閲覧',
    focus: '来た人が投稿一覧や詳細まで進んでいるかを見る。',
    events: ['home_about_click', 'about_cta_click', 'about_share_click', 'home_landing_context_view', 'home_landing_context_click', 'home_landing_context_dismiss', 'home_guest_browse_click', 'home_post_open', 'home_guest_genre_filter', 'home_feed_sort_change'],
  },
  {
    id: 'discovery',
    title: '相談探し',
    focus: '近い悩みを探す人が、検索から投稿詳細や投稿作成へ進んでいるかを見る。',
    events: ['search_about_context_view', 'search_about_context_click', 'search_quick_filter_click', 'search_post_submit', 'search_post_open', 'search_empty_create_click', 'post_author_profile_open', 'ranking_view', 'ranking_cta_click'],
  },
  {
    id: 'signup',
    title: '登録導線',
    focus: '投稿・コメントしたい気持ちが登録完了まで繋がっているかを見る。',
    events: ['create_post_cta_click', 'comment_signup_cta_click', 'auth_view', 'auth_context_view', 'auth_tab_change', 'auth_success'],
  },
  {
    id: 'posting',
    title: '投稿体験',
    focus: 'プロフィール整備や入力補助が、相談投稿の作成を助けているかを見る。',
    events: ['mypage_next_action_click', 'profile_bio_prompt_apply', 'profile_update_success', 'profile_update_failed', 'post_draft_restore', 'post_draft_discard', 'post_template_apply', 'post_body_prompt_apply', 'post_reply_hint_apply', 'post_submit_success'],
  },
  {
    id: 'reply',
    title: '返信体験',
    focus: '短く返せる導線が、コメント開始と投稿に繋がっているかを見る。',
    events: ['home_reply_spotlight_click', 'home_feed_sort_deeplink', 'feed_reply_cta_click', 'comment_start_cta_click', 'comment_assist_apply', 'comment_submit_success', 'comment_success_next_action_click', 'comment_template_apply', 'comment_starter_click', 'comment_intent_restored'],
  },
  {
    id: 'resolution',
    title: '解決体験',
    focus: '返信がベストアンサー選択まで進み、成功体験になっているかを見る。',
    events: ['best_answer_select_success', 'best_answer_select_failed', 'notification_open', 'notification_comment_focus'],
  },
  {
    id: 'return',
    title: '再訪と通知',
    focus: '返信やベストアンサーの通知が、投稿詳細への再訪に繋がっているかを見る。',
    events: ['notifications_view', 'notification_open', 'notification_comment_focus', 'notifications_empty_cta_click'],
  },
  {
    id: 'official',
    title: '公式運用',
    focus: '紹介OK投稿や公開後チェックが、継続運用で使われているかを見る。',
    events: ['admin_daily_action_click', 'admin_pre_deploy_checks_copy', 'admin_sample_post_draft_open', 'admin_feature_post_x_draft_open', 'admin_feature_post_x_text_copy', 'admin_x_profile_text_copy', 'admin_public_check_open'],
  },
];

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

function buildPublicUrl(path) {
  return new URL(path, PUBLIC_APP_ORIGIN).toString();
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
  const [featurePosts, setFeaturePosts] = useState([]);
  const [copiedFeaturePostId, setCopiedFeaturePostId] = useState('');
  const [copiedAppDraftId, setCopiedAppDraftId] = useState('');
  const [copiedProfileDraftId, setCopiedProfileDraftId] = useState('');
  const [preDeployCopyState, setPreDeployCopyState] = useState('idle');
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
          featurePostsCountSnap,
          pageViewSummarySnap,
          todayPageViewSnap,
          featurePostsSnap,
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
          getCountFromServer(query(postsRef, where('allowExternalFeature', '==', true))),
          getDoc(pageViewSummaryRef),
          getDoc(todayPageViewRef),
          getDocs(query(postsRef, where('allowExternalFeature', '==', true), limit(40))),
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
        const featureRows = featurePostsSnap.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
          .slice(0, 12);

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
            featurePosts: Number(featurePostsCountSnap.data().count ?? 0),
            totalPageViews: Number(pageViewSummarySnap.data()?.totalCount ?? 0),
            todayPageViews: Number(todayPageViewSnap.data()?.count ?? 0),
            userTrend,
            postTrend,
            commentTrend,
            pageViewTrend,
          });
          setFeaturePosts(featureRows);
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

  const copyFeaturePostXText = async (post) => {
    if (!post?.id) return;
    const payload = buildPostSharePayload(post, '', 'x');
    if ([...payload.xText].length > X_MAX_CHARS) {
      logAppEvent('admin_feature_post_x_text_copy', {
        post_id: post.id,
        has_audio: Boolean(post.audioUrl),
        worry_genre: post.worryGenre ?? 'none',
        music_genre: post.musicGenre ?? 'none',
        daw: post.daw ?? 'none',
        result: 'over_limit',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(payload.xText);
      logAppEvent('admin_feature_post_x_text_copy', {
        post_id: post.id,
        has_audio: Boolean(post.audioUrl),
        worry_genre: post.worryGenre ?? 'none',
        music_genre: post.musicGenre ?? 'none',
        daw: post.daw ?? 'none',
        result: 'copied',
      });
      setCopiedFeaturePostId(post.id);
      window.setTimeout(() => {
        setCopiedFeaturePostId((current) => (current === post.id ? '' : current));
      }, 1800);
    } catch (err) {
      console.error(err);
      logAppEvent('admin_feature_post_x_text_copy', {
        post_id: post.id,
        has_audio: Boolean(post.audioUrl),
        worry_genre: post.worryGenre ?? 'none',
        music_genre: post.musicGenre ?? 'none',
        daw: post.daw ?? 'none',
        result: 'failed',
      });
      setXDraftError('紹介文のコピーに失敗しました。');
    }
  };

  const openFeaturePostXDraft = (post) => {
    if (!post?.id) return;

    const payload = buildPostSharePayload(post, '', 'x');
    if ([...payload.xText].length > X_MAX_CHARS) {
      logAppEvent('admin_feature_post_x_draft_open', {
        post_id: post.id,
        has_audio: Boolean(post.audioUrl),
        worry_genre: post.worryGenre ?? 'none',
        music_genre: post.musicGenre ?? 'none',
        daw: post.daw ?? 'none',
        result: 'over_limit',
      });
      return;
    }
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(payload.xText)}`;
    window.open(intentUrl, '_blank', 'noopener,noreferrer');
    logAppEvent('admin_feature_post_x_draft_open', {
      post_id: post.id,
      has_audio: Boolean(post.audioUrl),
      worry_genre: post.worryGenre ?? 'none',
      music_genre: post.musicGenre ?? 'none',
      daw: post.daw ?? 'none',
      result: 'opened',
    });
  };

  const buildAppIntroXText = (draft) => {
    const url = new URL(draft.path || '/', PUBLIC_APP_ORIGIN);
    url.searchParams.set('utm_source', 'x');
    url.searchParams.set('utm_medium', 'social');
    url.searchParams.set('utm_campaign', 'app_intro');
    url.searchParams.set('utm_content', draft.id);

    return [
      ...draft.lines,
      '',
      url.toString(),
      '',
      '#DTM #DTMer',
    ].join('\n');
  };

  const copyAppIntroXText = async (draft) => {
    const xText = buildAppIntroXText(draft);
    if ([...xText].length > X_MAX_CHARS) {
      logAppEvent('admin_app_intro_x_text_copy', {
        draft_id: draft.id,
        result: 'over_limit',
      });
      setXDraftError('Sound.back紹介文が280字を超えています。文面を短くしてください。');
      return;
    }

    try {
      await navigator.clipboard.writeText(xText);
      logAppEvent('admin_app_intro_x_text_copy', {
        draft_id: draft.id,
        result: 'copied',
      });
      setCopiedAppDraftId(draft.id);
      window.setTimeout(() => {
        setCopiedAppDraftId((current) => (current === draft.id ? '' : current));
      }, 1800);
    } catch (err) {
      console.error(err);
      logAppEvent('admin_app_intro_x_text_copy', {
        draft_id: draft.id,
        result: 'failed',
      });
      setXDraftError('Sound.back紹介文のコピーに失敗しました。');
    }
  };

  const openAppIntroXDraft = (draft) => {
    const xText = buildAppIntroXText(draft);
    if ([...xText].length > X_MAX_CHARS) {
      logAppEvent('admin_app_intro_x_draft_open', {
        draft_id: draft.id,
        result: 'over_limit',
      });
      setXDraftError('Sound.back紹介文が280字を超えているため、X下書きを開きませんでした。');
      return;
    }

    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(xText)}`;
    window.open(intentUrl, '_blank', 'noopener,noreferrer');
    logAppEvent('admin_app_intro_x_draft_open', {
      draft_id: draft.id,
      result: 'opened',
    });
  };

  const openSamplePostDraft = (draft) => {
    const params = new URLSearchParams({
      sample: draft.id,
      source: 'admin_sample',
    });
    logAppEvent('admin_sample_post_draft_open', {
      sample_id: draft.id,
      worry_genre: draft.worryGenre,
      music_genre: draft.musicGenre,
      daw: draft.daw,
    });
    navigate(`/create?${params.toString()}`);
  };

  const openPublicCheckLink = (item) => {
    window.open(buildPublicUrl(item.path), '_blank', 'noopener,noreferrer');
    logAppEvent('admin_public_check_open', {
      target: item.id,
    });
  };

  const copyPreDeployChecks = async () => {
    try {
      await navigator.clipboard.writeText(PRE_DEPLOY_CHECK_COMMANDS.join('\n'));
      setPreDeployCopyState('copied');
      logAppEvent('admin_pre_deploy_checks_copy', {
        result: 'copied',
        command_count: PRE_DEPLOY_CHECK_COMMANDS.length,
      });
      window.setTimeout(() => setPreDeployCopyState('idle'), 1800);
    } catch (err) {
      console.error(err);
      setPreDeployCopyState('failed');
      logAppEvent('admin_pre_deploy_checks_copy', {
        result: 'failed',
        command_count: PRE_DEPLOY_CHECK_COMMANDS.length,
      });
      window.setTimeout(() => setPreDeployCopyState('idle'), 1800);
    }
  };

  const copyProfileDraftText = async (draft) => {
    const charCount = [...draft.text].length;
    if (charCount > draft.maxChars) {
      logAppEvent('admin_x_profile_text_copy', {
        draft_id: draft.id,
        result: 'over_limit',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(draft.text);
      logAppEvent('admin_x_profile_text_copy', {
        draft_id: draft.id,
        result: 'copied',
      });
      setCopiedProfileDraftId(draft.id);
      window.setTimeout(() => {
        setCopiedProfileDraftId((current) => (current === draft.id ? '' : current));
      }, 1800);
    } catch (err) {
      console.error(err);
      logAppEvent('admin_x_profile_text_copy', {
        draft_id: draft.id,
        result: 'failed',
      });
      setXDraftError('Xプロフィール素材のコピーに失敗しました。');
    }
  };

  const handleDailyActionClick = (item) => {
    logAppEvent('admin_daily_action_click', {
      action_id: item.id,
      action_type: item.actionType,
      target_id: item.targetId,
    });

    if (item.actionType === 'public_check') {
      const target = PUBLIC_CHECK_LINKS.find((link) => link.id === item.targetId);
      if (target) openPublicCheckLink(target);
      return;
    }

    if (item.actionType === 'sample') {
      const draft = SAMPLE_POST_DRAFTS.find((sample) => sample.id === item.targetId);
      if (draft) openSamplePostDraft(draft);
      return;
    }

    if (item.actionType === 'app_intro') {
      const draft = APP_INTRO_DRAFTS.find((intro) => intro.id === item.targetId);
      if (draft) openAppIntroXDraft(draft);
      return;
    }

    if (item.actionType === 'scroll') {
      document.getElementById(`admin-${item.targetId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
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
                <MetricCard label="公式紹介OK" value={`${stats.featurePosts}件`} sublabel="外部紹介候補" />
              </div>
            </section>

            <section className="admin-section">
              <h2 className="admin-section__title">公開後チェック</h2>
              <div className="admin-pre-deploy-check">
                <div>
                  <h3>公開前に走らせるコマンド</h3>
                  <p>公開前は公開資材 / lint / build / Firestore rules dry-run をまとめて通してから進めます。</p>
                  <code>{PRE_DEPLOY_CHECK_COMMANDS.join(' && ')}</code>
                </div>
                <button type="button" onClick={copyPreDeployChecks}>
                  {preDeployCopyState === 'copied'
                    ? 'コピー済み'
                    : preDeployCopyState === 'failed'
                      ? 'コピー失敗'
                      : 'コマンドコピー'}
                </button>
              </div>
              <div className="admin-public-check">
                <div>
                  <h3>外部表示の確認</h3>
                  <p>デプロイ後、Xカードや検索向けファイルが公開URLで開けるか確認します。</p>
                </div>
                <div className="admin-public-check__links">
                  {PUBLIC_CHECK_LINKS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openPublicCheckLink(item)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="admin-section">
              <h2 className="admin-section__title">今日の運用順</h2>
              <div className="admin-daily-action-list">
                {DAILY_GROWTH_ACTIONS.map((item) => (
                  <article className="admin-daily-action-card" key={item.id}>
                    <span className="admin-daily-action-card__step">{item.label}</span>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </div>
                    <button type="button" onClick={() => handleDailyActionClick(item)}>
                      {item.actionLabel}
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className="admin-section" id="admin-growth_guide">
              <h2 className="admin-section__title">成長施策 計測ガイド</h2>
              <div className="admin-growth-guide">
                {GROWTH_MEASUREMENT_CARDS.map((item) => (
                  <article className="admin-growth-card" key={item.id}>
                    <h3>{item.title}</h3>
                    <p>{item.focus}</p>
                    <div className="admin-growth-card__events" aria-label={`${item.title}の確認イベント`}>
                      {item.events.map((eventName) => (
                        <code key={`${item.id}-${eventName}`}>{eventName}</code>
                      ))}
                    </div>
                  </article>
                ))}
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

            <section className="admin-section" id="admin-app_intro">
              <h2 className="admin-section__title">Sound.back紹介投稿</h2>
              <div className="admin-app-intro-list">
                {APP_INTRO_DRAFTS.map((draft) => {
                  const xText = buildAppIntroXText(draft);
                  const xCharCount = [...xText].length;
                  const isOverLimit = xCharCount > X_MAX_CHARS;

                  return (
                    <article className={`admin-app-intro-card ${isOverLimit ? 'is-over-limit' : ''}`} key={draft.id}>
                      <div>
                        <h3>{draft.label}</h3>
                        <p>{draft.description}</p>
                      </div>
                      <p className="admin-app-intro-card__body">{xText}</p>
                      <div className="admin-app-intro-card__meta">
                        <span>{xCharCount}/{X_MAX_CHARS}字</span>
                        {isOverLimit && <strong>280字を超えています</strong>}
                      </div>
                      <div className="admin-app-intro-card__actions">
                        <button
                          type="button"
                          onClick={() => copyAppIntroXText(draft)}
                          disabled={isOverLimit}
                        >
                          {copiedAppDraftId === draft.id ? 'コピー済み' : 'X文コピー'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openAppIntroXDraft(draft)}
                          disabled={isOverLimit}
                        >
                          X下書き
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="admin-section">
              <h2 className="admin-section__title">運営サンプル相談</h2>
              <div className="admin-sample-list">
                {SAMPLE_POST_DRAFTS.map((draft) => (
                  <article className="admin-sample-card" key={draft.id}>
                    <div>
                      <p className="admin-sample-card__label">{draft.label}</p>
                      <h3>{draft.title}</h3>
                      <span>{draft.description}</span>
                    </div>
                    <div className="admin-sample-card__meta">
                      <span>{draft.worryGenre}</span>
                      <span>{draft.musicGenre}</span>
                      <span>{draft.daw}</span>
                      <span>{draft.focusSecond}</span>
                    </div>
                    <button type="button" onClick={() => openSamplePostDraft(draft)}>
                      投稿作成へ
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className="admin-section" id="admin-x_profile">
              <h2 className="admin-section__title">Xプロフィール素材</h2>
              <div className="admin-profile-draft-list">
                {X_PROFILE_DRAFTS.map((draft) => {
                  const charCount = [...draft.text].length;
                  const isOverLimit = charCount > draft.maxChars;

                  return (
                    <article className={`admin-profile-draft-card ${isOverLimit ? 'is-over-limit' : ''}`} key={draft.id}>
                      <div className="admin-profile-draft-card__head">
                        <h3>{draft.label}</h3>
                        <span>{charCount}/{draft.maxChars}字</span>
                      </div>
                      <p className="admin-profile-draft-card__body">{draft.text}</p>
                      {isOverLimit && <strong className="admin-profile-draft-card__warning">制限文字数を超えています</strong>}
                      <button
                        type="button"
                        onClick={() => copyProfileDraftText(draft)}
                        disabled={isOverLimit}
                      >
                        {copiedProfileDraftId === draft.id ? 'コピー済み' : 'コピー'}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="admin-section">
              <h2 className="admin-section__title">公式紹介OK投稿</h2>
              {featurePosts.length === 0 && <p className="admin-state">紹介許可済みの投稿はまだありません。</p>}

              {featurePosts.length > 0 && (
                <div className="admin-feature-list">
                  {featurePosts.map((post) => {
                    const payload = buildPostSharePayload(post, '', 'x');
                    const xCharCount = [...payload.xText].length;
                    const isOverLimit = xCharCount > X_MAX_CHARS;

                    return (
                      <article className={`admin-feature-card ${isOverLimit ? 'is-over-limit' : ''}`} key={post.id}>
                        <div className="admin-feature-card__head">
                          <h3>{post.title || 'タイトルなし'}</h3>
                          <div className="admin-feature-card__actions">
                            <button
                              type="button"
                              onClick={() => copyFeaturePostXText(post)}
                              disabled={isOverLimit}
                            >
                              {copiedFeaturePostId === post.id ? 'コピー済み' : 'X文コピー'}
                            </button>
                            <button
                              type="button"
                              onClick={() => openFeaturePostXDraft(post)}
                              disabled={isOverLimit}
                            >
                              X下書き
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate(`/post/${post.id}`)}
                            >
                              投稿を開く
                            </button>
                          </div>
                        </div>
                        <p className="admin-feature-card__body">{post.body || '-'}</p>
                        <div className="admin-feature-card__limit">
                          <span>{xCharCount}/{X_MAX_CHARS}字</span>
                          {isOverLimit && <strong>280字を超えています</strong>}
                        </div>
                        <div className="admin-feature-card__meta">
                          <span>{post.authorDisplayName || 'ユーザー'}</span>
                          <span>{formatUpdatedAt(post.createdAt)}</span>
                          {post.worryGenre && <span>{post.worryGenre}</span>}
                          {post.musicGenre && <span>{post.musicGenre}</span>}
                          {post.daw && <span>{post.daw}</span>}
                          {post.audioUrl && <span>音源あり</span>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
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
