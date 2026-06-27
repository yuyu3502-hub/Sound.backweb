import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, logAppEvent } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { getAcquisitionRecord } from '../utils/acquisition';
import './AuthPage.css';

function getAuthErrorMessage(code, mode = 'login') {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'メールアドレスまたはパスワードが正しくありません。';
    case 'auth/invalid-email':
      return 'メールアドレスの形式が正しくありません。';
    case 'auth/too-many-requests':
      return '試行回数が多すぎます。しばらく待ってから再度お試しください。';
    case 'auth/network-request-failed':
      return 'ネットワークエラーです。接続を確認してください。';
    case 'auth/operation-not-allowed':
      return 'Email/Password 認証が無効です。Firebase Consoleで有効化してください。';
    case 'auth/email-already-in-use':
      return 'このメールアドレスはすでに登録されています。';
    case 'auth/weak-password':
      return 'パスワードが弱すぎます。8文字以上を推奨します。';
    default:
      return mode === 'register'
        ? '新規登録に失敗しました。もう一度お試しください。'
        : 'ログインに失敗しました。入力内容をご確認ください。';
  }
}

// ランダムなユーザーIDを生成（8文字英数字）
function generateUserId() {
  return Math.random().toString(36).slice(2, 10);
}

function normalizeReturnTo(value) {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/auth')) return '/';
  return value;
}

function getReturnToType(returnTo) {
  if (returnTo === '/create') return 'create_post';
  if (/^\/post\/[^/]+/.test(returnTo) && returnTo.includes('comment=1')) return 'post_comment';
  if (/^\/post\/[^/]+/.test(returnTo)) return 'post_detail';
  return returnTo === '/' ? 'home' : 'internal';
}

function getReturnMessage(returnToType) {
  if (returnToType === 'create_post') {
    return '登録後、投稿作成画面に戻ってそのまま相談を書けます。';
  }
  if (returnToType === 'post_comment') {
    return '登録後、この投稿に戻ってそのままコメントできます。';
  }
  if (returnToType === 'post_detail') {
    return '登録後、この投稿に戻って続きを見られます。';
  }
  return '登録後、さっきの画面に戻って続きができます。';
}

function buildAuthContext(returnToType, locationSearch = '') {
  const params = new URLSearchParams(locationSearch);
  const acquisition = getAcquisitionRecord();
  const campaign = params.get('utm_campaign') || acquisition?.campaign || 'none';

  if (returnToType === 'post_comment') {
    return {
      id: 'comment',
      title: 'コメントする準備だけ済ませます',
      body: '登録後は元の投稿に戻ります。良い点、気になった秒数、確認したいことを短く返せます。',
      steps: ['元の相談投稿へ戻る', 'コメント欄が開く', '返信やベストアンサー通知を受け取れる'],
      campaign,
    };
  }

  if (returnToType === 'create_post') {
    return {
      id: 'create',
      title: '相談投稿の続きに戻ります',
      body: '登録後は投稿作成画面へ戻ります。タイトル、気になる秒数、聴いてほしい所を入れて相談できます。',
      steps: ['投稿作成画面へ戻る', 'テンプレートで相談を書ける', '返信やベストアンサー通知を受け取れる'],
      campaign,
    };
  }

  if (campaign === 'profile_share') {
    return {
      id: 'profile_share',
      title: 'プロフィールや投稿を見ながら参加できます',
      body: '登録すると、気になる相談への返信や自分のプロフィール共有がしやすくなります。',
      steps: ['投稿に返信できる', '自分の相談も投稿できる', 'プロフィールを整えて共有できる'],
      campaign,
    };
  }

  if (campaign === 'app_intro' || campaign === 'post_share') {
    return {
      id: 'external',
      title: '見るだけから、短い返信まで',
      body: 'Sound.backは、音源つきの制作相談に短く返せる場所です。登録後は投稿も返信もできます。',
      steps: ['近い悩みを探せる', '秒数つきで返信できる', '自分の曲も相談できる'],
      campaign,
    };
  }

  return {
    id: 'default',
    title: 'Sound.backに参加する',
    body: '音楽制作の悩みを、音源つきで相談したり、他の人の投稿に短く返信できます。',
    steps: ['投稿に返信できる', '自分の曲を相談できる', '通知で反応を受け取れる'],
    campaign,
  };
}

export function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const returnTo = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return normalizeReturnTo(location.state?.returnTo ?? params.get('returnTo'));
  }, [location.search, location.state?.returnTo]);

  const initialMode = useMemo(() => {
    const mode = new URLSearchParams(location.search).get('mode');
    return mode === 'register' ? 'register' : 'login';
  }, [location.search]);

  const [tab, setTab] = useState(initialMode); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { setUserData } = useAuth();
  const entryMessage = location.state?.message ?? '';
  const hasReturnTo = returnTo !== '/';
  const returnToType = getReturnToType(returnTo);
  const returnMessage = getReturnMessage(returnToType);
  const authContext = useMemo(() => buildAuthContext(returnToType, location.search), [location.search, returnToType]);
  const loggedAuthViewRef = useRef(false);

  useEffect(() => {
    if (loggedAuthViewRef.current) return;
    loggedAuthViewRef.current = true;
    logAppEvent('auth_view', {
      mode: initialMode,
      has_return_to: hasReturnTo,
      return_to_type: returnToType,
      context_id: authContext.id,
      campaign: authContext.campaign,
    });
  }, [authContext.campaign, authContext.id, hasReturnTo, initialMode, returnToType]);

  useEffect(() => {
    logAppEvent('auth_context_view', {
      context_id: authContext.id,
      campaign: authContext.campaign,
      return_to_type: returnToType,
      has_return_to: hasReturnTo,
    });
  }, [authContext.campaign, authContext.id, hasReturnTo, returnToType]);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setError('');
  };

  const handleTabChange = (newTab) => {
    if (newTab === tab) return;

    logAppEvent('auth_tab_change', {
      from_mode: tab,
      to_mode: newTab,
      context_id: authContext.id,
      return_to_type: returnToType,
    });
    setTab(newTab);
    resetForm();
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      logAppEvent('auth_success', {
        mode: 'login',
        has_return_to: hasReturnTo,
        return_to_type: returnToType,
        context_id: authContext.id,
        campaign: authContext.campaign,
      });
      navigate(returnTo, { replace: true });
    } catch (err) {
      console.error('Login error:', err);
      setError(getAuthErrorMessage(err?.code, 'login'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください。');
      return;
    }
    if (!displayName.trim()) {
      setError('表示名を入力してください。');
      return;
    }

    setLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const user = credential.user;

      // Firebase Auth の displayName を更新
      await updateProfile(user, { displayName: displayName.trim() });

      // Firestore に users ドキュメントを作成
      const userId = generateUserId();
      const userDoc = {
        uid: user.uid,
        userId,
        displayName: displayName.trim(),
        bio: '',
        photoUrl: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'users', user.uid), userDoc);
      setUserData(userDoc);

      logAppEvent('auth_success', {
        mode: 'register',
        has_return_to: hasReturnTo,
        return_to_type: returnToType,
        context_id: authContext.id,
        campaign: authContext.campaign,
      });
      navigate(returnTo, { replace: true });
    } catch (err) {
      console.error('Register error:', err);
      setError(getAuthErrorMessage(err?.code, 'register'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <header className="auth-header">
        <button className="auth-back-btn" onClick={() => navigate('/')}>
          ← ホームへ
        </button>
        <h1 className="auth-logo" aria-label="Sound.back">
          <span className="auth-logo-main">Sound</span>
          <span className="auth-logo-dot">.</span>
          <span className="auth-logo-sub">back</span>
        </h1>
      </header>

      <main className="auth-main">
        {entryMessage && <p className="auth-entry-message">{entryMessage}</p>}
        {hasReturnTo && (
          <p className="auth-return-message">
            {returnMessage}
          </p>
        )}

        <section className="auth-context" aria-label="登録後の流れ">
          <p className="auth-context__eyebrow">登録前に確認</p>
          <h2>{authContext.title}</h2>
          <p>{authContext.body}</p>
          <ol>
            {authContext.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        {/* タブ */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${tab === 'login' ? 'auth-tab--active' : ''}`}
            onClick={() => handleTabChange('login')}
          >
            ログイン
          </button>
          <button
            className={`auth-tab ${tab === 'register' ? 'auth-tab--active' : ''}`}
            onClick={() => handleTabChange('register')}
          >
            新規登録
          </button>
        </div>

        {/* ログインフォーム */}
        {tab === 'login' && (
          <form className="auth-form" onSubmit={handleLogin}>
            <label className="auth-label">
              メールアドレス
              <input
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label className="auth-label">
              パスワード
              <input
                className="auth-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            {error && <p className="auth-error">{error}</p>}
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        )}

        {/* 新規登録フォーム */}
        {tab === 'register' && (
          <form className="auth-form" onSubmit={handleRegister}>
            <div className="auth-benefits" aria-label="登録後にできること">
              <p>登録後すぐできます</p>
              <ul>
                {authContext.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </div>
            <label className="auth-label">
              表示名（20文字以内）
              <input
                className="auth-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 20))}
                required
                autoComplete="nickname"
              />
            </label>
            <label className="auth-label">
              メールアドレス
              <input
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label className="auth-label">
              パスワード（8文字以上）
              <input
                className="auth-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </label>
            {error && <p className="auth-error">{error}</p>}
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? '登録中...' : '新規登録'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
