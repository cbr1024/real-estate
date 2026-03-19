import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getPosts, createPost, likePost } from '../api/community';
import useAuthStore from '../stores/useAuthStore';
import dayjs from 'dayjs';

const CATEGORIES = ['전체', '동네소식', '매매후기', '전세후기', '인테리어', '이사팁'];

export default function CommunityPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useAuthStore();
  const [posts, setPosts] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', category: '동네소식', region: '' });
  const [submitting, setSubmitting] = useState(false);

  const currentCategory = searchParams.get('category') || '전체';
  const currentPage = parseInt(searchParams.get('page'), 10) || 1;

  useEffect(() => {
    setLoading(true);
    const params = { page: currentPage };
    if (currentCategory !== '전체') params.category = currentCategory;

    getPosts(params)
      .then((data) => { setPosts(data.posts); setPagination(data.pagination); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentCategory, currentPage]);

  const handleCategoryChange = (cat) => {
    setSearchParams(cat === '전체' ? {} : { category: cat });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) { navigate('/login'); return; }
    setSubmitting(true);
    try {
      await createPost(form);
      setShowForm(false);
      setForm({ title: '', content: '', category: '동네소식', region: '' });
      // 새로고침
      const params = { page: 1 };
      if (currentCategory !== '전체') params.category = currentCategory;
      const data = await getPosts(params);
      setPosts(data.posts);
      setPagination(data.pagination);
    } catch (err) {
      alert(err.response?.data?.error || '등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (id) => {
    if (!isAuthenticated) { navigate('/login'); return; }
    try {
      await likePost(id);
      setPosts((prev) => prev.map((p) => p.id === id ? { ...p, likes: p.likes + 1 } : p));
    } catch (_) {}
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 py-10">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-2xl font-bold text-white mb-2">커뮤니티</h1>
          <p className="text-slate-400">동네 이야기, 매매/전세 후기를 나눠보세요</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-5 pb-16">
        {/* 카테고리 탭 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 flex gap-1 overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                currentCategory === cat
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {cat}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => { if (!isAuthenticated) { navigate('/login'); return; } setShowForm(!showForm); }}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors whitespace-nowrap"
          >
            글쓰기
          </button>
        </div>

        {/* 글쓰기 폼 */}
        {showForm && (
          <form onSubmit={handleSubmit} className="mt-4 bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="flex gap-3">
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              >
                {CATEGORIES.filter((c) => c !== '전체').map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="지역 (선택, 예: 강남구)"
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none w-40"
              />
            </div>
            <input
              type="text"
              placeholder="제목을 입력하세요"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary-500 outline-none"
            />
            <textarea
              placeholder="내용을 입력하세요 (최소 10자)"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={4}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                취소
              </button>
              <button type="submit" disabled={submitting} className="px-6 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50">
                {submitting ? '등록 중...' : '등록'}
              </button>
            </div>
          </form>
        )}

        {/* 게시글 목록 */}
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="py-16 text-center">
              <div className="w-7 h-7 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin mx-auto" />
            </div>
          ) : posts.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {posts.map((post) => (
                <div
                  key={post.id}
                  onClick={() => navigate(`/community/${post.id}`)}
                  className="px-5 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                          {post.category}
                        </span>
                        {post.region && (
                          <span className="text-[11px] text-gray-400">{post.region}</span>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{post.title}</h3>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                        <span>{post.nickname}</span>
                        <span>{dayjs(post.created_at).format('MM.DD HH:mm')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-400 flex-shrink-0">
                      <div className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        {post.views}
                      </div>
                      <div className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                        {post.likes}
                      </div>
                      <div className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        {post.comment_count}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center text-sm text-gray-400">
              게시글이 없습니다. 첫 번째 글을 작성해보세요!
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
                  onClick={() => setSearchParams({ ...(currentCategory !== '전체' ? { category: currentCategory } : {}), page: p })}
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
