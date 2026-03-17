import { useState } from 'react';
import useMapStore from '../../stores/useMapStore';

const TRADE_TYPES = ['매매', '전세', '월세'];
const PERIODS = [
  { value: '3months', label: '3개월' },
  { value: '6months', label: '6개월' },
  { value: '1year', label: '1년' },
  { value: '3years', label: '3년' },
  { value: '5years', label: '5년' },
];

export default function MapFilter() {
  const { filters, setFilters } = useMapStore();
  const [isOpen, setIsOpen] = useState(false);

  const handleTradeTypeChange = (type) => {
    setFilters({ tradeType: type });
  };

  const handlePriceChange = (index, value) => {
    const newRange = [...filters.priceRange];
    newRange[index] = Number(value);
    setFilters({ priceRange: newRange });
  };

  const handleAreaChange = (index, value) => {
    const newRange = [...filters.areaRange];
    newRange[index] = Number(value);
    setFilters({ areaRange: newRange });
  };

  const handlePeriodChange = (period) => {
    setFilters({ period });
  };

  function formatPrice(value) {
    if (value >= 10000) {
      return `${Math.floor(value / 10000)}억`;
    }
    return `${value.toLocaleString()}만`;
  }

  return (
    <div className="absolute top-4 left-4 z-10">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-white rounded-lg shadow-lg px-4 py-2.5 flex items-center gap-2 hover:bg-gray-50 transition-colors border border-gray-200"
      >
        <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        <span className="text-sm font-medium text-gray-700">필터</span>
      </button>

      {/* Filter Panel */}
      {isOpen && (
        <div className="mt-2 bg-white rounded-xl shadow-xl border border-gray-200 p-5 w-80">
          {/* Trade Type */}
          <div className="mb-5">
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              거래 유형
            </label>
            <div className="flex gap-2">
              {TRADE_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => handleTradeTypeChange(type)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    filters.tradeType === type
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Price Range */}
          <div className="mb-5">
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              가격 범위
            </label>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-gray-500">
                {formatPrice(filters.priceRange[0])}
              </span>
              <span className="text-xs text-gray-400">~</span>
              <span className="text-xs text-gray-500">
                {filters.priceRange[1] >= 500000 ? '무제한' : formatPrice(filters.priceRange[1])}
              </span>
            </div>
            <div className="space-y-2">
              <input
                type="range"
                min="0"
                max="500000"
                step="5000"
                value={filters.priceRange[0]}
                onChange={(e) => handlePriceChange(0, e.target.value)}
                className="w-full"
              />
              <input
                type="range"
                min="0"
                max="500000"
                step="5000"
                value={filters.priceRange[1]}
                onChange={(e) => handlePriceChange(1, e.target.value)}
                className="w-full"
              />
            </div>
          </div>

          {/* Area Range */}
          <div className="mb-5">
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              면적 (㎡)
            </label>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-gray-500">{filters.areaRange[0]}㎡</span>
              <span className="text-xs text-gray-400">~</span>
              <span className="text-xs text-gray-500">
                {filters.areaRange[1] >= 200 ? '무제한' : `${filters.areaRange[1]}㎡`}
              </span>
            </div>
            <div className="space-y-2">
              <input
                type="range"
                min="0"
                max="200"
                step="10"
                value={filters.areaRange[0]}
                onChange={(e) => handleAreaChange(0, e.target.value)}
                className="w-full"
              />
              <input
                type="range"
                min="0"
                max="200"
                step="10"
                value={filters.areaRange[1]}
                onChange={(e) => handleAreaChange(1, e.target.value)}
                className="w-full"
              />
            </div>
          </div>

          {/* Period */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              기간
            </label>
            <div className="flex flex-wrap gap-2">
              {PERIODS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => handlePeriodChange(value)}
                  className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                    filters.period === value
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
