import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApartmentDetail, getTradeHistory, getAnalysis } from '../api/apartments';
import { addFavorite, removeFavorite, getFavorites } from '../api/favorites';
import PriceChart from '../components/Chart/PriceChart';
import AreaCompareChart from '../components/Chart/AreaCompareChart';
import LoadingSpinner from '../components/Common/LoadingSpinner';
import useAuthStore from '../stores/useAuthStore';
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

export default function DetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();

  const { data: apartment, isLoading: isLoadingApt } = useQuery({
    queryKey: ['apartment', id],
    queryFn: () => getApartmentDetail(id),
  });

  const { data: tradesResponse, isLoading: isLoadingTrades } = useQuery({
    queryKey: ['trades', id],
    queryFn: () => getTradeHistory(id, { limit: 50 }),
  });

  const trades = tradesResponse?.data || [];

  const { data: analysis } = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => getAnalysis(id),
  });

  const { data: favorites } = useQuery({
    queryKey: ['favorites'],
    queryFn: getFavorites,
    enabled: isAuthenticated,
  });

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
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (isFavorited) {
      removeFavMutation.mutate(id);
    } else {
      addFavMutation.mutate(id);
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
        <button
          onClick={() => navigate('/')}
          className="mt-4 text-primary-600 hover:text-primary-700 font-medium"
        >
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

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{apartment.name}</h1>
              <p className="text-sm text-gray-500 mt-1">{apartment.address}</p>
            </div>
            <button
              onClick={handleFavoriteToggle}
              className={`p-2.5 rounded-full border transition-colors ${
                isFavorited
                  ? 'bg-red-50 border-red-200 text-red-500'
                  : 'bg-white border-gray-200 text-gray-400 hover:text-red-400 hover:border-red-200'
              }`}
              title={isFavorited ? '관심 해제' : '관심 등록'}
            >
              <svg
                className="w-6 h-6"
                fill={isFavorited ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
            </button>
          </div>

          {/* Info Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">건축년도</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">
                {apartment.buildYear || '-'}년
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">총 세대수</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">
                {apartment.totalUnits?.toLocaleString() || '-'}세대
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">총 동수</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">
                {apartment.dongCount || '-'}동
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">최고층</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">
                {apartment.maxFloor || '-'}층
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Price Chart */}
        {isLoadingTrades ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <LoadingSpinner text="거래 데이터 로딩중..." />
          </div>
        ) : (
          <PriceChart trades={trades} title="거래가 추이" />
        )}

        {/* Area Compare Chart */}
        <AreaCompareChart
          areaData={analysis?.nearbyComparison?.비교결과?.map((item) => ({
            area: item['전용면적_㎡'],
            avgPrice: item['최근_평균가격_만원'],
            name: item['아파트명'],
          })) || []}
          title="주변 시세 비교"
        />

        {/* Recent Trades Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-800">최근 거래 내역</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    거래일
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    면적(㎡)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    층
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    거래가
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {trades.length > 0 ? (
                  trades.map((trade, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {dayjs(trade.tradeDate).format('YYYY.MM.DD')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {trade.area}㎡ ({Math.round(trade.area / 3.306)}평)
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {trade.floor}층
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-primary-600 text-right">
                        {formatPrice(trade.price)}만원
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                      거래 내역이 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
