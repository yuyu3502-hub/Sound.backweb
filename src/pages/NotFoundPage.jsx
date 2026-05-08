import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import './NotFoundPage.css';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="not-found-page">
      <main className="not-found-main">
        <p className="not-found-code">404</p>
        <h1 className="not-found-title">ページが見つかりません</h1>
        <p className="not-found-text">
          URLが間違っているか、ページが移動した可能性があります。
        </p>
        <div className="not-found-actions">
          <button className="not-found-btn" onClick={() => navigate('/')}>
            ホームへ戻る
          </button>
          <button className="not-found-btn not-found-btn--ghost" onClick={() => navigate('/search')}>
            検索へ
          </button>
        </div>
      </main>
      <BottomNav active="" />
    </div>
  );
}
