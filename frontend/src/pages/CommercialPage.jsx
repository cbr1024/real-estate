import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCommercialList, getCommercialStats } from '../api/commercial';
import dayjs from 'dayjs';

const TYPE_TABS = [
  { value: 'all', label: '전체' },
  { value: 'commercial', label: '상가' },
  { value: 'officetel', label: '오피스텔' },
];

const TRADE_TABS = [
  { value: 'all', label: '전체' },
  { value: 'sale', label: '매매' },
  { value: 'jeonse', label: '전세' },
  { value: 'monthly', label: '월세' },
];

const SORT_OPTIONS = [
  { value: 'recent', label: '최신순' },
  { value: 'price_desc', label: '높은가격' },
  { value: 'price_asc', label: '낮은가격' },
  { value: 'area_desc', label: '넓은면적' },
  { value: 'trades', label: '거래많은순' },
];

const GU_LIST = [
  '', '종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구',
  '성북구', '강북구', '도봉구', '노원구', '은평구', '서대문구', '마포구',
  '양천구', '강서구', '구로구', '금천구', '영등포구', '동작구', '관악구',
  '서초구', '강남구', '송파구', '강동구',
];

const PERIOD_OPTIONS = [
  { value: '', label: '전체 기간' },
  { value: '1m', label: '1개월' },
  { value: '3m', label: '3개월' },
  { value: '6m', label: '6개월' },
  { value: '1y', label: '1년' },
];

function getPeriodDate(period) {
  if (!period) return { start: '', end: '' };
  const now = new Date();
  const map = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 };
  const months = map[period] || 0;
  const start = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  return {
    start: start.toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  };
}

const TRADE_LABELS = { sale: '매매', jeonse: '전세', monthly: '월세' };

function formatPrice(value) {
  if (!value) return '-';
  const v = Number(value);
  if (v >= 10000) {
    const eok = Math.floor(v / 10000);
    const r = v % 10000;
    return r > 0 ? `${eok}억 ${r.toLocaleString()}만` : `${eok}억`;
  }
  return `${v.toLocaleString()}만`;
}

export default function CommercialPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const currentType = searchParams.get('type') || 'all';
  const currentTrade = searchParams.get('trade') || 'all';
  const currentSort = searchParams.get('sort') || 'recent';
  const currentGu = searchParams.get('gu') || '';
  const currentPeriod = searchParams.get('period') || '';
  const currentPage = parseInt(searchParams.get('page'), 10) || 1;
  const currentSearch = searchParams.get('search') || '';

  useEffect(() => {
    getCommercialStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = { page: currentPage };
    if (currentType !== 'all') params.propertyType = currentType;
    if (currentTrade !== 'all') params.tradeType = currentTrade;
    if (currentSort !== 'recent') params.sort = currentSort;
    if (currentGu) params.gu = currentGu;
    if (currentSearch) params.search = currentSearch;
    if (currentPeriod) {
      const { start, end } = getPeriodDate(currentPeriod);
      if (start) params.startDate = start;
      if (end) params.endDate = end;
    }

    getCommercialList(params)
      .then((data) => {
        setItems(data.items || []);
        setPagination(data.pagination || {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentType, currentTrade, currentSort, currentGu, currentPeriod, currentPage, currentSearch]);

  const updateParams = (updates) => {
    const next = { type: currentType, trade: currentTrade, sort: currentSort, gu: currentGu, period: currentPeriod, search: currentSearch, ...updates };
    if (next.type === 'all') delete next.type;
    if (next.trade === 'all') delete next.trade;
    if (next.sort === 'recent') delete next.sort;
    if (!next.gu) delete next.gu;
    if (!next.period) delete next.period;
    if (!next.search) delete next.search;
    if (!next.page || next.page === 1) delete next.page;
    setSearchParams(next);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    updateParams({ search: search.trim(), page: undefined });
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 py-10">
        <div className="max-w-5xl mx-auto px-4">
          <h1 className="text-2xl font-bold text-white mb-2">상가/오피스텔 실거래가</h1>
          <p className="text-slate-400">서울 지역 상업용 부동산 거래 정보</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-5 pb-16">
        {/* 통계 */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-xs text-gray-500">전체 물건</p>
            <p className="text-xl font-extrabold text-gray-900 mt-1">
              {stats ? parseInt(stats.total_properties).toLocaleString() : '-'}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-xs text-gray-500">거래 건수</p>
            <p className="text-xl font-extrabold text-gray-900 mt-1">
              {stats ? parseInt(stats.total_trades).toLocaleString() : '-'}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-xs text-gray-500">상가</p>
            <p className="text-xl font-extrabold text-orange-600 mt-1">
              {stats ? parseInt(stats.commercial_count).toLocaleString() : '-'}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-xs text-gray-500">오피스텔</p>
            <p className="text-xl font-extrabold text-blue-600 mt-1">
              {stats ? parseInt(stats.officetel_count).toLocaleString() : '-'}
            </p>
          </div>
        </div>

        {/* 필터 */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 space-y-2">
          {/* 1행: 유형 + 거래유형 */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex gap-1">
              {TYPE_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => updateParams({ type: tab.value, page: undefined })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    currentType === tab.value ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="w-px h-5 bg-gray-200" />
            <div className="flex gap-1">
              {TRADE_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => updateParams({ trade: tab.value, page: undefined })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    currentTrade === tab.value ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2행: 지역 + 정렬 + 검색 */}
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={currentPeriod}
              onChange={(e) => updateParams({ period: e.target.value, page: undefined })}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary-500"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <select
              value={currentGu}
              onChange={(e) => updateParams({ gu: e.target.value, page: undefined })}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">서울 전체</option>
              {GU_LIST.filter(Boolean).map((gu) => (
                <option key={gu} value={gu}>{gu}</option>
              ))}
            </select>

            <div className="flex gap-1">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updateParams({ sort: opt.value, page: undefined })}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                    currentSort === opt.value ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex-1" />
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="건물명 · 주소"
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-40 outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button type="submit" className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-700">
                검색
              </button>
            </form>
          </div>
        </div>

        {/* 목록 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="py-16 text-center">
              <div className="w-7 h-7 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin mx-auto" />
            </div>
          ) : items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">유형</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">건물명</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">주소</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">최근 거래가</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">면적</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">거래일</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">거래수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          item.property_type === 'officetel'
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-orange-50 text-orange-600'
                        }`}>
                          {item.property_type === 'officetel' ? '오피스텔' : '상가'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-[200px] truncate">
                        {item.name}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[250px] truncate">
                        {item.address}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-primary-600">
                          {formatPrice(item.latestPrice)}
                        </span>
                        {item.latestTradeType && (
                          <span className="ml-1 text-[10px] text-gray-400">
                            {TRADE_LABELS[item.latestTradeType] || item.latestTradeType}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500">
                        {item.latestArea ? `${item.latestArea}m²` : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500">
                        {item.latestTradeDate ? dayjs(item.latestTradeDate).format('YY.MM.DD') : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-400">
                        {item.tradeCount}건
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-16 text-center text-sm text-gray-400">
              {currentSearch ? '검색 결과가 없습니다' : '데이터가 없습니다'}
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
          데이터 출처: 국토교통부 실거래가 공개시스템 · 매일 새벽 2:30 자동 업데이트
        </p>
      </div>
    </div>
  );
}
