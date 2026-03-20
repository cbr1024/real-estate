import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useMapStore from '../../stores/useMapStore';
import useAuthStore from '../../stores/useAuthStore';

const TRADE_TYPES = ['매매', '전세', '월세'];

const PLAN_RANK = { free: 0, basic: 1, pro: 2 };

const PERIODS = [
  { value: '3months', label: '3개월', minPlan: 'free' },
  { value: '6months', label: '6개월', minPlan: 'free' },
  { value: '1year', label: '1년', minPlan: 'free' },
  { value: '3years', label: '3년', minPlan: 'basic' },
  { value: '5years', label: '5년', minPlan: 'pro' },
];

const AREA_PRESETS = [
  { label: '전체', range: [0, 200] },
  { label: '~59㎡(18평)', range: [0, 59] },
  { label: '59~84㎡(25평)', range: [59, 84] },
  { label: '84~114㎡(34평)', range: [84, 114] },
  { label: '114~135㎡(41평)', range: [114, 135] },
  { label: '135㎡~(41평+)', range: [135, 200] },
];

const BUILD_YEAR_PRESETS = [
  { label: '전체', range: [0, 0] },
  { label: '5년 이내', range: [new Date().getFullYear() - 5, 0] },
  { label: '10년 이내', range: [new Date().getFullYear() - 10, 0] },
  { label: '15년 이내', range: [new Date().getFullYear() - 15, 0] },
  { label: '20년 이상', range: [0, new Date().getFullYear() - 20] },
];

const FLOOR_PRESETS = [
  { label: '전체', range: [0, 0] },
  { label: '저층(1~5)', range: [1, 5] },
  { label: '중층(6~15)', range: [6, 15] },
  { label: '고층(16+)', range: [16, 0] },
];

const UNITS_PRESETS = [
  { label: '전체', value: 0 },
  { label: '300세대+', value: 300 },
  { label: '500세대+', value: 500 },
  { label: '1000세대+', value: 1000 },
];

const TRADE_COUNT_PRESETS = [
  { label: '전체', value: 0 },
  { label: '5건+', value: 5 },
  { label: '10건+', value: 10 },
  { label: '30건+', value: 30 },
];

export default function MapFilter() {
  const { filters, setFilters, overlays, toggleOverlay } = useMapStore();
  const { user, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  const userPlan = isAuthenticated ? (user?.subscription?.plan_name || 'free') : 'free';
  const userRank = PLAN_RANK[userPlan] ?? 0;
  const isPro = userRank >= 2;

  const isBasicOrAbove = userRank >= PLAN_RANK.basic;

  const handleOverlayToggle = (type) => {
    if (type === 'school' && !isBasicOrAbove) { navigate('/subscription'); return; }
    if (type === 'subway' && !isPro) { navigate('/subscription'); return; }
    toggleOverlay(type);
  };

  const handleTradeTypeChange = (type) => {
    setFilters({ tradeType: type });
  };

  const handlePriceChange = (index, value) => {
    const newRange = [...filters.priceRange];
    newRange[index] = Number(value);
    setFilters({ priceRange: newRange });
  };

  const handlePeriodChange = (period, minPlan) => {
    const requiredRank = PLAN_RANK[minPlan] ?? 0;
    if (userRank < requiredRank) { navigate('/subscription'); return; }
    setFilters({ period });
  };

  const handleAreaPreset = (range) => {
    setFilters({ areaRange: range });
  };

  const isBasicPlus = userRank >= PLAN_RANK.basic;

  const handleProFilter = (key, value) => {
    if (!isPro) { navigate('/subscription'); return; }
    setFilters({ [key]: value });
  };

  function formatPrice(value) {
    if (value >= 10000) {
      return `${Math.floor(value / 10000)}억`;
    }
    return `${value.toLocaleString()}만`;
  }

  return (
    <div className="absolute top-4 left-4 z-10">
      {/* 1행: 상가, 경매, 학교, 지하철 */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => navigate('/commercial')}
          className="bg-white/50 backdrop-blur-md rounded-lg shadow-lg px-3 py-2.5 flex items-center gap-1.5 hover:bg-white/70 transition-colors border border-white/40 text-gray-600"
        >
          <span className="text-base">🏢</span>
          <span className="text-sm font-medium">상가</span>
        </button>

        <button
          onClick={() => navigate('/auctions')}
          className="bg-white/50 backdrop-blur-md rounded-lg shadow-lg px-3 py-2.5 flex items-center gap-1.5 hover:bg-white/70 transition-colors border border-white/40 text-gray-600"
        >
          <span className="text-base">⚖️</span>
          <span className="text-sm font-medium">경매</span>
          {!isPro && <span className="text-[9px] text-violet-500 font-bold">PRO</span>}
        </button>

        <button
          onClick={() => handleOverlayToggle('school')}
          className={`rounded-lg shadow-lg px-3 py-2.5 flex items-center gap-1.5 transition-colors border backdrop-blur-md ${
            overlays.school
              ? 'bg-green-500 border-green-600 text-white shadow-green-500/30'
              : 'bg-white/50 border-white/40 text-gray-600 hover:bg-white/70'
          }`}
        >
          <span className="text-base">🏫</span>
          <span className="text-sm font-medium">학교</span>
          {!isBasicOrAbove && !overlays.school && <span className="text-[9px] text-blue-500 font-bold">BASIC+</span>}
        </button>

      </div>

      {/* 2행: 필터 버튼 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="bg-white/50 backdrop-blur-md rounded-lg shadow-lg px-4 py-2.5 flex items-center gap-2 hover:bg-white/70 transition-colors border border-white/40"
        >
          <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="text-sm font-medium text-gray-700">필터</span>
        </button>
      </div>

      {/* Filter Panel */}
      {isOpen && (
        <div className="mt-2 bg-white/55 backdrop-blur-xl rounded-xl shadow-xl border border-white/40 p-5 w-80 max-h-[calc(100vh-160px)] overflow-y-auto">
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

          {/* Area */}
          <div className="mb-5">
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              면적
            </label>
            <div className="flex flex-wrap gap-1.5">
              {AREA_PRESETS.map(({ label, range }) => {
                const isActive = filters.areaRange[0] === range[0] && filters.areaRange[1] === range[1];
                return (
                  <button
                    key={label}
                    onClick={() => handleAreaPreset(range)}
                    className={`py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Period */}
          <div className="mb-5">
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              기간
            </label>
            <div className="flex flex-wrap gap-2">
              {PERIODS.map(({ value, label, minPlan }) => {
                const locked = userRank < (PLAN_RANK[minPlan] ?? 0);
                return (
                  <button
                    key={value}
                    onClick={() => handlePeriodChange(value, minPlan)}
                    className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                      filters.period === value
                        ? 'bg-primary-600 text-white'
                        : locked
                        ? 'bg-gray-50 text-gray-400'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                    {locked && <span className="ml-1 text-[8px] text-violet-500 font-bold">{minPlan === 'pro' ? 'PRO' : 'BASIC+'}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* PRO Filters Divider */}
          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center gap-1.5 mb-4">
              <span className="text-xs font-bold text-gray-800">고급 필터</span>
              {!isPro && <span className="text-[9px] text-violet-500 font-bold">PRO</span>}
            </div>

            {/* Build Year */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">건축년도</label>
              <div className="flex flex-wrap gap-1.5">
                {BUILD_YEAR_PRESETS.map(({ label, range }) => {
                  const isActive = filters.buildYearRange[0] === range[0] && filters.buildYearRange[1] === range[1];
                  return (
                    <button
                      key={label}
                      onClick={() => handleProFilter('buildYearRange', range)}
                      className={`py-1 px-2 rounded-md text-[11px] font-medium transition-colors ${
                        isActive
                          ? 'bg-violet-600 text-white'
                          : !isPro
                          ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Floor */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">층수</label>
              <div className="flex flex-wrap gap-1.5">
                {FLOOR_PRESETS.map(({ label, range }) => {
                  const isActive = filters.floorRange[0] === range[0] && filters.floorRange[1] === range[1];
                  return (
                    <button
                      key={label}
                      onClick={() => handleProFilter('floorRange', range)}
                      className={`py-1 px-2 rounded-md text-[11px] font-medium transition-colors ${
                        isActive
                          ? 'bg-violet-600 text-white'
                          : !isPro
                          ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Units */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">세대수</label>
              <div className="flex flex-wrap gap-1.5">
                {UNITS_PRESETS.map(({ label, value }) => {
                  const isActive = filters.minUnits === value;
                  return (
                    <button
                      key={label}
                      onClick={() => handleProFilter('minUnits', value)}
                      className={`py-1 px-2 rounded-md text-[11px] font-medium transition-colors ${
                        isActive
                          ? 'bg-violet-600 text-white'
                          : !isPro
                          ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Trade Activity */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">거래 활성도</label>
              <div className="flex flex-wrap gap-1.5">
                {TRADE_COUNT_PRESETS.map(({ label, value }) => {
                  const isActive = filters.minTradeCount === value;
                  return (
                    <button
                      key={label}
                      onClick={() => handleProFilter('minTradeCount', value)}
                      className={`py-1 px-2 rounded-md text-[11px] font-medium transition-colors ${
                        isActive
                          ? 'bg-violet-600 text-white'
                          : !isPro
                          ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
