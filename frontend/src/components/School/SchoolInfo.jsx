import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getSchoolsForApartment } from '../../api/schools';
import useAuthStore from '../../stores/useAuthStore';

const SCHOOL_TYPES = [
  { key: '초등학교', icon: '🏫', color: 'green' },
  { key: '중학교', icon: '📚', color: 'blue' },
  { key: '고등학교', icon: '🎓', color: 'purple' },
];

function formatDistance(meters) {
  if (!meters) return '-';
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function WalkTime({ distance }) {
  if (!distance) return null;
  const minutes = Math.round(distance / 67); // 평균 보행속도 약 4km/h
  return (
    <span className="text-[11px] text-gray-400">
      도보 {minutes}분
    </span>
  );
}

export default function SchoolInfo({ apartmentId }) {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const userPlan = user?.subscription?.plan_name || 'free';
  const canView = isAuthenticated && ['basic', 'pro'].includes(userPlan);

  const { data, isLoading } = useQuery({
    queryKey: ['schools', apartmentId],
    queryFn: () => getSchoolsForApartment(apartmentId),
    staleTime: 60 * 60 * 1000, // 1시간
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">학군 정보</h3>
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const schools = data?.schools || {};
  const summary = data?.summary || {};
  const totalCount = data?.totalCount || 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* 헤더 */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-gray-800">학군 정보</h3>
          {!canView && (
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              BASIC+
            </span>
          )}
        </div>
        {totalCount > 0 && (
          <span className="text-xs text-gray-400">반경 2km 내 {totalCount}개교</span>
        )}
      </div>

      <div className="relative">
        {/* 요약 카드 — 항상 표시 */}
        <div className="px-6 py-4 grid grid-cols-3 gap-3">
          {SCHOOL_TYPES.map(({ key, icon, color }) => {
            const info = summary[key];
            return (
              <div key={key} className={`bg-${color}-50 rounded-xl p-3 text-center`}>
                <span className="text-2xl">{icon}</span>
                <p className="text-xs font-semibold text-gray-700 mt-1">{key}</p>
                {info ? (
                  <>
                    <p className="text-[11px] text-gray-500 mt-1 truncate">{info.nearest}</p>
                    <p className={`text-sm font-bold text-${color}-600 mt-0.5`}>
                      {formatDistance(info.distance)}
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] text-gray-400 mt-1">정보 없음</p>
                )}
              </div>
            );
          })}
        </div>

        {/* 상세 목록 */}
        <div className={`px-6 pb-5 ${!canView ? 'relative' : ''}`}>
          {SCHOOL_TYPES.map(({ key, icon, color }) => {
            const list = schools[key] || [];
            if (list.length === 0) return null;
            return (
              <div key={key} className="mb-4 last:mb-0">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-sm">{icon}</span>
                  <h4 className="text-sm font-semibold text-gray-700">{key}</h4>
                  <span className="text-[11px] text-gray-400">{list.length}개교</span>
                </div>
                <div className="space-y-1.5">
                  {list.map((school, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{school.name}</p>
                        <p className="text-[11px] text-gray-400 truncate">{school.address}</p>
                      </div>
                      <div className="flex flex-col items-end ml-3 flex-shrink-0">
                        <span className={`text-sm font-bold text-${color}-600`}>
                          {formatDistance(school.distance)}
                        </span>
                        <WalkTime distance={school.distance} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {totalCount === 0 && (
            <div className="text-center py-6 text-sm text-gray-400">
              반경 2km 내 학교 정보가 없습니다
            </div>
          )}

          {/* Free 사용자: 블러 오버레이 */}
          {!canView && totalCount > 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm">
              <div className="text-center px-6">
                <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-800 mb-1">
                  학군 상세 정보는 베이직 플랜부터
                </p>
                <p className="text-xs text-gray-500 mb-4">
                  가까운 학교 거리, 도보 시간 등 상세 정보를 확인하세요
                </p>
                <button
                  onClick={() => navigate('/subscription')}
                  className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all"
                >
                  플랜 업그레이드
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
