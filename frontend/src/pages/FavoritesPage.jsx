import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFavorites, removeFavorite } from '../api/favorites';
import LoadingSpinner from '../components/Common/LoadingSpinner';
import useAuthStore from '../stores/useAuthStore';

function formatPrice(price) {
  if (!price) return '-';
  if (price >= 10000) {
    const eok = Math.floor(price / 10000);
    const remainder = price % 10000;
    return remainder > 0 ? `${eok}억 ${remainder.toLocaleString()}` : `${eok}억`;
  }
  return `${price.toLocaleString()}만`;
}

export default function FavoritesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();

  const { data: favorites, isLoading } = useQuery({
    queryKey: ['favorites'],
    queryFn: getFavorites,
    enabled: isAuthenticated,
  });

  const removeMutation = useMutation({
    mutationFn: removeFavorite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorites'] }),
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center bg-gray-50">
        <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
        <p className="text-gray-500 text-lg mb-4">로그인이 필요합니다</p>
        <Link
          to="/login"
          className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium text-sm transition-colors"
        >
          로그인하기
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" text="관심 아파트 로딩중..." />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">관심 아파트</h1>
        <p className="text-sm text-gray-500 mb-6">
          {favorites?.length || 0}개의 관심 아파트
        </p>

        {favorites?.length > 0 ? (
          <div className="space-y-3">
            {favorites.map((fav) => (
              <div
                key={fav.id || fav.apartmentId}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <Link
                    to={`/apartment/${fav.apartmentId || fav.id}`}
                    className="flex-1 min-w-0"
                  >
                    <h3 className="text-base font-semibold text-gray-900 hover:text-primary-600 transition-colors">
                      {fav.name || fav.apartmentName}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1 truncate">
                      {fav.address}
                    </p>
                    <div className="flex items-center gap-4 mt-2">
                      {fav.buildYear && (
                        <span className="text-xs text-gray-400">
                          {fav.buildYear}년 건축
                        </span>
                      )}
                      {fav.totalUnits && (
                        <span className="text-xs text-gray-400">
                          {fav.totalUnits}세대
                        </span>
                      )}
                    </div>
                    <div className="mt-3">
                      <span className="text-lg font-bold text-primary-600">
                        {formatPrice(fav.latestPrice)}
                      </span>
                      <span className="text-sm text-gray-400 ml-1">만원</span>
                    </div>
                  </Link>

                  <button
                    onClick={() => removeMutation.mutate(fav.apartmentId || fav.id)}
                    className="p-2 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 ml-3"
                    title="관심 해제"
                  >
                    <svg className="w-5 h-5" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <p className="text-gray-500 text-lg mb-2">관심 아파트가 없습니다</p>
            <p className="text-gray-400 text-sm mb-6">
              지도에서 아파트를 찾아 관심 등록해보세요
            </p>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium text-sm transition-colors"
            >
              지도로 이동
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
