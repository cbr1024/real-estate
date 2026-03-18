import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../../stores/useAuthStore';
import { getMe, logout as logoutApi } from '../../api/auth';
import SearchBar from './SearchBar';

export default function Header() {
  const { isAuthenticated, user, login, logout } = useAuthStore();
  const navigate = useNavigate();

  // 새로고침 시 쿠키 기반으로 로그인 상태 복원
  useEffect(() => {
    if (!isAuthenticated) {
      getMe()
        .then((data) => login(data.user))
        .catch(() => {}); // 미로그인 상태면 무시
    }
  }, []);

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch (_) {}
    logout();
    navigate('/');
  };

  return (
    <header className="bg-white border-b border-gray-200 h-16 flex-shrink-0 z-50 relative">
      <div className="h-full max-w-screen-2xl mx-auto px-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <span className="text-lg font-bold text-gray-900 hidden sm:block">
            아파트 시세
          </span>
        </Link>

        <div className="flex-1 max-w-lg mx-4">
          <SearchBar />
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isAuthenticated ? (
            <>
              <Link to="/favorites" className="p-2 text-gray-500 hover:text-primary-600 transition-colors" title="관심 아파트">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </Link>
              <span className="text-sm text-gray-600 hidden md:block">
                {user?.nickname || user?.email}
              </span>
              <button onClick={handleLogout}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                로그아웃
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                로그인
              </Link>
              <Link to="/register" className="text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 px-4 py-1.5 rounded-lg transition-colors">
                회원가입
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
