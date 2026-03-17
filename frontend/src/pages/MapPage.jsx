import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import NaverMap from '../components/Map/NaverMap';
import MapFilter from '../components/Map/MapFilter';
import LoadingSpinner from '../components/Common/LoadingSpinner';
import useMapStore from '../stores/useMapStore';
import { getApartmentsByBounds } from '../api/apartments';

function formatPrice(price) {
  if (!price) return '-';
  if (price >= 10000) {
    const eok = Math.floor(price / 10000);
    const remainder = price % 10000;
    return remainder > 0 ? `${eok}억 ${remainder.toLocaleString()}` : `${eok}억`;
  }
  return `${price.toLocaleString()}만`;
}

export default function MapPage() {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const { bounds, filters } = useMapStore();

  const { data: apartments, isLoading } = useQuery({
    queryKey: ['apartmentList', bounds, filters],
    queryFn: () => {
      if (!bounds) return [];
      return getApartmentsByBounds(bounds, {
        tradeType: filters.tradeType,
        minPrice: filters.priceRange[0],
        maxPrice: filters.priceRange[1],
        minArea: filters.areaRange[0],
        maxArea: filters.areaRange[1],
      });
    },
    enabled: !!bounds,
  });

  return (
    <div className="relative flex h-[calc(100vh-64px)]">
      {/* Map */}
      <div className="flex-1 relative">
        <NaverMap />
        <MapFilter />

        {/* Toggle List Panel Button */}
        <button
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-full shadow-lg px-5 py-2.5 flex items-center gap-2 hover:bg-gray-50 transition-colors border border-gray-200 z-10 md:hidden"
        >
          <svg
            className={`w-4 h-4 text-gray-600 transition-transform ${isPanelOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
          <span className="text-sm font-medium text-gray-700">
            아파트 목록 {apartments?.length ? `(${apartments.length})` : ''}
          </span>
        </button>
      </div>

      {/* Apartment List Panel */}
      <div
        className={`
          absolute md:relative right-0 top-0 h-full bg-white border-l border-gray-200 z-20
          w-full md:w-96 transition-transform duration-300 ease-in-out
          ${isPanelOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
        `}
      >
        {/* Panel Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-bold text-gray-900">아파트 목록</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {apartments?.length || 0}개의 아파트
            </p>
          </div>
          <button
            onClick={() => setIsPanelOpen(false)}
            className="p-1.5 hover:bg-gray-100 rounded-lg md:hidden"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Apartment List */}
        <div className="overflow-y-auto h-[calc(100%-56px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner text="아파트 목록 로딩중..." />
            </div>
          ) : apartments?.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {apartments.map((apt) => (
                <Link
                  key={apt.id}
                  to={`/apartment/${apt.id}`}
                  className="block px-4 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {apt.name}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {apt.address}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        {apt.buildYear && (
                          <span className="text-xs text-gray-400">
                            {apt.buildYear}년
                          </span>
                        )}
                        {apt.totalUnits && (
                          <span className="text-xs text-gray-400">
                            {apt.totalUnits}세대
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right ml-3 flex-shrink-0">
                      <p className="text-sm font-bold text-primary-600">
                        {formatPrice(apt.latestPrice)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {filters.tradeType}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <svg className="w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <p className="text-sm text-gray-400">
                지도를 이동하여 아파트를 검색하세요
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
