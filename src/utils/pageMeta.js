const PUBLIC_APP_ORIGIN = (() => {
  try {
    return new URL(import.meta.env?.VITE_PUBLIC_APP_URL || 'https://sound-fix-ecfcf.web.app').origin;
  } catch {
    return 'https://sound-fix-ecfcf.web.app';
  }
})();

const DEFAULT_META = {
  title: 'Sound.back | 音楽制作の悩みを音で相談',
  description: 'Sound.backは、ミックス、AI作曲、DAW操作など音楽制作の悩みを音源つきで相談できるコミュニティです。',
  path: '/',
};

const ABOUT_FAQ_ITEMS = [
  {
    question: '無料で使えますか？',
    answer: '現在は無料で投稿や返信ができます。投稿やコメントには無料登録が必要です。',
  },
  {
    question: 'どんな音源を投稿できますか？',
    answer: 'ミックス途中、AI曲の手直し、アレンジ案など、相談したい短い音源を添えられます。',
  },
  {
    question: '投稿は勝手に外部紹介されますか？',
    answer: '公式Xなどで紹介されてもよい投稿だけ、投稿作成時に自分で選べます。',
  },
  {
    question: '返信は詳しく書く必要がありますか？',
    answer: '良い点、気になる秒数、確認したいことだけでも参加できます。',
  },
];

export function resolveRouteMeta(pathname = '/') {
  if (pathname === '/about') {
    return {
      title: 'Sound.backとは | 曲の悩みを音で相談',
      description: 'Sound.backの使い方、相談の流れ、ミックスやAI作曲などで相談しやすい悩みをまとめた説明ページです。',
      path: '/about',
    };
  }

  if (pathname === '/search') {
    return {
      title: '悩みを探す | Sound.back',
      description: 'ミックス、AI作曲、DAW操作、アレンジなど、自分に近い音楽制作の相談を探せます。',
      path: '/search',
    };
  }

  if (pathname === '/library') {
    return {
      title: '制作悩みライブラリ | Sound.back',
      description: 'Redditなどで繰り返し出るDTMの悩みを、ミックス、作曲、DAW、AI作曲などのカテゴリで探せます。',
      path: '/library',
    };
  }

  if (pathname === '/ranking') {
    return {
      title: 'ランキング | Sound.back',
      description: 'Sound.backで反応の多い投稿や返信募集中の音楽制作相談を見つけられます。',
      path: '/ranking',
    };
  }

  if (pathname === '/create') {
    return {
      title: '相談を投稿 | Sound.back',
      description: '曲の気になる秒数、DAW、ジャンル、音源を添えて、音楽制作の悩みを相談できます。',
      path: '/create',
    };
  }

  if (pathname === '/auth') {
    return {
      title: 'ログイン・登録 | Sound.back',
      description: 'Sound.backに登録して、音源つきの制作相談や返信に参加できます。',
      path: '/auth',
    };
  }

  if (pathname.startsWith('/post/')) {
    return {
      title: '制作相談 | Sound.back',
      description: 'Sound.backの音源つき制作相談です。気になる秒数や悩みに対して返信できます。',
      path: pathname,
    };
  }

  if (pathname.startsWith('/users/')) {
    return {
      title: 'プロフィール | Sound.back',
      description: 'Sound.backユーザーの投稿や音楽制作プロフィールを見られます。',
      path: pathname,
    };
  }

  if (pathname === '/mypage' || pathname === '/profile/edit') {
    return {
      title: 'マイページ | Sound.back',
      description: 'プロフィール、投稿、返信、共有用URLを管理できます。',
      path: pathname,
    };
  }

  if (pathname === '/notifications') {
    return {
      title: '通知 | Sound.back',
      description: '投稿への返信やベストアンサーなど、Sound.backの通知を確認できます。',
      path: '/notifications',
    };
  }

  return DEFAULT_META;
}

export function resolveRouteStructuredData(pathname = '/') {
  if (pathname === '/about') {
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: ABOUT_FAQ_ITEMS.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    };
  }

  return null;
}

function setMetaContent(selector, content) {
  const element = document.head.querySelector(selector);
  if (element) {
    element.setAttribute('content', content);
  }
}

function setCanonical(url) {
  const canonical = document.head.querySelector('link[rel="canonical"]');
  if (canonical) {
    canonical.setAttribute('href', url);
  }
}

function setRouteStructuredData(data) {
  const scriptId = 'soundback-route-structured-data';
  const existing = document.getElementById(scriptId);

  if (!data) {
    existing?.remove();
    return;
  }

  const script = existing || document.createElement('script');
  script.id = scriptId;
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);

  if (!existing) {
    document.head.appendChild(script);
  }
}

export function applyRouteMeta(pathname = '/') {
  if (typeof document === 'undefined') return DEFAULT_META;

  const meta = resolveRouteMeta(pathname);
  const structuredData = resolveRouteStructuredData(pathname);
  const url = new URL(meta.path || '/', PUBLIC_APP_ORIGIN).toString();

  document.title = meta.title;
  setCanonical(url);
  setMetaContent('meta[name="description"]', meta.description);
  setMetaContent('meta[property="og:title"]', meta.title);
  setMetaContent('meta[property="og:description"]', meta.description);
  setMetaContent('meta[property="og:url"]', url);
  setMetaContent('meta[name="twitter:title"]', meta.title);
  setMetaContent('meta[name="twitter:description"]', meta.description);
  setRouteStructuredData(structuredData);

  return {
    ...meta,
    url,
    structuredData,
  };
}
