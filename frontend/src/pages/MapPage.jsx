import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import NaverMap from '../components/Map/NaverMap';
import MapFilter from '../components/Map/MapFilter';
import LoadingSpinner from '../components/Common/LoadingSpinner';
import useMapStore from '../stores/useMapStore';
import { getApartmentsByBounds } from '../api/apartments';

function formatPrice(price) {
  if (!price) return '-';
  const num = Number(price);
  if (num >= 10000) {
    const rounded = Math.round(num / 10000 * 10) / 10;
    return `${rounded}억`;
  }
  if (num >= 1000) {
    const cheon = Math.round(num / 1000 * 10) / 10;
    return `${cheon}천`;
  }
  return `${num}만`;
}

function formatArea(area) {
  if (!area) return '';
  return `${(Number(area) / 3.306).toFixed(0)}평`;
}

const SORT_OPTIONS = [
  { key: 'price_desc', label: '높은가격순' },
  { key: 'price_asc', label: '낮은가격순' },
  { key: 'area_desc', label: '넓은면적순' },
  { key: 'area_asc', label: '좁은면적순' },
  { key: 'trade_desc', label: '거래많은순' },
  { key: 'name_asc', label: '이름순' },
];

export default function MapPage() {
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [sortKey, setSortKey] = useState('price_desc');
  const panelRef = useRef(null);
  const { bounds, filters, selectedApartment } = useMapStore();

  const { data: apiResponse, isLoading } = useQuery({
    queryKey: ['apartments', bounds, filters],
    queryFn: () => {
      if (!bounds) return { totalCount: 0, items: [] };
      return getApartmentsByBounds(bounds, {
        tradeType: filters.tradeType,
        minPrice: filters.priceRange[0],
        maxPrice: filters.priceRange[1],
        minArea: filters.areaRange[0],
        maxArea: filters.areaRange[1],
      });
    },
    enabled: !!bounds,
    staleTime: 10 * 1000,
    placeholderData: (prev) => prev,
  });

  const totalCount = apiResponse?.totalCount || 0;
  const rawItems = apiResponse?.items || [];

  const items = [...rawItems].sort((a, b) => {
    const aS = selectedApartment && a.id === selectedApartment.id ? 1 : 0;
    const bS = selectedApartment && b.id === selectedApartment.id ? 1 : 0;
    if (aS !== bS) return bS - aS;
    switch (sortKey) {
      case 'price_desc': return (Number(b.latestPrice) || 0) - (Number(a.latestPrice) || 0);
      case 'price_asc': return (Number(a.latestPrice) || 0) - (Number(b.latestPrice) || 0);
      case 'area_desc': return (Number(b.latestArea) || 0) - (Number(a.latestArea) || 0);
      case 'area_asc': return (Number(a.latestArea) || 0) - (Number(b.latestArea) || 0);
      case 'trade_desc': return (b.tradeCount || 0) - (a.tradeCount || 0);
      case 'name_asc': return (a.name || '').localeCompare(b.name || '', 'ko');
      default: return 0;
    }
  });

  // 패널 위에서 스크롤 시 지도 스크롤 방지
  const handleWheel = useCallback((e) => {
    e.stopPropagation();
  }, []);

  const searchedApt = selectedApartment && items.find(a => a.id === selectedApartment.id);
  const restItems = items.filter(apt => !selectedApartment || apt.id !== selectedApartment.id);

  return (
    <div className="relative h-[calc(100vh-64px)]">
      {/* 지도 (전체 영역) */}
      <div className="absolute inset-0">
        <NaverMap />
        <MapFilter />
      </div>

      {/* 토글 버튼 */}
      <button
        onClick={() => setIsPanelOpen(!isPanelOpen)}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-full shadow-lg px-5 py-2.5 flex items-center gap-2 hover:bg-white transition-colors border border-gray-200/80 z-30 md:hidden"
      >
        <svg
          className={`w-4 h-4 text-gray-600 transition-transform ${isPanelOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
        <span className="text-sm font-medium text-gray-700">
          {totalCount ? `${totalCount.toLocaleString()}개 아파트` : '아파트 목록'}
        </span>
      </button>

      {/* 반투명 카드 패널 (지도 위 오버레이) */}
      <div
        ref={panelRef}
        onWheel={handleWheel}
        className={`
          absolute right-0 top-0 h-full z-20
          w-full md:w-[380px]
          transition-transform duration-300 ease-in-out
          ${isPanelOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        style={{ pointerEvents: 'auto' }}
      >
        <div className="h-full flex flex-col">

          {/* 헤더 */}
          <div className="flex-shrink-0 px-3 pt-3 pb-2">
            <div className="bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2.5 shadow-sm border border-white/60">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-sm font-bold text-gray-900">아파트 목록</h2>
                  <p className="text-[11px] text-gray-500">{totalCount.toLocaleString()}개</p>
                </div>
                <button
                  onClick={() => setIsPanelOpen(false)}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors md:hidden"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSortKey(opt.key)}
                    className={`text-[11px] px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                      sortKey === opt.key
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 목록 (스크롤) */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
            {isLoading && !items.length ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner text="로딩중..." />
              </div>
            ) : items.length > 0 ? (
              <>
                {/* 검색 결과 카드 */}
                {searchedApt && (() => {
                  const apt = searchedApt;
                  const area = formatArea(apt.latestArea);
                  return (
                    <div>
                      <div className="flex items-center gap-1.5 px-1 mb-1.5">
                        <svg className="w-3 h-3 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <span className="text-[11px] font-semibold text-primary-600">검색 결과</span>
                      </div>
                      <Link to={`/apartment/${apt.id}`}
                        className="block bg-white/90 backdrop-blur-sm rounded-xl p-4 border border-primary-200/80 shadow-md hover:shadow-lg transition-all hover:bg-white">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-[15px] font-bold text-gray-900 truncate">{apt.name}</h3>
                            <p className="text-xs text-gray-500 mt-1">{apt.address}</p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              {area && <span className="text-[11px] bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-semibold">{area}</span>}
                              {apt.buildYear && <span className="text-[11px] text-gray-400">{apt.buildYear}년</span>}
                              {apt.tradeCount > 0 && <span className="text-[11px] text-gray-400">거래 {apt.tradeCount}건</span>}
                            </div>
                          </div>
                          <p className="text-lg font-extrabold text-primary-600 ml-3">{formatPrice(apt.latestPrice)}</p>
                        </div>
                      </Link>
                    </div>
                  );
                })()}

                {/* 주변 아파트 구분 */}
                {searchedApt && restItems.length > 0 && (
                  <div className="flex items-center gap-1.5 px-1 pt-1">
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                    </svg>
                    <span className="text-[11px] font-semibold text-gray-400">주변 아파트</span>
                  </div>
                )}

                {/* 아파트 카드 목록 */}
                {restItems.map((apt) => {
                  const area = formatArea(apt.latestArea);
                  return (
                    <Link
                      key={apt.id}
                      to={`/apartment/${apt.id}`}
                      className="block bg-white/85 backdrop-blur-sm rounded-xl px-4 py-3 hover:bg-white transition-all hover:shadow-md border border-white/60 shadow-sm"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-gray-900 truncate">{apt.name}</h3>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{apt.address}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {area && <span className="text-[11px] bg-blue-50/80 text-primary-700 px-1.5 py-0.5 rounded font-medium">{area}</span>}
                            {apt.buildYear && <span className="text-[11px] text-gray-400">{apt.buildYear}년</span>}
                            {apt.tradeCount > 0 && <span className="text-[11px] text-gray-400">거래 {apt.tradeCount}건</span>}
                          </div>
                        </div>
                        <p className="text-sm font-bold text-primary-600 ml-3 flex-shrink-0">{formatPrice(apt.latestPrice)}</p>
                      </div>
                    </Link>
                  );
                })}

                {totalCount > items.length && (
                  <div className="text-center text-xs text-gray-400 py-2">
                    지도를 확대하면 더 많은 아파트를 볼 수 있습니다
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <p className="text-sm text-gray-400">지도를 이동하여 검색하세요</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PC에서 패널 토글 버튼 */}
      <button
        onClick={() => setIsPanelOpen(!isPanelOpen)}
        className={`
          hidden md:flex absolute top-1/2 -translate-y-1/2 z-30
          w-6 h-16 items-center justify-center
          bg-white/85 backdrop-blur-sm rounded-l-lg shadow-md border border-r-0 border-gray-200/60
          hover:bg-white transition-all
          ${isPanelOpen ? 'right-[380px]' : 'right-0'}
        `}
      >
        <svg className={`w-4 h-4 text-gray-500 transition-transform ${isPanelOpen ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
