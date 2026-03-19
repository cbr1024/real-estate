import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Common/Header';
import client from './api/client';
import MapPage from './pages/MapPage';
import DetailPage from './pages/DetailPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import FavoritesPage from './pages/FavoritesPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import FindEmailPage from './pages/FindEmailPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import SubscriptionPage from './pages/SubscriptionPage';
import AdminPage from './pages/AdminPage';
import OAuthCallbackPage from './pages/OAuthCallbackPage';
import ComparePage from './pages/ComparePage';
import PolicyPage from './pages/PolicyPage';
import CommunityPage from './pages/CommunityPage';
import CommunityDetailPage from './pages/CommunityDetailPage';
import DiscussionsPage from './pages/DiscussionsPage';
import ColumnsPage from './pages/ColumnsPage';
import AuctionPage from './pages/AuctionPage';
import CommercialPage from './pages/CommercialPage';

function App() {
  useEffect(() => {
    // 세션당 1회 방문 기록
    if (!sessionStorage.getItem('visited')) {
      client.post('/visit', {}).catch(() => {});
      sessionStorage.setItem('visited', '1');
    }
  }, []);

  return (
    <div className="flex flex-col h-full min-h-screen bg-white">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/apartment/:id" element={<DetailPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/find-id" element={<FindEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/subscription" element={<SubscriptionPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/policy" element={<PolicyPage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/community/:id" element={<CommunityDetailPage />} />
          <Route path="/discussions" element={<DiscussionsPage />} />
          <Route path="/columns" element={<ColumnsPage />} />
          <Route path="/auctions" element={<AuctionPage />} />
          <Route path="/commercial" element={<CommercialPage />} />
          <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
