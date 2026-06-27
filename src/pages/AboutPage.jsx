import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logAppEvent } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { buildAuthPath } from '../utils/authLinks';
import { BottomNav } from '../components/BottomNav';
import './AboutPage.css';

const PUBLIC_APP_ORIGIN = (() => {
  try {
    return new URL(import.meta.env?.VITE_PUBLIC_APP_URL || 'https://sound-fix-ecfcf.web.app').origin;
  } catch {
    return 'https://sound-fix-ecfcf.web.app';
  }
})();

function buildAboutUrl(channel = 'share') {
  const url = new URL('/about', PUBLIC_APP_ORIGIN);
  url.searchParams.set('utm_source', channel === 'x' ? 'x' : 'app_share');
  url.searchParams.set('utm_medium', channel === 'x' ? 'social' : 'share');
  url.searchParams.set('utm_campaign', 'about_page');
  url.searchParams.set('utm_content', 'about');
  return url.toString();
}

function buildAboutXText() {
  return [
    '曲作りで、どこを直せばいいか迷う時に。',
    '',
    'Sound.backは、音源つきで制作の悩みを相談できる場所です。',
    '見るだけ、短く返すだけでもOK。',
    '',
    buildAboutUrl('x'),
    '',
    '#DTM #DTMer',
  ].join('\n');
}

export function AboutPage() {
  const navigate = useNavigate();
  const { firebaseUser } = useAuth();
  const [copyState, setCopyState] = useState('idle');

  const handleCreateClick = (surface) => {
    logAppEvent('about_cta_click', {
      action: 'create',
      surface,
      signed_in: Boolean(firebaseUser),
    });

    navigate(firebaseUser ? '/create' : buildAuthPath({ returnTo: '/create' }), {
      state: firebaseUser
        ? undefined
        : { message: '投稿するには無料登録が必要です。', returnTo: '/create' },
    });
  };

  const handleBrowseClick = (surface) => {
    logAppEvent('about_cta_click', {
      action: 'browse',
      surface,
      signed_in: Boolean(firebaseUser),
    });
    navigate('/?sort=unanswered&source=about');
  };

  const handleSearchClick = (surface) => {
    logAppEvent('about_cta_click', {
      action: 'search',
      surface,
      signed_in: Boolean(firebaseUser),
    });
    navigate('/search?source=about');
  };

  const handleShareOnX = () => {
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(buildAboutXText())}`;
    window.open(intentUrl, '_blank', 'noopener,noreferrer');
    logAppEvent('about_share_click', {
      channel: 'x',
      result: 'opened',
    });
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(buildAboutUrl('share'));
      setCopyState('copied');
      logAppEvent('about_share_click', {
        channel: 'copy',
        result: 'copied',
      });
      window.setTimeout(() => setCopyState('idle'), 1800);
    } catch {
      setCopyState('failed');
      logAppEvent('about_share_click', {
        channel: 'copy',
        result: 'failed',
      });
      window.setTimeout(() => setCopyState('idle'), 1800);
    }
  };

  return (
    <div className="about-page">
      <header className="about-header">
        <button className="about-back-btn" onClick={() => navigate('/')}>
          ← ホーム
        </button>
        <h1 className="about-logo" aria-label="Sound.back">
          <span>Sound</span>
          <b>.</b>
          <span>back</span>
        </h1>
      </header>

      <main className="about-main">
        <section className="about-hero">
          <p className="about-eyebrow">音楽制作の相談場所</p>
          <h2>曲の悩みを、音で相談する。</h2>
          <p>
            Sound.backは、ミックス、AI作曲、DAW操作、アレンジなどのつまずきを、
            音源や気になる秒数と一緒に投稿できる場所です。
          </p>
          <div className="about-actions">
            <button type="button" onClick={() => handleCreateClick('hero')}>
              相談を投稿
            </button>
            <button type="button" className="about-actions__secondary" onClick={() => handleBrowseClick('hero')}>
              返信募集中を見る
            </button>
          </div>
        </section>

        <section className="about-next" aria-label="Sound.backで最初にやること">
          <article>
            <p>自分の曲で迷っている</p>
            <h3>音源つきで相談する</h3>
            <span>気になる秒数やDAWを書いておくと、返信する人が聴きどころを掴みやすくなります。</span>
            <button type="button" onClick={() => handleCreateClick('next_create')}>
              相談を投稿
            </button>
          </article>
          <article>
            <p>まず参加してみたい</p>
            <h3>未返信の相談に返す</h3>
            <span>良い点、気になった箇所、確認したいことだけでも投稿者の判断材料になります。</span>
            <button type="button" onClick={() => handleBrowseClick('next_browse')}>
              返信募集中を見る
            </button>
          </article>
          <article>
            <p>近い悩みを見たい</p>
            <h3>投稿を検索する</h3>
            <span>ミックス、AI作曲、DAW名、ジャンルなどから自分に近い相談を探せます。</span>
            <button type="button" onClick={() => handleSearchClick('next_search')}>
              悩みを探す
            </button>
          </article>
        </section>

        <section className="about-examples" aria-label="投稿と返信の例">
          <div className="about-section-heading">
            <p>最初の一歩の例</p>
            <h2>長文じゃなくても、相談できます。</h2>
          </div>
          <div className="about-examples__grid">
            <article>
              <span>相談例</span>
              <h3>0:48からサビ前が急に薄く聴こえます</h3>
              <p>
                ジャンルはJ-pop寄り、DAWはLogicです。ボーカルを前に出したいのですが、
                低音を下げると全体が軽くなります。
              </p>
            </article>
            <article>
              <span>返信例</span>
              <h3>0:48の直前だけベースを少し整理してみたいです</h3>
              <p>
                良い所はボーカルの抜けです。気になるのはキックとベースの重なりなので、
                サビ前だけEQかサイドチェインを試すと判断しやすそうです。
              </p>
            </article>
          </div>
          <div className="about-examples__actions">
            <button type="button" onClick={() => handleCreateClick('example_create')}>
              この形で相談する
            </button>
            <button type="button" onClick={() => handleBrowseClick('example_browse')}>
              返せそうな相談を見る
            </button>
          </div>
        </section>

        <section className="about-flow" aria-label="Sound.backの流れ">
          <article>
            <span>1</span>
            <h3>悩みを音源つきで投稿</h3>
            <p>タイトル、聴いてほしい所、気になる秒数を添えると返しやすくなります。</p>
          </article>
          <article>
            <span>2</span>
            <h3>短く返信する</h3>
            <p>良い点、気になった秒数、確認したいことだけでも投稿者の判断材料になります。</p>
          </article>
          <article>
            <span>3</span>
            <h3>ベストアンサーで残す</h3>
            <p>役に立った返信を選べるので、同じ悩みの人もあとから見つけやすくなります。</p>
          </article>
        </section>

        <section className="about-trust" aria-label="安心して使うために">
          <div className="about-section-heading">
            <p>安心して使うために</p>
            <h2>外に出す前提ではなく、まず相談の場として使えます。</h2>
          </div>
          <div className="about-trust__grid">
            <article>
              <h3>外部紹介は自分で選べます</h3>
              <p>公式Xなどで紹介されてもよい投稿だけ、投稿作成時にチェックできます。</p>
            </article>
            <article>
              <h3>短い返信でも参加できます</h3>
              <p>長文レビューでなくても、良い点や気になった秒数を返すだけで十分です。</p>
            </article>
            <article>
              <h3>未完成でも相談できます</h3>
              <p>作りかけのラフ、AI曲の手直し、ミックス途中の迷いも投稿できます。</p>
            </article>
          </div>
        </section>

        <section className="about-use-cases" aria-label="相談しやすい悩み">
          <h2>こんな時に使えます</h2>
          <ul>
            <li>ボーカルが埋もれる、低音が膨らむなどミックスで迷う時</li>
            <li>AIで作った曲の展開やメロディを自然に直したい時</li>
            <li>DAW操作や音作りで、どこから直せばいいか分からない時</li>
            <li>アレンジが単調で、次の一手を探したい時</li>
          </ul>
        </section>

        <section className="about-faq" aria-label="よくある質問">
          <h2>よくある質問</h2>
          <div className="about-faq__list">
            <article>
              <h3>無料で使えますか？</h3>
              <p>現在は無料で投稿や返信ができます。投稿やコメントには無料登録が必要です。</p>
            </article>
            <article>
              <h3>どんな音源を投稿できますか？</h3>
              <p>ミックス途中、AI曲の手直し、アレンジ案など、相談したい短い音源を添えられます。</p>
            </article>
            <article>
              <h3>投稿は勝手に外部紹介されますか？</h3>
              <p>公式Xなどで紹介されてもよい投稿だけ、投稿作成時に自分で選べます。</p>
            </article>
            <article>
              <h3>返信は詳しく書く必要がありますか？</h3>
              <p>良い点、気になる秒数、確認したいことだけでも参加できます。</p>
            </article>
          </div>
        </section>

        <section className="about-share" aria-label="Sound.backを共有">
          <div>
            <h2>DTM仲間に共有する</h2>
            <p>相談する人と短く返す人が増えるほど、Sound.backは使いやすくなります。</p>
          </div>
          <div className="about-share__actions">
            <button type="button" onClick={handleShareOnX}>
              X下書き
            </button>
            <button type="button" onClick={handleCopyUrl}>
              {copyState === 'copied' ? 'コピー済み' : copyState === 'failed' ? 'コピー失敗' : 'URLコピー'}
            </button>
          </div>
        </section>
      </main>

      <BottomNav active="" />
    </div>
  );
}
