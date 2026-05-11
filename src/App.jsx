import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const AuthPage = lazy(() => import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })));
const CreatePostPage = lazy(() => import('./pages/CreatePostPage').then((m) => ({ default: m.CreatePostPage })));
const PostDetailPage = lazy(() => import('./pages/PostDetailPage').then((m) => ({ default: m.PostDetailPage })));
const MyPage = lazy(() => import('./pages/MyPage').then((m) => ({ default: m.MyPage })));
const ProfileEditPage = lazy(() => import('./pages/ProfileEditPage').then((m) => ({ default: m.ProfileEditPage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const UserPage = lazy(() => import('./pages/UserPage').then((m) => ({ default: m.UserPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const RankingPage = lazy(() => import('./pages/RankingPage').then((m) => ({ default: m.RankingPage })));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })));

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<div className="detail-state">読み込み中...</div>}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/create" element={<CreatePostPage />} />
            <Route path="/post/:postId/edit" element={<CreatePostPage />} />
            <Route path="/post/:postId" element={<PostDetailPage />} />
            <Route path="/mypage" element={<MyPage />} />
            <Route path="/profile/edit" element={<ProfileEditPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/ranking" element={<RankingPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/users/:uid" element={<UserPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
