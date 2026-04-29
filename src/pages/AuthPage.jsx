import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
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

export function AuthPage() {
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { setUserData } = useAuth();

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setError('');
  };

  const handleTabChange = (newTab) => {
    setTab(newTab);
    resetForm();
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
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
        email: user.email,
        displayName: displayName.trim(),
        bio: '',
        photoUrl: null,
        // --- 将来機能用フィールド ---
        role: 'user',              // 'user' | 'responder'
        responderStatus: 0,        // 0=一般, 1=lv1, 2=lv2, 3=lv3
        answerCount: 0,            // 回答数（ランクアップ条件）
        likeReceivedCount: 0,      // いいね獲得数（ランクアップ条件）
        isPremium: false,          // サブスク加入フラグ
        boostUntil: null,          // 優先表示期限（Timestamp or null）
        totalEarnings: 0,          // 累計報酬額（分配機能用）
        // ---------------------------
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'users', user.uid), userDoc);
      setUserData(userDoc);

      navigate('/');
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
