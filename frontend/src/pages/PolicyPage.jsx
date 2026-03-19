import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPolicyList, getPolicyCategories } from '../api/policy';
import useAuthStore from '../stores/useAuthStore';
import dayjs from 'dayjs';

const SOURCE_LABELS = {
  molit: '국토교통부',
};

// 카테고리별 색상
const CATEGORY_COLORS = {
  '주택토지': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  '건설': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  '부동산': { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  '도로철도': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  '모빌리티자동차': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  '항공': { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  '물류': { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  '일반': { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
};

function getCategoryStyle(cat) {
  return CATEGORY_COLORS[cat] || CATEGORY_COLORS['일반'];
}

const ALLOWED_PLANS = ['basic', 'pro'];

export default function PolicyPage() {
  const { isAuthenticated, user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState('');

  const userPlan = user?.subscription?.plan_name || 'free';
  const hasAccess = isAuthenticated && ALLOWED_PLANS.includes(userPlan);

  const { data: catData } = useQuery({
    queryKey: ['policyCategories'],
    queryFn: getPolicyCategories,
    enabled: hasAccess,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['policy', page, selectedCategory],
    queryFn: () => getPolicyList({ page, limit: 15, category: selectedCategory }),
    enabled: hasAccess,
  });

  const items = data?.data || [];
  const pagination = data?.pagination || {};
  const categories = catData?.categories || [];

  if (!hasAccess) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gray-50">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
          <div className="max-w-5xl mx-auto px-4 py-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">정책 발표</h1>
                <p className="text-sm text-slate-400">국토교통부 보도자료</p>
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-2xl border border-gray-200 p-10">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">베이직 플랜 이상 전용 기능</h2>
            <p className="text-gray-500 mb-6">
              정부 정책 발표 열람은 <span className="font-semibold text-primary-600">베이직</span> 또는 <span className="font-semibold text-primary-600">프로</span> 플랜에서 이용할 수 있습니다.
            </p>
            {!isAuthenticated ? (
              <div className="flex justify-center gap-3">
                <Link to="/login" className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">로그인</Link>
                <Link to="/subscription" className="px-6 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">플랜 보기</Link>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-gray-400">현재 플랜: <span className="font-medium text-gray-600">{user?.subscription?.plan_display_name || '무료'}</span></p>
                <Link to="/subscription" className="px-6 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">플랜 업그레이드</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      {/* 히어로 */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
        <div className="max-w-5xl mx-auto px-4 py-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">정책 발표</h1>
              <p className="text-sm text-slate-400">국토교통부 보도자료</p>
            </div>
          </div>

          {/* 카테고리 필터 */}
          <div className="flex flex-wrap gap-2 mt-5">
            <button
              onClick={() => { setSelectedCategory(''); setPage(1); }}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                !selectedCategory
                  ? 'bg-white text-slate-900 shadow-md'
                  : 'bg-white/10 text-slate-300 hover:bg-white/20'
              }`}
            >
              전체 {pagination.total ? `(${pagination.total})` : ''}
            </button>
            {categories.map((cat) => (
              <button
                key={cat.category}
                onClick={() => { setSelectedCategory(cat.category); setPage(1); }}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                  selectedCategory === cat.category
                    ? 'bg-white text-slate-900 shadow-md'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                {cat.category} ({cat.count})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 목록 */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-3 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : items.length > 0 ? (
          <div className="space-y-3">
            {items.map((item) => {
              const catStyle = getCategoryStyle(item.category);
              const isRecent = dayjs().diff(dayjs(item.published_at), 'day') <= 3;

              return (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all group"
                >
                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* 카테고리 + 날짜 */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${catStyle.bg} ${catStyle.text}`}>
                            {item.category || '기타'}
                          </span>
                          <span className="text-xs text-gray-400">
                            {dayjs(item.published_at).format('YYYY.MM.DD')}
                          </span>
                          {isRecent && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white">
                              NEW
                            </span>
                          )}
                        </div>

                        {/* 제목 */}
                        <h3 className="text-[15px] font-semibold text-gray-900 group-hover:text-primary-600 transition-colors leading-snug line-clamp-2">
                          {item.title}
                        </h3>

                        {/* 출처 + 조회수 */}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-gray-400">
                            {SOURCE_LABELS[item.source] || item.source}
                          </span>
                          {item.views > 0 && (
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              {item.views.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 화살표 */}
                      <svg className="w-5 h-5 text-gray-300 group-hover:text-primary-500 transition-colors flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-20 text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
            <p>정책 발표가 없습니다</p>
          </div>
        )}

        {/* 페이지네이션 */}
        {pagination.totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-8">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => {
              let pageNum;
              if (pagination.totalPages <= 7) {
                pageNum = i + 1;
              } else if (page <= 4) {
                pageNum = i + 1;
              } else if (page >= pagination.totalPages - 3) {
                pageNum = pagination.totalPages - 6 + i;
              } else {
                pageNum = page - 3 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                    page === pageNum
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
              className="px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
