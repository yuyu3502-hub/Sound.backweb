import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { HomePage } from './pages/HomePage';
import { AuthPage } from './pages/AuthPage';
import { CreatePostPage } from './pages/CreatePostPage';
import { PostDetailPage } from './pages/PostDetailPage';
import { MyPage } from './pages/MyPage';
import { ProfileEditPage } from './pages/ProfileEditPage';
import { SearchPage } from './pages/SearchPage';
import { UserPage } from './pages/UserPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { NotificationsPage } from './pages/NotificationsPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/create" element={<CreatePostPage />} />
          <Route path="/post/:postId" element={<PostDetailPage />} />
          <Route path="/mypage" element={<MyPage />} />
          <Route path="/profile/edit" element={<ProfileEditPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/users/:uid" element={<UserPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
