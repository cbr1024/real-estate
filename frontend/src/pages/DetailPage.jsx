import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApartmentDetail, getTradeHistory, getAnalysis, getApartmentStats } from '../api/apartments';
import { addFavorite, removeFavorite, getFavorites } from '../api/favorites';
import { getAlertForApartment, createAlert, deleteAlert } from '../api/alerts';
import PriceChart from '../components/Chart/PriceChart';
import AreaCompareChart from '../components/Chart/AreaCompareChart';
import MonthlyStatsChart from '../components/Chart/MonthlyStatsChart';
import LoadingSpinner from '../components/Common/LoadingSpinner';
import ShareButtons from '../components/Common/ShareButtons';
import SchoolInfo from '../components/School/SchoolInfo';
import ReviewSection from '../components/Review/ReviewSection';
import useAuthStore from '../stores/useAuthStore';
import useCompareStore from '../stores/useCompareStore';
import dayjs from 'dayjs';

function formatPrice(price) {
  if (!price) return '-';
  if (price >= 10000) {
    const eok = Math.floor(price / 10000);
    const remainder = price % 10000;
    return remainder > 0 ? `${eok}억 ${remainder.toLocaleString()}` : `${eok}억`;
  }
  return `${price.toLocaleString()}만`;
}

const CHART_TABS = [
  { key: 'trades', label: '거래가 추이' },
  { key: 'stats', label: '월별 통계' },
];

export default function DetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuthStore();
  const { apartments: compareList, addApartment: addToCompare } = useCompareStore();
  const userPlan = user?.subscription?.plan_name || 'free';
  const canCompare = isAuthenticated && ['basic', 'pro'].includes(userPlan);
  const [chartTab, setChartTab] = useState('trades');
  const [showShare, setShowShare] = useState(false);
  const [tradeTypeFilter, setTradeTypeFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(10);
  const loadMoreRef = useRef(null);

  const { data: apartment, isLoading: isLoadingApt } = useQuery({
    queryKey: ['apartment', id],
    queryFn: () => getApartmentDetail(id),
  });

  const { data: tradesResponse, isLoading: isLoadingTrades } = useQuery({
    queryKey: ['trades', id],
    queryFn: () => getTradeHistory(id, { limit: 50 }),
  });

  const trades = tradesResponse?.data || [];

  const uniqueAreas = [...new Set(trades.map((t) => Math.round(t.area / 3.306)))].sort((a, b) => a - b);

  const filteredTrades = trades.filter((trade) => {
    if (tradeTypeFilter !== 'all' && trade.tradeType !== tradeTypeFilter) return false;
    if (areaFilter !== 'all' && Math.round(trade.area / 3.306) !== Number(areaFilter)) return false;
    if (periodFilter !== 'all') {
      const [num, unit] = periodFilter.split('-');
      const cutoff = dayjs().subtract(Number(num), unit);
      if (dayjs(trade.tradeDate).isBefore(cutoff)) return false;
    }
    return true;
  });

  useEffect(() => {
    setVisibleCount(10);
  }, [tradeTypeFilter, areaFilter, periodFilter]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => prev + 10);
  }, []);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) handleLoadMore(); },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleLoadMore, filteredTrades.length]);

  const { data: statsData } = useQuery({
    queryKey: ['stats', id],
    queryFn: () => getApartmentStats(id),
  });

  const { data: analysis } = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => getAnalysis(id),
  });

  const { data: favorites } = useQuery({
    queryKey: ['favorites'],
    queryFn: getFavorites,
    enabled: isAuthenticated,
  });

  const { data: alertData } = useQuery({
    queryKey: ['alert', id],
    queryFn: () => getAlertForApartment(id),
    enabled: isAuthenticated,
  });

  const hasAlert = !!alertData?.alert;
  const isInCompare = compareList.some((a) => a.id === apartment?.id);

  const createAlertMutation = useMutation({
    mutationFn: createAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert', id] }),
  });

  const deleteAlertMutation = useMutation({
    mutationFn: deleteAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert', id] }),
  });

  const handleAlertToggle = () => {
    if (!isAuthenticated) { navigate('/login'); return; }
    if (hasAlert) {
      deleteAlertMutation.mutate(alertData.alert.id);
    } else {
      createAlertMutation.mutate({ apartment_id: parseInt(id, 10) });
    }
  };

  const isFavorited = favorites?.some((f) => String(f.id) === String(id));

  const addFavMutation = useMutation({
    mutationFn: addFavorite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorites'] }),
  });

  const removeFavMutation = useMutation({
    mutationFn: removeFavorite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorites'] }),
  });

  const handleFavoriteToggle = () => {
    if (!isAuthenticated) { navigate('/login'); return; }
    if (isFavorited) { removeFavMutation.mutate(id); }
    else { addFavMutation.mutate(id); }
  };

  const handleCompareToggle = () => {
    if (!apartment) return;
    if (!canCompare) { navigate('/subscription'); return; }
    if (!isInCompare) {
      addToCompare({ id: apartment.id, name: apartment.name, address: apartment.address });
    }
  };

  if (isLoadingApt) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
        <LoadingSpinner size="lg" text="아파트 정보를 불러오는 중..." />
      </div>
    );
  }

  if (!apartment) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)]">
        <p className="text-gray-500 text-lg">아파트 정보를 찾을 수 없습니다</p>
        <button onClick={() => navigate('/')} className="mt-4 text-primary-600 hover:text-primary-700 font-medium">
          지도로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            뒤로가기
          </button>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{apartment.name}</h1>
              <p className="text-sm text-gray-500 mt-1">{apartment.address}</p>
            </div>

            {/* 액션 버튼 그룹 */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* 공유 */}
              <div className="relative">
                <button
                  onClick={() => setShowShare(!showShare)}
                  className={`p-2.5 rounded-full border transition-colors ${
                    showShare
                      ? 'bg-gray-100 border-gray-300 text-gray-600'
                      : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300'
                  }`}
                  title="공유"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </button>
                {showShare && (
                  <div className="absolute right-0 top-12 z-10 bg-white rounded-xl shadow-lg border border-gray-200 p-3">
                    <ShareButtons title={`${apartment.name} 시세 정보`} />
                  </div>
                )}
              </div>

              {/* 비교 담기 */}
              <button
                onClick={handleCompareToggle}
                disabled={isInCompare}
                className={`p-2.5 rounded-full border transition-colors ${
                  isInCompare
                    ? 'bg-purple-50 border-purple-200 text-purple-500'
                    : 'bg-white border-gray-200 text-gray-400 hover:text-purple-400 hover:border-purple-200'
                }`}
                title={isInCompare ? '비교 목록에 추가됨' : '비교 담기'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </button>

              {/* 알림 */}
              <button
                onClick={handleAlertToggle}
                className={`p-2.5 rounded-full border transition-colors ${
                  hasAlert
                    ? 'bg-yellow-50 border-yellow-200 text-yellow-500'
                    : 'bg-white border-gray-200 text-gray-400 hover:text-yellow-400 hover:border-yellow-200'
                }`}
                title={hasAlert ? '알림 해제' : '시세 알림 등록'}
              >
                <svg className="w-5 h-5" fill={hasAlert ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>

              {/* 관심 */}
              <button
                onClick={handleFavoriteToggle}
                className={`relative flex items-center gap-1 px-2.5 py-1.5 rounded-full border transition-colors ${
                  isFavorited
                    ? 'bg-red-50 border-red-200 text-red-500'
                    : apartment.favoriteCount > 0
                      ? 'bg-red-50 border-red-200 text-red-400'
                      : 'bg-white border-gray-200 text-gray-400 hover:text-red-400 hover:border-red-200'
                }`}
                title={isFavorited ? '관심 해제' : '관심 등록'}
              >
                <svg className="w-5 h-5" fill={(isFavorited || apartment.favoriteCount > 0) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                <span className="text-xs font-semibold">{apartment.favoriteCount ?? 0}</span>
              </button>
            </div>
          </div>

          {/* Info Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">건축년도</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">{apartment.buildYear || '-'}년</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">총 세대수</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">{apartment.totalUnits?.toLocaleString() || '-'}세대</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">총 동수</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">{apartment.dongCount || '-'}동</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">최고층</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">{apartment.maxFloor || '-'}층</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Price Charts — 탭 전환 */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex border-b border-gray-200">
            {CHART_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setChartTab(tab.key)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  chartTab === tab.key
                    ? 'text-primary-600 border-b-2 border-primary-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="p-6">
            {isLoadingTrades ? (
              <LoadingSpinner text="거래 데이터 로딩중..." />
            ) : chartTab === 'trades' ? (
              <PriceChart trades={trades} title="" />
            ) : (
              <MonthlyStatsChart stats={statsData?.stats || []} title="" />
            )}
          </div>
        </div>

        {/* Area Compare Chart */}
        <AreaCompareChart
          areaData={analysis?.nearbyComparison?.비교결과?.map((item) => ({
            area: item['전용면적_㎡'],
            avgPrice: item['최근_평균가격_만원'],
            name: item['아파트명'],
          })) || []}
          title="주변 시세 비교"
        />

        {/* School Info */}
        <SchoolInfo apartmentId={id} />

        {/* Reviews */}
        <ReviewSection apartmentId={id} />

        {/* Recent Trades Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h3 className="text-lg font-bold text-gray-800">최근 거래 내역</h3>
              <div className="flex flex-wrap items-center gap-2">
                {/* 거래 유형 필터 */}
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                  {[
                    { value: 'all', label: '전체' },
                    { value: 'sale', label: '매매' },
                    { value: 'jeonse', label: '전세' },
                    { value: 'monthly', label: '월세' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTradeTypeFilter(opt.value)}
                      className={`px-2.5 py-1.5 font-medium transition-colors ${
                        tradeTypeFilter === opt.value
                          ? 'bg-primary-600 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {/* 면적 필터 */}
                <select
                  value={areaFilter}
                  onChange={(e) => setAreaFilter(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="all">전체 면적</option>
                  {uniqueAreas.map((pyeong) => (
                    <option key={pyeong} value={pyeong}>{pyeong}평</option>
                  ))}
                </select>
                {/* 기간 필터 */}
                <select
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="all">전체 기간</option>
                  <option value="1-month">최근 1개월</option>
                  <option value="3-month">최근 3개월</option>
                  <option value="6-month">최근 6개월</option>
                  <option value="1-year">최근 1년</option>
                  <option value="3-year">최근 3년</option>
                  <option value="5-year">최근 5년</option>
                </select>
              </div>
            </div>
            {filteredTrades.length !== trades.length && (
              <p className="text-xs text-gray-400 mt-2">{filteredTrades.length}건 / 전체 {trades.length}건</p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">유형</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">거래일</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">면적(㎡)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">층</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">거래가</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTrades.length > 0 ? (
                  filteredTrades.slice(0, visibleCount).map((trade, i) => {
                    const typeLabel = trade.tradeType === 'sale' ? '매매' : trade.tradeType === 'jeonse' ? '전세' : trade.tradeType === 'monthly' ? '월세' : trade.tradeType || '-';
                    const typeColor = trade.tradeType === 'sale' ? 'bg-blue-50 text-blue-600' : trade.tradeType === 'jeonse' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600';
                    return (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${typeColor}`}>{typeLabel}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{dayjs(trade.tradeDate).format('YYYY.MM.DD')}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{trade.area}㎡ ({Math.round(trade.area / 3.306)}평)</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{trade.floor}층</td>
                        <td className="px-4 py-3 text-sm font-semibold text-primary-600 text-right">{formatPrice(trade.price)}만원</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">거래 내역이 없습니다</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredTrades.length > visibleCount && (
            <div ref={loadMoreRef} className="flex items-center justify-center py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                {visibleCount}건 / {filteredTrades.length}건 표시 중
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
