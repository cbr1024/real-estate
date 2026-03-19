import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../stores/useAuthStore';
import useCompareStore from '../../stores/useCompareStore';
import { getMe, logout as logoutApi } from '../../api/auth';
import SearchBar from './SearchBar';

export default function Header() {
  const { isAuthenticated, user, login, logout } = useAuthStore();
  const compareCount = useCompareStore((s) => s.apartments.length);
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      getMe()
        .then((data) => {
          login(data.user);
          // DB에 저장된 위치가 있으면 localStorage에 동기화
          if (data.user.last_lat && data.user.last_lng) {
            localStorage.setItem('userLocation', JSON.stringify({
              lat: data.user.last_lat,
              lng: data.user.last_lng,
            }));
          }
        })
        .catch(() => {});
    }
  }, []);

  // 페이지 이동 시 모바일 메뉴 닫기
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    try { await logoutApi(); } catch (_) {}
    logout();
    navigate('/');
  };

  const planName = user?.subscription?.plan_display_name || '무료';

  return (
    <header className="h-16 flex-shrink-0 z-50 relative bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 shadow-lg">
      <div className="h-full max-w-screen-2xl mx-auto px-4 flex items-center justify-between">

        {/* 로고 */}
        <Link to="/" className="flex items-center gap-2.5 flex-shrink-0 group">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-shadow">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <div className="hidden sm:block">
            <span className="text-[17px] font-extrabold text-white tracking-tight">아파트 시세</span>
            <span className="text-[10px] text-blue-400 font-medium ml-1.5 hidden lg:inline">REAL ESTATE</span>
          </div>
        </Link>

        {/* 검색바 */}
        <div className="flex-1 max-w-xl mx-4">
          <SearchBar />
        </div>

        {/* 데스크톱 네비게이션 */}
        <div className="hidden md:flex items-center gap-0.5">
          {/* 비교 */}
          <Link
            to="/compare"
            className="relative p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-all"
            title="단지 비교"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            {compareCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-purple-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-slate-900">
                {compareCount}
              </span>
            )}
          </Link>

          {/* 커뮤니티 드롭다운 */}
          <div className="relative group">
            <button className="p-2 text-slate-400 hover:text-blue-400 rounded-lg hover:bg-white/10 transition-all" title="커뮤니티">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <div className="absolute top-full right-0 mt-1 w-44 bg-slate-800 rounded-xl shadow-xl border border-slate-700 py-1.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <Link to="/community" className="block px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors">
                커뮤니티
              </Link>
              <Link to="/discussions" className="block px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors">
                투자 토론
              </Link>
              <Link to="/columns" className="block px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors">
                전문가 칼럼
              </Link>
              <Link to="/policy" className="block px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors">
                정책 발표
              </Link>
            </div>
          </div>

          {isAuthenticated ? (
            <>
              {/* 관심 */}
              <Link
                to="/favorites"
                className="p-2 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-white/10 transition-all"
                title="관심 아파트"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </Link>

              {/* 구분선 */}
              <div className="w-px h-5 bg-slate-700 mx-1.5" />

              {/* 유저 영역 */}
              <Link to="/subscription" title="구독 관리" className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-all group">
                {/* 아바타 */}
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-[11px] font-bold text-white shadow-sm">
                  {(user?.nickname || user?.email || '?')[0].toUpperCase()}
                </div>
                <div className="hidden lg:block">
                  <p className="text-[13px] font-medium text-slate-200 leading-tight group-hover:text-white transition-colors">
                    {user?.nickname || user?.email}
                  </p>
                  <p className="text-[10px] text-blue-400 font-medium leading-tight">{planName}</p>
                </div>
              </Link>

              {user?.role === 'admin' && (
                <Link
                  to="/admin"
                  className="text-[11px] text-amber-400 hover:text-amber-300 px-2 py-1 rounded-md hover:bg-amber-400/10 transition-all font-semibold"
                >
                  ADMIN
                </Link>
              )}

              <button
                onClick={handleLogout}
                className="text-[13px] text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-all"
              >
                로그아웃
              </button>
            </>
          ) : (
            <>
              <Link to="/subscription" className="text-[13px] text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition-all">
                구독
              </Link>
              <Link to="/login" className="text-[13px] text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition-all">
                로그인
              </Link>
              <Link to="/register" className="text-[13px] font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 px-4 py-1.5 rounded-lg transition-all shadow-md shadow-blue-500/20 hover:shadow-blue-500/40 ml-1">
                회원가입
              </Link>
            </>
          )}
        </div>

        {/* 모바일 햄버거 */}
        <div className="flex md:hidden items-center gap-1">
          <Link to="/compare" className="relative p-2 text-slate-400 hover:text-white transition-colors" title="단지 비교">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            {compareCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-purple-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-slate-900">
                {compareCount}
              </span>
            )}
          </Link>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-all"
          >
            {mobileMenuOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* 모바일 메뉴 드롭다운 */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-16 inset-x-0 bg-slate-900/98 backdrop-blur-lg border-t border-slate-700/50 shadow-2xl z-40">
          <div className="px-4 py-3 space-y-1">
            {isAuthenticated ? (
              <>
                {/* 유저 프로필 */}
                <div className="flex items-center gap-3 px-3 py-3 mb-2 bg-white/5 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-sm font-bold text-white">
                    {(user?.nickname || user?.email || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{user?.nickname || user?.email}</p>
                    <p className="text-xs text-blue-400 font-medium">{planName} 플랜</p>
                  </div>
                </div>

                <Link to="/favorites" className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  관심 아파트
                </Link>
                <Link to="/community" className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  커뮤니티
                </Link>
                <Link to="/discussions" className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  투자 토론
                </Link>
                <Link to="/columns" className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  전문가 칼럼
                </Link>
                <Link to="/policy" className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                  </svg>
                  정책 발표
                </Link>
                <Link to="/subscription" className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  구독 관리
                </Link>
                {user?.role === 'admin' && (
                  <Link to="/admin" className="flex items-center gap-3 px-3 py-2.5 text-sm text-amber-400 hover:text-amber-300 hover:bg-amber-400/5 rounded-lg transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    관리자
                  </Link>
                )}
                <div className="border-t border-slate-700/50 my-1" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  로그아웃
                </button>
              </>
            ) : (
              <>
                <Link to="/community" className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  커뮤니티
                </Link>
                <Link to="/discussions" className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  투자 토론
                </Link>
                <Link to="/columns" className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  전문가 칼럼
                </Link>
                <Link to="/policy" className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                  </svg>
                  정책 발표
                </Link>
                <Link to="/subscription" className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  구독
                </Link>
                <Link to="/login" className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  로그인
                </Link>
                <Link to="/register" className="block text-center text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2.5 rounded-lg mt-2">
                  회원가입
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
