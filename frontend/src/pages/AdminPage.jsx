import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/useAuthStore';
import { getAdminStats, getUsers, updateUserSubscription, updateUserRole, getApiUsage } from '../api/admin';
import { getPlans } from '../api/subscription';

const PLAN_COLORS = {
  '무료': 'bg-gray-100 text-gray-600',
  '베이직': 'bg-blue-100 text-blue-700',
  '프로': 'bg-violet-100 text-violet-700',
};

export default function AdminPage() {
  const { user, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('users');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [page, setPage] = useState(1);
  const [apiUsage, setApiUsage] = useState(null);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'admin') {
      navigate('/');
      return;
    }
    loadData();
  }, [isAuthenticated, user, navigate, page, search, planFilter]);

  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    if (activeTab === 'api' && !apiUsage && !apiError) {
      getApiUsage()
        .then(setApiUsage)
        .catch(() => setApiError(true));
    }
  }, [activeTab]);

  const loadData = async () => {
    try {
      const [statsData, usersData, plansData] = await Promise.all([
        page === 1 && !search && !planFilter ? getAdminStats() : Promise.resolve(stats),
        getUsers({ page, limit: 15, search, plan: planFilter }),
        plans.length ? Promise.resolve({ plans }) : getPlans(),
      ]);
      if (statsData && statsData !== stats) setStats(statsData);
      setUsers(usersData.users);
      setPagination(usersData.pagination);
      if (plansData.plans) setPlans(plansData.plans);
    } catch (err) {
      if (err.response?.status === 403) navigate('/');
      else console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanChange = async (userId, planId) => {
    try {
      await updateUserSubscription(userId, planId);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || '변경에 실패했습니다.');
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (!confirm(`이 사용자의 역할을 ${newRole}(으)로 변경하시겠습니까?`)) return;
    try {
      await updateUserRole(userId, newRole);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || '변경에 실패했습니다.');
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">관리자 대시보드</h1>
              <p className="text-sm text-slate-400">회원 관리 및 서비스 현황</p>
            </div>
          </div>

          {/* 탭 */}
          <div className="flex gap-1 mt-6">
            {[
              { key: 'users', label: '회원 관리', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
              { key: 'api', label: 'API 비용', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.key
                    ? 'bg-white text-slate-900 shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* API 비용 탭 */}
      {activeTab === 'api' && (
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          {apiUsage ? (
            <>
              {/* 월별 사용량 카드 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { key: 'maps_js', label: '지도 로드 (Dynamic Map)', color: 'blue' },
                  { key: 'geocode', label: '지오코딩 (Geocoding)', color: 'emerald' },
                  { key: 'place_search', label: '장소 검색 (Place Search)', color: 'amber' },
                ].map(({ key, label, color }) => {
                  const s = apiUsage.stats[key];
                  const monthlyBarWidth = Math.min(100, s.monthlyPercent);
                  const dailyBarWidth = Math.min(100, s.dailyPercent);
                  const isWarning = s.monthlyPercent >= 70;
                  const isDanger = s.monthlyPercent >= 90;

                  return (
                    <div key={key} className={`bg-white rounded-xl border p-5 ${isDanger ? 'border-red-300' : isWarning ? 'border-amber-300' : 'border-gray-200'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
                        {isDanger && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">위험</span>}
                        {isWarning && !isDanger && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">주의</span>}
                      </div>

                      {/* 월별 */}
                      <div className="mb-4">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>월간</span>
                          <span>{s.monthly.toLocaleString()} / {s.monthlyLimit.toLocaleString()}</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isDanger ? 'bg-red-500' : isWarning ? 'bg-amber-500' : `bg-${color}-500`
                            }`}
                            style={{ width: `${monthlyBarWidth}%` }}
                          />
                        </div>
                        <p className="text-right text-xs text-gray-400 mt-0.5">{s.monthlyPercent}%</p>
                      </div>

                      {/* 일별 */}
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>오늘</span>
                          <span>{s.daily.toLocaleString()} / {s.dailyLimit.toLocaleString()}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full bg-${color}-400`}
                            style={{ width: `${dailyBarWidth}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 7일 추이 테이블 */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200">
                  <h3 className="text-sm font-bold text-gray-900">최근 7일 API 호출 추이</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">날짜</th>
                        <th className="text-right px-4 py-2.5 font-medium text-blue-600">지도 로드</th>
                        <th className="text-right px-4 py-2.5 font-medium text-emerald-600">지오코딩</th>
                        <th className="text-right px-4 py-2.5 font-medium text-amber-600">장소 검색</th>
                        <th className="text-right px-4 py-2.5 font-medium text-gray-600">합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiUsage.dailyHistory.map((day) => {
                        const total = day.maps_js + day.geocode + day.place_search;
                        return (
                          <tr key={day.date} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-gray-900 font-medium">{day.date}</td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{day.maps_js.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{day.geocode.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{day.place_search.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{total.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 비용 안내 */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                <h3 className="text-sm font-bold text-blue-900 mb-2">네이버 NCP 무료 한도 안내</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>Dynamic Map: 월 600만 로드 무료 (초과 시 0.3원/건)</li>
                  <li>Geocoding: 월 3만건 무료 (초과 시 5원/건)</li>
                  <li>Place Search: 월 2.5만건 무료 (초과 시 5원/건)</li>
                </ul>
                <p className="text-xs text-blue-600 mt-2">일일 안전 한도 = 월 한도 ÷ 31 × 80%로 설정되어 자동 차단됩니다.</p>
              </div>

              <button
                onClick={() => { setApiUsage(null); setApiError(false); getApiUsage().then(setApiUsage).catch(() => setApiError(true)); }}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                새로고침
              </button>
            </>
          ) : apiError ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-3">API 사용량 데이터를 불러올 수 없습니다.</p>
              <button
                onClick={() => { setApiError(false); getApiUsage().then(setApiUsage).catch(() => setApiError(true)); }}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                다시 시도
              </button>
            </div>
          ) : (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-3 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}

      {/* 회원 관리 탭 */}
      {activeTab === 'users' && (
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* 통계 카드 */}
        {stats && (
          <>
          {/* 방문자 / 로그인 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium">오늘 방문자</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{(stats.visits?.today || 0).toLocaleString()}</p>
                </div>
                <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-gray-500">7일 <span className="font-semibold text-gray-700">{(stats.visits?.week || 0).toLocaleString()}</span></span>
                <span className="text-xs text-gray-500">30일 <span className="font-semibold text-gray-700">{(stats.visits?.month || 0).toLocaleString()}</span></span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium">오늘 로그인</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{(stats.logins?.today || 0).toLocaleString()}</p>
                </div>
                <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-gray-500">7일 <span className="font-semibold text-gray-700">{(stats.logins?.week || 0).toLocaleString()}</span></span>
                <span className="text-xs text-gray-500">30일 <span className="font-semibold text-gray-700">{(stats.logins?.month || 0).toLocaleString()}</span></span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium">전체 회원</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats.users.total.toLocaleString()}</p>
                </div>
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-green-600 mt-2">+{stats.users.new_7d} 이번 주</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div>
                <p className="text-xs text-gray-500 font-medium mb-2">플랜 분포</p>
                <div className="space-y-1.5">
                  {stats.planDistribution.map((p) => (
                    <div key={p.display_name} className="flex items-center justify-between">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${PLAN_COLORS[p.display_name] || 'bg-gray-100 text-gray-600'}`}>
                        {p.display_name}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">{p.count}명</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 14일 방문자/로그인 추이 */}
          {stats.visitsDailyTrend && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-4">최근 14일 방문자 / 로그인 추이</h3>
              <div className="overflow-x-auto">
                <div className="flex items-end gap-1.5 min-w-[500px] h-40">
                  {stats.visitsDailyTrend.map((day, i) => {
                    const login = stats.loginsDailyTrend?.[i];
                    const maxVisitors = Math.max(...stats.visitsDailyTrend.map(d => d.visitors), 1);
                    const vHeight = Math.max((day.visitors / maxVisitors) * 100, 2);
                    const lHeight = login ? Math.max((login.logins / maxVisitors) * 100, 2) : 2;
                    const dateStr = new Date(day.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full flex items-end justify-center gap-0.5" style={{ height: '120px' }}>
                          <div
                            className="w-3 bg-indigo-400 rounded-t transition-all"
                            style={{ height: `${vHeight}%` }}
                            title={`방문자 ${day.visitors}`}
                          />
                          <div
                            className="w-3 bg-teal-400 rounded-t transition-all"
                            style={{ height: `${lHeight}%` }}
                            title={`로그인 ${login?.logins || 0}`}
                          />
                        </div>
                        <span className="text-[9px] text-gray-400">{dateStr}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-indigo-400 rounded" />
                  <span className="text-xs text-gray-500">방문자</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-teal-400 rounded" />
                  <span className="text-xs text-gray-500">로그인</span>
                </div>
              </div>
            </div>
          )}

          {/* 기존 카드: 거래 데이터 / 활성 알림 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium">거래 데이터</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats.trades.total.toLocaleString()}</p>
                </div>
                <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-green-600 mt-2">+{stats.trades.new_7d} 이번 주</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium">활성 알림</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats.alerts.total}</p>
                </div>
                <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          </>
        )}

        {/* 검색 & 필터 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="이메일 또는 닉네임 검색"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
                검색
              </button>
            </form>
            <select
              value={planFilter}
              onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">전체 플랜</option>
              {plans.map((p) => (
                <option key={p.name} value={p.name}>{p.display_name}</option>
              ))}
            </select>
          </div>
          {(search || planFilter) && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-gray-500">{pagination.total}명 검색됨</span>
              <button
                onClick={() => { setSearch(''); setSearchInput(''); setPlanFilter(''); setPage(1); }}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium"
              >
                필터 초기화
              </button>
            </div>
          )}
        </div>

        {/* 사용자 목록 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">사용자</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">가입 방식</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">역할</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">구독</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">활동</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">가입일</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">관리</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                    {/* 사용자 */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                          {(u.nickname || u.email || '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{u.nickname || '-'}</p>
                          <p className="text-xs text-gray-500 truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* 가입 방식 */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                        u.provider === 'naver' ? 'bg-green-50 text-green-700' :
                        u.provider === 'kakao' ? 'bg-yellow-50 text-yellow-700' :
                        'bg-gray-50 text-gray-600'
                      }`}>
                        {u.provider === 'local' ? '이메일' : u.provider || '이메일'}
                      </span>
                    </td>

                    {/* 역할 */}
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                        u.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {u.role === 'admin' ? 'ADMIN' : 'USER'}
                      </span>
                    </td>

                    {/* 구독 */}
                    <td className="px-4 py-3">
                      <select
                        value={u.subscription_plan_id || ''}
                        onChange={(e) => handlePlanChange(u.id, parseInt(e.target.value, 10))}
                        className={`border rounded-lg px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                          PLAN_COLORS[u.plan_display_name] || 'bg-gray-50'
                        } border-gray-200`}
                      >
                        {plans.map((plan) => (
                          <option key={plan.id} value={plan.id}>{plan.display_name}</option>
                        ))}
                      </select>
                    </td>

                    {/* 활동 */}
                    <td className="px-4 py-3 text-center hidden lg:table-cell">
                      <div className="flex items-center justify-center gap-3 text-xs text-gray-500">
                        <span title="관심 아파트">
                          <svg className="w-3.5 h-3.5 inline mr-0.5 text-rose-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                          {u.favorite_count}
                        </span>
                        <span title="활성 알림">
                          <svg className="w-3.5 h-3.5 inline mr-0.5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          </svg>
                          {u.alert_count}
                        </span>
                      </div>
                    </td>

                    {/* 가입일 */}
                    <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">
                      {new Date(u.created_at).toLocaleDateString('ko-KR')}
                    </td>

                    {/* 관리 */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleRoleChange(u.id, u.role === 'admin' ? 'user' : 'admin')}
                        disabled={u.id === user?.id}
                        className={`text-[11px] font-medium px-2 py-1 rounded transition-colors ${
                          u.id === user?.id
                            ? 'text-gray-300 cursor-not-allowed'
                            : u.role === 'admin'
                            ? 'text-amber-600 hover:bg-amber-50'
                            : 'text-gray-500 hover:bg-gray-100'
                        }`}
                        title={u.id === user?.id ? '본인 계정' : u.role === 'admin' ? '관리자 해제' : '관리자 지정'}
                      >
                        {u.role === 'admin' ? '관리자 해제' : '관리자 지정'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <p className="text-xs text-gray-500">
                전체 {pagination.total}명 중 {(page - 1) * pagination.limit + 1}-{Math.min(page * pagination.limit, pagination.total)}
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1 text-xs rounded hover:bg-gray-200 disabled:opacity-30"
                >
                  이전
                </button>
                {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                  let n;
                  if (pagination.totalPages <= 5) n = i + 1;
                  else if (page <= 3) n = i + 1;
                  else if (page >= pagination.totalPages - 2) n = pagination.totalPages - 4 + i;
                  else n = page - 2 + i;
                  return (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`w-7 h-7 text-xs rounded font-medium ${page === n ? 'bg-primary-600 text-white' : 'hover:bg-gray-200 text-gray-600'}`}
                    >
                      {n}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  className="px-2.5 py-1 text-xs rounded hover:bg-gray-200 disabled:opacity-30"
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
