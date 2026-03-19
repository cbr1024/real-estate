import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getColumns, getColumn } from '../api/columns';
import useAuthStore from '../stores/useAuthStore';
import dayjs from 'dayjs';

export default function ColumnsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, user } = useAuthStore();
  const userPlan = user?.subscription?.plan_name || 'free';
  const [columns, setColumns] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);

  // 상세
  const [selectedColumn, setSelectedColumn] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const currentCategory = searchParams.get('category') || '';
  const currentPage = parseInt(searchParams.get('page'), 10) || 1;

  useEffect(() => {
    setLoading(true);
    const params = { page: currentPage };
    if (currentCategory) params.category = currentCategory;
    getColumns(params)
      .then((data) => {
        setColumns(data.columns);
        setCategories(data.categories || []);
        setPagination(data.pagination);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentCategory, currentPage]);

  const openColumn = async (id) => {
    setDetailLoading(true);
    try {
      const data = await getColumn(id);
      setSelectedColumn(data.column);
    } catch (_) {}
    setDetailLoading(false);
  };

  const handleCategoryChange = (cat) => {
    setSearchParams(cat ? { category: cat } : {});
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 py-10">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-2xl font-bold text-white mb-2">전문가 칼럼</h1>
          <p className="text-slate-400">부동산 전문가의 시장 분석과 투자 인사이트</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-5 pb-16">
        {/* 카테고리 필터 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 flex gap-1 overflow-x-auto mb-4">
          <button
            onClick={() => handleCategoryChange('')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              !currentCategory ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            전체
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                currentCategory === cat ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex gap-4">
          {/* 칼럼 목록 */}
          <div className={`${selectedColumn ? 'w-1/2' : 'w-full'} transition-all space-y-3`}>
            {loading ? (
              <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
                <div className="w-7 h-7 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin mx-auto" />
              </div>
            ) : columns.length > 0 ? (
              columns.map((col) => (
                <div
                  key={col.id}
                  onClick={() => openColumn(col.id)}
                  className={`bg-white rounded-xl border border-gray-200 p-5 cursor-pointer transition-all hover:shadow-md ${
                    selectedColumn?.id === col.id ? 'ring-2 ring-primary-500' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {col.category && (
                          <span className="text-[11px] font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                            {col.category}
                          </span>
                        )}
                        {col.is_premium && (
                          <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                            PRO
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-gray-900 line-clamp-2">{col.title}</h3>
                      {col.summary && (
                        <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{col.summary}</p>
                      )}
                      <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                        <div className="flex items-center gap-1">
                          <div className="w-5 h-5 bg-gray-200 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-500">
                            {col.author_name[0]}
                          </div>
                          <span className="font-medium text-gray-600">{col.author_name}</span>
                          {col.author_title && <span className="text-gray-400">· {col.author_title}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[11px] text-gray-400">{dayjs(col.published_at).format('MM.DD')}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">조회 {col.views}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-400">
                등록된 칼럼이 없습니다
              </div>
            )}
          </div>

          {/* 상세 패널 */}
          {selectedColumn && (
            <div className="w-1/2 bg-white rounded-xl border border-gray-200 overflow-hidden max-h-[calc(100vh-200px)] overflow-y-auto sticky top-4">
              {detailLoading ? (
                <div className="py-16 text-center">
                  <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin mx-auto" />
                </div>
              ) : (
                <>
                  <div className="px-6 py-5 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {selectedColumn.category && (
                          <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                            {selectedColumn.category}
                          </span>
                        )}
                        {selectedColumn.is_premium && (
                          <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">PRO</span>
                        )}
                      </div>
                      <button onClick={() => setSelectedColumn(null)} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <h2 className="text-lg font-bold text-gray-900 mb-2">{selectedColumn.title}</h2>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-500">
                        {selectedColumn.author_name[0]}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{selectedColumn.author_name}</p>
                        {selectedColumn.author_title && (
                          <p className="text-xs text-gray-400">{selectedColumn.author_title}</p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 ml-auto">
                        {dayjs(selectedColumn.published_at).format('YYYY.MM.DD')}
                      </span>
                    </div>
                  </div>

                  <div className="px-6 py-5 relative">
                    {selectedColumn.locked ? (
                      <>
                        {/* 요약 표시 */}
                        {selectedColumn.summary && (
                          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-700 leading-relaxed">{selectedColumn.summary}</p>
                          </div>
                        )}
                        {/* 잠금 오버레이 */}
                        <div className="bg-gradient-to-t from-white via-white/95 to-white/50 py-12 text-center rounded-xl border border-gray-100">
                          <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          </div>
                          <p className="text-sm font-semibold text-gray-800 mb-1">
                            {selectedColumn.lock_reason === 'pro'
                              ? '프로 플랜 전용 콘텐츠'
                              : '베이직 플랜부터 열람 가능'
                            }
                          </p>
                          <p className="text-xs text-gray-500 mb-4">
                            전문가의 심층 분석을 확인하세요
                          </p>
                          <button
                            onClick={() => navigate('/subscription')}
                            className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all"
                          >
                            플랜 업그레이드
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="prose prose-sm max-w-none">
                        <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                          {selectedColumn.content}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
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
                  onClick={() => setSearchParams({ ...(currentCategory ? { category: currentCategory } : {}), page: p })}
                  className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                    p === currentPage ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
