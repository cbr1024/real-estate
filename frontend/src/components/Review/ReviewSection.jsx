import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getReviews, createReview, deleteReview, reportReview, toggleHelpful } from '../../api/reviews';
import useAuthStore from '../../stores/useAuthStore';
import dayjs from 'dayjs';

const STAR_LABELS = ['', '별로예요', '그저 그래요', '보통이에요', '좋아요', '최고예요'];

const CATEGORIES = [
  { key: 'rating_transport', label: '교통', icon: '🚌' },
  { key: 'rating_environment', label: '환경', icon: '🌳' },
  { key: 'rating_facilities', label: '편의시설', icon: '🏪' },
  { key: 'rating_parking', label: '주차', icon: '🅿️' },
  { key: 'rating_education', label: '교육', icon: '📚' },
];

const RESIDENCE_OPTIONS = [
  { value: '', label: '선택 안 함' },
  { value: 'less_1y', label: '1년 미만' },
  { value: '1_3y', label: '1~3년' },
  { value: '3_5y', label: '3~5년' },
  { value: '5_10y', label: '5~10년' },
  { value: 'over_10y', label: '10년 이상' },
];

const RESIDENCE_LABELS = { less_1y: '1년 미만', '1_3y': '1~3년', '3_5y': '3~5년', '5_10y': '5~10년', over_10y: '10년+' };

const SORT_OPTIONS = [
  { value: 'recent', label: '최신순' },
  { value: 'helpful', label: '도움순' },
  { value: 'rating_high', label: '높은 평점' },
  { value: 'rating_low', label: '낮은 평점' },
];

function StarRating({ rating, size = 'md', onClick }) {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : size === 'xs' ? 'w-3 h-3' : 'w-6 h-6';
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onClick?.(star)}
          className={`${onClick ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-transform`}
        >
          <svg className={`${sizeClass} ${star <= rating ? 'text-yellow-400' : 'text-gray-200'}`}
            fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

function RatingBar({ label, count, total }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-6 text-gray-500 text-right">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-gray-400 text-right">{count}</span>
    </div>
  );
}

function CategoryScore({ value, label, icon }) {
  if (!value) return null;
  const v = parseFloat(value);
  const color = v >= 4 ? 'text-green-600' : v >= 3 ? 'text-yellow-600' : 'text-red-500';
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-lg">{icon}</span>
      <span className="text-[11px] text-gray-500">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{v}</span>
    </div>
  );
}

function MiniCategoryBar({ value, label }) {
  if (!value) return null;
  const pct = (value / 5) * 100;
  const color = value >= 4 ? 'bg-green-400' : value >= 3 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="w-14 text-gray-500 text-right">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-4 text-gray-500 font-medium">{value}</span>
    </div>
  );
}

export default function ReviewSection({ apartmentId }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();
  const [showForm, setShowForm] = useState(false);
  const [sort, setSort] = useState('recent');
  const [rating, setRating] = useState(0);
  const [pros, setPros] = useState('');
  const [cons, setCons] = useState('');
  const [content, setContent] = useState('');
  const [categoryRatings, setCategoryRatings] = useState({});
  const [residencePeriod, setResidencePeriod] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['reviews', apartmentId, sort],
    queryFn: () => getReviews(apartmentId, { sort }),
  });

  const reviews = data?.reviews || [];
  const stats = data?.stats || {};

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['reviews', apartmentId] });

  const createMutation = useMutation({
    mutationFn: (review) => createReview(apartmentId, review),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setRating(0); setPros(''); setCons(''); setContent('');
      setCategoryRatings({}); setResidencePeriod('');
    },
  });

  const deleteMutation = useMutation({ mutationFn: deleteReview, onSuccess: invalidate });
  const reportMutation = useMutation({
    mutationFn: reportReview,
    onSuccess: () => { alert('신고가 접수되었습니다.'); invalidate(); },
  });
  const helpfulMutation = useMutation({ mutationFn: toggleHelpful, onSuccess: invalidate });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (rating === 0) { alert('종합 별점을 선택해주세요.'); return; }
    if (content.trim().length < 10) { alert('리뷰는 최소 10자 이상 작성해주세요.'); return; }
    createMutation.mutate({
      rating, pros, cons, content,
      ...categoryRatings,
      residence_period: residencePeriod || null,
    });
  };

  const handleWriteClick = () => {
    if (!isAuthenticated) { navigate('/login'); return; }
    setShowForm(!showForm);
  };

  const setCatRating = (key, value) => {
    setCategoryRatings((prev) => ({ ...prev, [key]: value }));
  };

  const hasCategories = stats.avg_transport || stats.avg_environment || stats.avg_facilities || stats.avg_parking || stats.avg_education;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* 헤더 */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800">
          주민 리뷰 <span className="text-sm font-normal text-gray-400 ml-1">{stats.total_count || 0}개</span>
        </h3>
        <button
          onClick={handleWriteClick}
          className="text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors"
        >
          {showForm ? '닫기' : '리뷰 작성'}
        </button>
      </div>

      {/* 별점 요약 + 카테고리 평점 */}
      {parseInt(stats.total_count) > 0 && (
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex gap-8 items-center">
            <div className="text-center flex-shrink-0">
              <p className="text-4xl font-extrabold text-gray-900">{stats.avg_rating || '-'}</p>
              <StarRating rating={Math.round(parseFloat(stats.avg_rating) || 0)} size="sm" />
              <p className="text-[11px] text-gray-400 mt-1">{stats.total_count}명 참여</p>
            </div>
            <div className="flex-1 space-y-1">
              <RatingBar label="5" count={parseInt(stats.star_5) || 0} total={parseInt(stats.total_count)} />
              <RatingBar label="4" count={parseInt(stats.star_4) || 0} total={parseInt(stats.total_count)} />
              <RatingBar label="3" count={parseInt(stats.star_3) || 0} total={parseInt(stats.total_count)} />
              <RatingBar label="2" count={parseInt(stats.star_2) || 0} total={parseInt(stats.total_count)} />
              <RatingBar label="1" count={parseInt(stats.star_1) || 0} total={parseInt(stats.total_count)} />
            </div>
          </div>
          {/* 카테고리 평균 */}
          {hasCategories && (
            <div className="flex justify-between mt-4 pt-4 border-t border-gray-100 px-2">
              {CATEGORIES.map(({ key, label, icon }) => (
                <CategoryScore key={key} value={stats[`avg_${key.replace('rating_', '')}`]} label={label} icon={icon} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 작성 폼 */}
      {showForm && (
        <form onSubmit={handleSubmit} className="px-6 py-5 border-b border-gray-100 bg-gray-50 space-y-4">
          {/* 종합 별점 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">종합 평점 *</label>
            <div className="flex items-center gap-3">
              <StarRating rating={rating} onClick={setRating} />
              {rating > 0 && <span className="text-sm text-gray-500">{STAR_LABELS[rating]}</span>}
            </div>
          </div>

          {/* 카테고리별 별점 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">항목별 평점 <span className="font-normal text-gray-400">(선택)</span></label>
            <div className="grid grid-cols-5 gap-2">
              {CATEGORIES.map(({ key, label, icon }) => (
                <div key={key} className="text-center">
                  <span className="text-lg">{icon}</span>
                  <p className="text-[11px] text-gray-500 mb-1">{label}</p>
                  <div className="flex justify-center">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setCatRating(key, s)}
                        className="hover:scale-110 transition-transform"
                      >
                        <svg className={`w-3.5 h-3.5 ${s <= (categoryRatings[key] || 0) ? 'text-yellow-400' : 'text-gray-200'}`}
                          fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 거주기간 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">거주 기간</label>
            <select
              value={residencePeriod}
              onChange={(e) => setResidencePeriod(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            >
              {RESIDENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 장단점 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-green-600 mb-1">장점</label>
              <input
                type="text"
                value={pros}
                onChange={(e) => setPros(e.target.value)}
                placeholder="예: 교통 편리, 주변 편의시설 많음"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-red-500 mb-1">단점</label>
              <input
                type="text"
                value={cons}
                onChange={(e) => setCons(e.target.value)}
                placeholder="예: 주차 공간 부족, 소음"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
          </div>

          {/* 상세 리뷰 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">상세 리뷰 *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="이 아파트에 대한 솔직한 후기를 남겨주세요 (최소 10자)"
              rows={4}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-primary-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? '등록 중...' : '리뷰 등록'}
            </button>
          </div>
          {createMutation.isError && (
            <p className="text-sm text-red-500">{createMutation.error?.response?.data?.error || '등록에 실패했습니다.'}</p>
          )}
        </form>
      )}

      {/* 정렬 */}
      {reviews.length > 0 && (
        <div className="px-6 py-2.5 border-b border-gray-100 flex gap-2">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSort(opt.value)}
              className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${
                sort === opt.value
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* 리뷰 목록 */}
      <div className="divide-y divide-gray-100">
        {isLoading ? (
          <div className="px-6 py-8 text-center">
            <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin mx-auto" />
          </div>
        ) : reviews.length > 0 ? (
          reviews.map((review) => (
            <div key={review.id} className="px-6 py-4">
              {/* 상단: 별점 + 유저 + 거주기간 */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <StarRating rating={review.rating} size="sm" />
                    <span className="text-sm font-medium text-gray-800">{review.nickname}</span>
                    {review.residence_period && (
                      <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">
                        거주 {RESIDENCE_LABELS[review.residence_period] || review.residence_period}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {dayjs(review.created_at).format('YYYY.MM.DD')}
                  </p>
                </div>
                <div className="flex gap-2 text-[11px]">
                  {review.is_mine && (
                    <button
                      onClick={() => { if (confirm('리뷰를 삭제하시겠습니까?')) deleteMutation.mutate(review.id); }}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      삭제
                    </button>
                  )}
                  {!review.is_mine && isAuthenticated && (
                    <button
                      onClick={() => { if (confirm('이 리뷰를 신고하시겠습니까?')) reportMutation.mutate(review.id); }}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      신고
                    </button>
                  )}
                </div>
              </div>

              {/* 카테고리 미니바 */}
              {(review.rating_transport || review.rating_environment || review.rating_facilities || review.rating_parking || review.rating_education) && (
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5">
                  {CATEGORIES.map(({ key, label }) => (
                    <MiniCategoryBar key={key} value={review[key]} label={label} />
                  ))}
                </div>
              )}

              {/* 장단점 */}
              {(review.pros || review.cons) && (
                <div className="flex flex-wrap gap-3 mt-2.5">
                  {review.pros && (
                    <div className="flex items-center gap-1 bg-green-50 rounded-lg px-2.5 py-1">
                      <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                      </svg>
                      <span className="text-xs text-green-700">{review.pros}</span>
                    </div>
                  )}
                  {review.cons && (
                    <div className="flex items-center gap-1 bg-red-50 rounded-lg px-2.5 py-1">
                      <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                      </svg>
                      <span className="text-xs text-red-600">{review.cons}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 본문 */}
              <p className="text-sm text-gray-700 mt-2.5 leading-relaxed">{review.content}</p>

              {/* 도움돼요 버튼 */}
              <div className="mt-3 flex items-center gap-1">
                <button
                  onClick={() => {
                    if (!isAuthenticated) { navigate('/login'); return; }
                    helpfulMutation.mutate(review.id);
                  }}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    review.is_helpful
                      ? 'bg-primary-50 text-primary-600 border border-primary-200'
                      : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill={review.is_helpful ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                  </svg>
                  도움돼요{review.helpful_count > 0 && ` ${review.helpful_count}`}
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="px-6 py-10 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm text-gray-400 mb-1">아직 리뷰가 없습니다</p>
            <p className="text-xs text-gray-300">첫 번째 리뷰를 남겨보세요!</p>
          </div>
        )}
      </div>
    </div>
  );
}
