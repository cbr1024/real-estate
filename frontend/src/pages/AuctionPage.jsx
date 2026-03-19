import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getAuctions } from '../api/auctions';
import useAuthStore from '../stores/useAuthStore';
import dayjs from 'dayjs';

const STATUS_OPTIONS = [
  { value: 'scheduled', label: '진행 예정' },
  { value: 'closed', label: '종료' },
  { value: 'all', label: '전체' },
];

const SORT_OPTIONS = [
  { value: 'date', label: '매각기일순' },
  { value: 'price_asc', label: '낮은가격순' },
  { value: 'price_desc', label: '높은가격순' },
  { value: 'discount', label: '할인율순' },
];

function formatPrice(value) {
  if (!value) return '-';
  if (value >= 10000) {
    const eok = Math.floor(value / 10000);
    const remainder = value % 10000;
    return remainder > 0 ? `${eok}억 ${remainder.toLocaleString()}만` : `${eok}억`;
  }
  return `${value.toLocaleString()}만`;
}

export default function AuctionPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const [auctions, setAuctions] = useState([]);
  const [stats, setStats] = useState({});
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);

  const currentStatus = searchParams.get('status') || 'scheduled';
  const currentSort = searchParams.get('sort') || 'date';
  const currentPage = parseInt(searchParams.get('page'), 10) || 1;

  useEffect(() => {
    setLoading(true);
    getAuctions({ page: currentPage, status: currentStatus, sort: currentSort })
      .then((data) => {
        setAuctions(data.auctions);
        setStats(data.stats);
        setPagination(data.pagination);
        setIsPro(data.isPro);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentStatus, currentSort, currentPage]);

  const updateParams = (updates) => {
    const next = { status: currentStatus, sort: currentSort, ...updates };
    if (next.status === 'scheduled') delete next.status;
    if (next.sort === 'date') delete next.sort;
    setSearchParams(next);
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 py-10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-white">경매 정보</h1>
            <span className="text-[10px] font-bold text-violet-400 bg-violet-500/20 px-2 py-0.5 rounded-full">PRO</span>
          </div>
          <p className="text-slate-400">서울 지역 아파트 경매 물건 정보</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-5 pb-16">
        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-xs text-gray-500">진행 예정</p>
            <p className="text-2xl font-extrabold text-gray-900 mt-1">{stats.scheduled_count || 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-xs text-gray-500">종료</p>
            <p className="text-2xl font-extrabold text-gray-900 mt-1">{stats.closed_count || 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-xs text-gray-500">평균 할인율</p>
            <p className="text-2xl font-extrabold text-red-600 mt-1">{stats.avg_discount || 0}%</p>
          </div>
        </div>

        {/* 필터 */}
        <div className="bg-white rounded-xl border border-gray-200 p-2 flex flex-wrap gap-2 mb-4">
          <div className="flex gap-1">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => updateParams({ status: opt.value, page: undefined })}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  currentStatus === opt.value
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="w-px bg-gray-200 mx-1" />
          <div className="flex gap-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => updateParams({ sort: opt.value, page: undefined })}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  currentSort === opt.value
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 경매 목록 */}
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
              <div className="w-7 h-7 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin mx-auto" />
            </div>
          ) : auctions.length > 0 ? (
            auctions.map((item) => (
              <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* 상단 뱃지 */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        item.status === 'scheduled'
                          ? 'bg-green-50 text-green-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {item.status === 'scheduled' ? '진행 예정' : '종료'}
                      </span>
                      <span className="text-[11px] text-gray-400">{item.court_name}</span>
                      <span className="text-[11px] text-gray-400">{item.case_number}</span>
                      {item.fail_count > 0 && (
                        <span className="text-[11px] font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">
                          {item.fail_count}회 유찰
                        </span>
                      )}
                    </div>

                    {/* 주소 */}
                    <h3 className="text-sm font-semibold text-gray-900">{item.address}</h3>
                    {item.apartment_name && (
                      <button
                        onClick={() => navigate(`/apartment/${item.apartment_id}`)}
                        className="text-xs text-primary-600 hover:underline mt-0.5"
                      >
                        {item.apartment_name} 상세보기
                      </button>
                    )}

                    {/* 면적/층 */}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      {item.area && <span>{item.area}㎡ ({Math.round(item.area / 3.306)}평)</span>}
                      {item.floor && <span>{item.floor}층</span>}
                      {item.auction_date && (
                        <span className="font-medium text-gray-700">
                          매각기일: {dayjs(item.auction_date).format('YYYY.MM.DD')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 가격 정보 */}
                  <div className="text-right flex-shrink-0 relative">
                    {item.locked ? (
                      <div className="text-center">
                        <div className="bg-gray-100 rounded-lg px-4 py-3 relative overflow-hidden">
                          <p className="text-sm text-gray-300 font-bold blur-sm select-none">9억 5,000만</p>
                          <p className="text-xs text-gray-300 blur-sm select-none">감정가 12억</p>
                        </div>
                        <button
                          onClick={() => navigate('/subscription')}
                          className="mt-2 text-[10px] font-bold text-violet-600 bg-violet-50 px-3 py-1 rounded-full hover:bg-violet-100 transition-colors"
                        >
                          PRO 플랜으로 확인
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-lg font-extrabold text-primary-600">{formatPrice(item.minimum_price)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">감정가 {formatPrice(item.appraisal_value)}</p>
                        {item.discount_rate > 0 && (
                          <span className="inline-block mt-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                            {item.discount_rate}% 할인
                          </span>
                        )}
                        {item.court_url && (
                          <a
                            href={item.court_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block mt-2 text-[11px] text-gray-400 hover:text-primary-600 transition-colors"
                          >
                            대법원 상세 →
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-400">
              경매 물건이 없습니다
            </div>
          )}
        </div>

        {/* 페이지네이션 */}
        {pagination.totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
              .filter((p) => Math.abs(p - currentPage) <= 2 || p === 1 || p === pagination.totalPages)
              .map((p) => (
                <button
                  key={p}
                  onClick={() => updateParams({ page: p })}
                  className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                    p === currentPage ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              ))}
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          데이터 출처: 대법원 법원경매정보 · 매일 새벽 4시 자동 업데이트
        </p>
      </div>
    </div>
  );
}
