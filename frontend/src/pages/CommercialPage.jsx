import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCommercialStats } from '../api/commercial';

const PROPERTY_TYPES = [
  { value: 'all', label: '전체' },
  { value: 'commercial', label: '상가' },
  { value: 'officetel', label: '오피스텔' },
];

export default function CommercialPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCommercialStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 py-10">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-2xl font-bold text-white mb-2">상가/오피스텔 실거래가</h1>
          <p className="text-slate-400">서울 지역 상업용 부동산 거래 정보</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-5 pb-16">
        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
            <p className="text-xs text-gray-500">등록 물건</p>
            <p className="text-2xl font-extrabold text-gray-900 mt-1">
              {loading ? '-' : (stats?.total_properties || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
            <p className="text-xs text-gray-500">상가</p>
            <p className="text-2xl font-extrabold text-orange-600 mt-1">
              {loading ? '-' : (stats?.commercial_count || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
            <p className="text-xs text-gray-500">오피스텔</p>
            <p className="text-2xl font-extrabold text-blue-600 mt-1">
              {loading ? '-' : (stats?.officetel_count || 0).toLocaleString()}
            </p>
          </div>
        </div>

        {/* 안내 */}
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            {parseInt(stats?.total_trades || 0) > 0
              ? '상가/오피스텔 거래 데이터가 수집되고 있습니다'
              : '데이터 수집 준비 중입니다'
            }
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            국토교통부 실거래가 API를 통해 매일 자동으로 업데이트됩니다
          </p>
          <p className="text-xs text-gray-400">
            수집 대상: 서울 25개 구 · 상업업무용 부동산 + 오피스텔 · 매매/전월세
          </p>
          <div className="mt-6">
            <button
              onClick={() => navigate('/')}
              className="bg-gray-900 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
            >
              지도에서 검색하기
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          데이터 출처: 국토교통부 실거래가 공개시스템 · 매일 새벽 2:30 자동 업데이트
        </p>
      </div>
    </div>
  );
}
