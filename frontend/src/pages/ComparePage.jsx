import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Filler, Title, Tooltip, Legend,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import useCompareStore from '../stores/useCompareStore';
import useAuthStore from '../stores/useAuthStore';
import { compareApartments, searchApartments } from '../api/apartments';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Title, Tooltip, Legend);

function formatPrice(value) {
  if (!value) return '-';
  const num = Number(value);
  if (num >= 10000) {
    const eok = Math.floor(num / 10000);
    const rem = num % 10000;
    return rem > 0 ? `${eok}억 ${rem.toLocaleString()}` : `${eok}억`;
  }
  return `${num.toLocaleString()}만`;
}

function formatArea(area) {
  if (!area) return '-';
  return `${(Number(area) / 3.306).toFixed(0)}평 (${Number(area).toFixed(1)}㎡)`;
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

const TRADE_TYPE_LABEL = { sale: '매매', jeonse: '전세', monthly: '월세' };
const TRADE_TYPE_COLOR = { sale: '#3b82f6', jeonse: '#22c55e', monthly: '#f59e0b' };
const CHART_COLORS = ['#2563eb', '#ef4444', '#22c55e'];
const ALLOWED_PLANS = ['basic', 'pro'];

export default function ComparePage() {
  const { apartments: selected, addApartment, removeApartment, clearAll } = useCompareStore();
  const { isAuthenticated, user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [planError, setPlanError] = useState(false);
  const [tradeType, setTradeType] = useState('sale');

  const userPlan = user?.subscription?.plan_name || 'free';
  const hasAccess = isAuthenticated && ALLOWED_PLANS.includes(userPlan);

  const ids = selected.map((a) => a.id);

  const { data: compareData, error: compareError } = useQuery({
    queryKey: ['compare', ids, tradeType],
    queryFn: () => compareApartments(ids, tradeType),
    enabled: ids.length >= 2 && hasAccess,
    retry: false,
    meta: {
      onError: (err) => {
        if (err.response?.status === 403) setPlanError(true);
      },
    },
  });

  const tradeTypeLabel = TRADE_TYPE_LABEL[tradeType] || '매매';
  const priceLabel = tradeType === 'sale' ? '매매가' : tradeType === 'jeonse' ? '전세가' : '보증금';

  if (compareError?.response?.status === 403 && !planError) {
    setPlanError(true);
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchApartments(searchQuery);
      setSearchResults(results);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  };

  const handleAdd = (apt) => {
    addApartment({ id: apt.id, name: apt.name, address: apt.address });
    setSearchResults([]);
    setSearchQuery('');
  };

  // 월별 평균가 차트
  const priceChartData = (() => {
    if (!compareData?.apartments) return null;
    const allMonths = new Set();
    compareData.apartments.forEach((apt) =>
      apt.monthlyStats.forEach((s) => allMonths.add(s.month))
    );
    const labels = [...allMonths].sort();
    return {
      labels,
      datasets: compareData.apartments.map((apt, i) => {
        const priceMap = {};
        apt.monthlyStats.forEach((s) => { priceMap[s.month] = s.avg_price; });
        return {
          label: apt.name,
          data: labels.map((m) => priceMap[m] || null),
          borderColor: CHART_COLORS[i],
          backgroundColor: CHART_COLORS[i] + '15',
          tension: 0.3,
          pointRadius: 2,
          spanGaps: true,
          fill: true,
        };
      }),
    };
  })();

  // 월별 거래량 차트
  const volumeChartData = (() => {
    if (!compareData?.apartments) return null;
    const allMonths = new Set();
    compareData.apartments.forEach((apt) =>
      apt.monthlyStats.forEach((s) => allMonths.add(s.month))
    );
    const labels = [...allMonths].sort();
    return {
      labels,
      datasets: compareData.apartments.map((apt, i) => {
        const countMap = {};
        apt.monthlyStats.forEach((s) => { countMap[s.month] = s.trade_count; });
        return {
          label: apt.name,
          data: labels.map((m) => countMap[m] || 0),
          backgroundColor: CHART_COLORS[i] + '80',
          borderColor: CHART_COLORS[i],
          borderWidth: 1,
          borderRadius: 3,
        };
      }),
    };
  })();

  // 구독 필요 안내
  if (!isAuthenticated || !hasAccess) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">단지 비교</h1>
        <p className="text-gray-500 mb-8">최대 3개 아파트를 선택하여 비교할 수 있습니다.</p>

        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center max-w-lg mx-auto">
          <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">베이직 플랜 이상 전용 기능</h2>
          <p className="text-gray-500 mb-6">
            단지 비교 기능은 <span className="font-semibold text-primary-600">베이직</span> 또는 <span className="font-semibold text-primary-600">프로</span> 플랜에서 이용할 수 있습니다.
          </p>

          {!isAuthenticated ? (
            <div className="flex justify-center gap-3">
              <Link to="/login" className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
                로그인
              </Link>
              <Link to="/subscription" className="px-6 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">
                플랜 보기
              </Link>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-gray-400">
                현재 플랜: <span className="font-medium text-gray-600">{user?.subscription?.plan_display_name || '무료'}</span>
              </p>
              <Link to="/subscription" className="px-6 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">
                플랜 업그레이드
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  const apts = compareData?.apartments || [];

  // 비교 행 정의
  const compareRows = [
    {
      section: '가격 정보',
      rows: [
        {
          label: `최근 ${priceLabel}`,
          render: (apt) => (
            <div>
              <span className="font-bold text-gray-900">{formatPrice(apt.latestPrice)}</span>
              {apt.latestArea && <div className="text-[10px] text-gray-400">{(Number(apt.latestArea) / 3.306).toFixed(0)}평 / {formatDate(apt.latestTradeDate)}</div>}
            </div>
          ),
        },
        {
          label: `${priceLabel} 범위`,
          sub: '전체 기간',
          render: (apt) => {
            if (!apt.minPriceAll || !apt.maxPriceAll) return '-';
            return <span className="text-xs">{formatPrice(apt.minPriceAll)} ~ {formatPrice(apt.maxPriceAll)}</span>;
          },
        },
        { label: '평당가', render: (apt) => <span className="font-semibold text-gray-900">{apt.pricePerPyeong ? formatPrice(apt.pricePerPyeong) : '-'}</span> },
        { label: `1년 평균 ${priceLabel}`, render: (apt) => formatPrice(apt.avgPrice1y) },
        { label: `1년 최고 ${priceLabel}`, render: (apt) => <span className="text-red-600">{formatPrice(apt.maxPrice1y)}</span> },
        { label: `1년 최저 ${priceLabel}`, render: (apt) => <span className="text-blue-600">{formatPrice(apt.minPrice1y)}</span> },
        {
          label: '가격 변동률',
          sub: '최근3개월 vs 1년전',
          render: (apt) => {
            if (apt.priceChangeRate == null) return <span className="text-gray-400">-</span>;
            const isUp = apt.priceChangeRate > 0;
            const isDown = apt.priceChangeRate < 0;
            return (
              <span className={`font-bold ${isUp ? 'text-red-600' : isDown ? 'text-blue-600' : 'text-gray-600'}`}>
                {isUp ? '+' : ''}{apt.priceChangeRate}%
              </span>
            );
          },
        },
      ],
    },
    {
      section: '단지 정보',
      rows: [
        { label: '주소', render: (apt) => <span className="text-xs leading-tight">{apt.roadAddress || apt.address || '-'}</span> },
        { label: '건축년도', render: (apt) => apt.buildYear ? `${apt.buildYear}년 (${new Date().getFullYear() - apt.buildYear}년차)` : '-' },
        { label: '총 세대수', render: (apt) => apt.totalUnits ? `${apt.totalUnits.toLocaleString()}세대` : '-' },
        { label: '동 수', render: (apt) => apt.dongCount ? `${apt.dongCount}개동` : '-' },
        { label: '최고 층수', render: (apt) => apt.maxFloor ? `${apt.maxFloor}층` : '-' },
        { label: '평균 면적', render: (apt) => formatArea(apt.avgArea) },
      ],
    },
    {
      section: '거래 정보',
      rows: [
        { label: '총 거래 건수', render: (apt) => `${(apt.tradeCount || 0).toLocaleString()}건` },
        { label: '최근 1년 거래', render: (apt) => `${(apt.tradeCount1y || 0).toLocaleString()}건` },
        { label: '최근 거래일', render: (apt) => formatDate(apt.latestTradeDate) },
        { label: '최근 거래 층', render: (apt) => apt.latestFloor ? `${apt.latestFloor}층` : '-' },
        {
          label: '거래 유형 분포',
          render: (apt) => {
            const dist = apt.tradeTypeDistribution || {};
            const total = Object.values(dist).reduce((s, v) => s + v, 0) || 1;
            return (
              <div className="flex flex-col gap-1">
                <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
                  {Object.entries(TRADE_TYPE_COLOR).map(([type, color]) => {
                    const pct = ((dist[type] || 0) / total) * 100;
                    if (pct === 0) return null;
                    return <div key={type} style={{ width: `${pct}%`, backgroundColor: color }} />;
                  })}
                </div>
                <div className="flex gap-2 text-[10px] text-gray-500">
                  {Object.entries(dist).map(([type, count]) => (
                    <span key={type}>
                      <span className="inline-block w-1.5 h-1.5 rounded-full mr-0.5" style={{ backgroundColor: TRADE_TYPE_COLOR[type] }} />
                      {TRADE_TYPE_LABEL[type] || type} {count}
                    </span>
                  ))}
                </div>
              </div>
            );
          },
        },
      ],
    },
  ];

  // 최고값 하이라이트 유틸
  function getBestIdx(field, mode = 'max') {
    if (!apts.length) return -1;
    const vals = apts.map((a) => Number(a[field]) || 0);
    if (vals.every((v) => v === 0)) return -1;
    const best = mode === 'max' ? Math.max(...vals) : Math.min(...vals);
    return vals.indexOf(best);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">단지 비교</h1>
      <p className="text-gray-500 mb-6">최대 3개 아파트를 선택하여 비교할 수 있습니다.</p>

      {/* 검색 */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="아파트 이름으로 검색"
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
        <button
          onClick={handleSearch}
          disabled={searching || selected.length >= 3}
          className="px-5 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:bg-gray-300"
        >
          {searching ? '검색 중...' : '검색'}
        </button>
      </div>

      {/* 검색 결과 */}
      {searchResults.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 mb-6 max-h-48 overflow-y-auto">
          {searchResults.map((apt) => (
            <button
              key={apt.id}
              onClick={() => handleAdd(apt)}
              disabled={selected.some((s) => s.id === apt.id) || selected.length >= 3}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 disabled:opacity-50"
            >
              <div className="text-sm font-medium text-gray-900">{apt.name}</div>
              <div className="text-xs text-gray-500">{apt.address}</div>
            </button>
          ))}
        </div>
      )}

      {/* 선택된 아파트 태그 */}
      <div className="flex flex-wrap gap-2 mb-6">
        {selected.map((apt, i) => (
          <div
            key={apt.id}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
            style={{ backgroundColor: CHART_COLORS[i] + '20', color: CHART_COLORS[i], border: `1px solid ${CHART_COLORS[i]}40` }}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i] }} />
            {apt.name}
            <button onClick={() => removeApartment(apt.id)} className="ml-1 hover:opacity-70">
              &times;
            </button>
          </div>
        ))}
        {selected.length > 0 && (
          <button onClick={clearAll} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">
            전체 삭제
          </button>
        )}
      </div>

      {/* 거래유형 필터 */}
      {ids.length >= 2 && (
        <div className="flex items-center gap-2 mb-6">
          <span className="text-sm font-medium text-gray-600">거래유형</span>
          {[
            { key: 'sale', label: '매매', color: '#3b82f6' },
            { key: 'jeonse', label: '전세', color: '#22c55e' },
            { key: 'monthly', label: '월세', color: '#f59e0b' },
          ].map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setTradeType(key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tradeType === key
                  ? 'text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={tradeType === key ? { backgroundColor: color } : {}}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* 비교 결과 */}
      {apts.length >= 2 && (
        <div className="space-y-6">

          {/* === 요약 카드 === */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {apts.map((apt, i) => (
              <div key={apt.id} className="bg-white rounded-xl border-2 p-5" style={{ borderColor: CHART_COLORS[i] + '40' }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i] }} />
                  <h3 className="font-bold text-gray-900 truncate">{apt.name}</h3>
                </div>
                <p className="text-2xl font-extrabold mb-1" style={{ color: CHART_COLORS[i] }}>
                  {apt.maxPriceAll ? `${formatPrice(apt.minPriceAll)} ~ ${formatPrice(apt.maxPriceAll)}` : formatPrice(apt.latestPrice)}
                </p>
                <p className="text-xs text-gray-400 mb-0.5">
                  {tradeTypeLabel} {tradeType === 'sale' ? '실거래가' : ''} 범위
                  {apt.latestArea && <span className="ml-1">(최근 {(Number(apt.latestArea) / 3.306).toFixed(0)}평 {formatPrice(apt.latestPrice)})</span>}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {apt.pricePerPyeong && <span>평당 {formatPrice(apt.pricePerPyeong)}</span>}
                  {apt.priceChangeRate != null && (
                    <span className={`font-bold ${apt.priceChangeRate > 0 ? 'text-red-500' : apt.priceChangeRate < 0 ? 'text-blue-500' : 'text-gray-500'}`}>
                      {apt.priceChangeRate > 0 ? '+' : ''}{apt.priceChangeRate}%
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <span className="text-gray-500">건축</span>
                    <p className="font-semibold text-gray-900">{apt.buildYear || '-'}년</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <span className="text-gray-500">세대수</span>
                    <p className="font-semibold text-gray-900">{apt.totalUnits?.toLocaleString() || '-'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <span className="text-gray-500">1년 거래</span>
                    <p className="font-semibold text-gray-900">{apt.tradeCount1y || 0}건</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <span className="text-gray-500">평균면적</span>
                    <p className="font-semibold text-gray-900">{apt.avgArea ? `${(apt.avgArea / 3.306).toFixed(0)}평` : '-'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* === 상세 비교 테이블 === */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[540px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-600 w-36">항목</th>
                    {apts.map((apt, i) => (
                      <th key={apt.id} className="text-center px-4 py-3 font-medium" style={{ color: CHART_COLORS[i] }}>
                        <Link to={`/apartment/${apt.id}`} className="hover:underline">{apt.name}</Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compareRows.map((section) => (
                    <>
                      <tr key={section.section} className="bg-gray-50/50">
                        <td colSpan={apts.length + 1} className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                          {section.section}
                        </td>
                      </tr>
                      {section.rows.map((row) => (
                        <tr key={row.label} className="border-b border-gray-100 hover:bg-gray-50/50">
                          <td className="px-4 py-2.5 text-gray-600">
                            <div>{row.label}</div>
                            {row.sub && <div className="text-[10px] text-gray-400">{row.sub}</div>}
                          </td>
                          {apts.map((apt) => (
                            <td key={apt.id} className="px-4 py-2.5 text-center text-gray-900">
                              {row.render(apt)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* === 차트 영역 === */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 월별 평균가 차트 */}
            {priceChartData && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
                <h3 className="text-sm font-bold text-gray-800 mb-4">월별 {tradeTypeLabel} 평균가 추이</h3>
                <div className="h-56 md:h-64">
                  <Line
                    data={priceChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      interaction: { mode: 'index', intersect: false },
                      plugins: {
                        tooltip: {
                          backgroundColor: '#1e293b',
                          padding: 12,
                          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatPrice(ctx.raw)}` },
                        },
                        legend: { labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } },
                      },
                      scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } },
                        y: { grid: { color: '#f3f4f6' }, ticks: { callback: (v) => formatPrice(v), font: { size: 10 } } },
                      },
                    }}
                  />
                </div>
              </div>
            )}

            {/* 월별 거래량 차트 */}
            {volumeChartData && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
                <h3 className="text-sm font-bold text-gray-800 mb-4">월별 {tradeTypeLabel} 거래량 추이</h3>
                <div className="h-56 md:h-64">
                  <Bar
                    data={volumeChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      interaction: { mode: 'index', intersect: false },
                      plugins: {
                        tooltip: {
                          backgroundColor: '#1e293b',
                          padding: 12,
                          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}건` },
                        },
                        legend: { labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } },
                      },
                      scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } },
                        y: { grid: { color: '#f3f4f6' }, ticks: { font: { size: 10 }, stepSize: 1 } },
                      },
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* === 면적 타입별 매매가 === */}
          {apts.some((apt) => apt.areaTypes?.length > 0) && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200">
                <h3 className="text-sm font-bold text-gray-900">면적 타입별 최근 {tradeTypeLabel} {tradeType === 'sale' ? '실거래가' : '가격'}</h3>
                <p className="text-xs text-gray-400 mt-0.5">같은 단지라도 면적에 따라 가격이 크게 다릅니다</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">단지</th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-600">면적</th>
                      <th className="text-right px-3 py-2.5 font-medium text-gray-600">{priceLabel}</th>
                      <th className="text-right px-3 py-2.5 font-medium text-gray-600">평당가</th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-600">층</th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-600">거래일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apts.flatMap((apt, aptIdx) =>
                      (apt.areaTypes || []).map((at, tIdx) => {
                        const pyeong = (at.area / 3.306).toFixed(0);
                        const ppp = Math.round(at.price / (at.area / 3.306));
                        return (
                          <tr key={`${apt.id}-${tIdx}`} className="border-b border-gray-100 hover:bg-gray-50">
                            {tIdx === 0 ? (
                              <td
                                className="px-4 py-2 font-medium align-top"
                                style={{ color: CHART_COLORS[aptIdx] }}
                                rowSpan={apt.areaTypes.length}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[aptIdx] }} />
                                  {apt.name}
                                </div>
                              </td>
                            ) : null}
                            <td className="px-3 py-2 text-center text-gray-700">
                              <span className="font-semibold">{pyeong}평</span>
                              <span className="text-[10px] text-gray-400 ml-1">({at.area.toFixed(1)}㎡)</span>
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-gray-900">{formatPrice(at.price)}</td>
                            <td className="px-3 py-2 text-right text-gray-600 text-xs">{formatPrice(ppp)}/평</td>
                            <td className="px-3 py-2 text-center text-gray-600">{at.floor || '-'}층</td>
                            <td className="px-3 py-2 text-center text-gray-500 text-xs">{formatDate(at.tradeDate)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* === 최근 거래 내역 === */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="text-sm font-bold text-gray-900">최근 {tradeTypeLabel} 거래 내역 (각 최근 5건)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">단지</th>
                    <th className="text-center px-3 py-2.5 font-medium text-gray-600">거래일</th>
                    <th className="text-center px-3 py-2.5 font-medium text-gray-600">유형</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-600">가격</th>
                    <th className="text-center px-3 py-2.5 font-medium text-gray-600">면적</th>
                    <th className="text-center px-3 py-2.5 font-medium text-gray-600">층</th>
                  </tr>
                </thead>
                <tbody>
                  {apts.flatMap((apt, aptIdx) =>
                    (apt.recentTrades || []).map((trade, tIdx) => (
                      <tr key={`${apt.id}-${tIdx}`} className="border-b border-gray-100 hover:bg-gray-50">
                        {tIdx === 0 ? (
                          <td
                            className="px-4 py-2 font-medium align-top"
                            style={{ color: CHART_COLORS[aptIdx] }}
                            rowSpan={apt.recentTrades.length}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[aptIdx] }} />
                              {apt.name}
                            </div>
                          </td>
                        ) : null}
                        <td className="px-3 py-2 text-center text-gray-700 text-xs">{formatDate(trade.tradeDate)}</td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: (TRADE_TYPE_COLOR[trade.tradeType] || '#6b7280') + '20',
                              color: TRADE_TYPE_COLOR[trade.tradeType] || '#6b7280',
                            }}
                          >
                            {TRADE_TYPE_LABEL[trade.tradeType] || trade.tradeType}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">{formatPrice(trade.price)}</td>
                        <td className="px-3 py-2 text-center text-gray-600 text-xs">
                          {trade.area ? `${(trade.area / 3.306).toFixed(0)}평` : '-'}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-600">{trade.floor || '-'}층</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {ids.length < 2 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">아파트를 2개 이상 선택해주세요</p>
          <p className="text-sm">검색으로 아파트를 추가할 수 있습니다</p>
        </div>
      )}
    </div>
  );
}
