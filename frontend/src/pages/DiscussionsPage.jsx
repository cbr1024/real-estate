import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getDiscussions, getDiscussion, createDiscussion, voteDiscussion, createDiscussionComment } from '../api/discussions';
import useAuthStore from '../stores/useAuthStore';
import dayjs from 'dayjs';

const OPINION_LABELS = { buy: '매수', sell: '매도', hold: '관망' };
const OPINION_COLORS = {
  buy: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', bar: 'bg-red-500' },
  sell: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', bar: 'bg-blue-500' },
  hold: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', bar: 'bg-gray-400' },
};

function VoteBar({ buy, sell, hold, myVote, onVote }) {
  const total = buy + sell + hold || 1;
  return (
    <div className="space-y-3">
      <div className="flex rounded-full overflow-hidden h-3 bg-gray-100">
        {buy > 0 && <div className="bg-red-500 transition-all" style={{ width: `${(buy / total) * 100}%` }} />}
        {hold > 0 && <div className="bg-gray-400 transition-all" style={{ width: `${(hold / total) * 100}%` }} />}
        {sell > 0 && <div className="bg-blue-500 transition-all" style={{ width: `${(sell / total) * 100}%` }} />}
      </div>
      <div className="flex justify-between">
        {['buy', 'sell', 'hold'].map((v) => {
          const count = v === 'buy' ? buy : v === 'sell' ? sell : hold;
          const pct = Math.round((count / total) * 100);
          const c = OPINION_COLORS[v];
          const isActive = myVote === v;
          return (
            <button
              key={v}
              onClick={() => onVote(v)}
              className={`flex flex-col items-center px-4 py-2 rounded-xl border transition-all ${
                isActive ? `${c.bg} ${c.border} ring-1 ring-current ${c.text}` : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <span className="text-xs font-bold">{OPINION_LABELS[v]}</span>
              <span className="text-lg font-extrabold">{pct}%</span>
              <span className="text-[10px]">{count}표</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DiscussionsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useAuthStore();
  const [discussions, setDiscussions] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', opinion: 'buy', region: '' });
  const [submitting, setSubmitting] = useState(false);

  // 상세 보기
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [commentText, setCommentText] = useState('');

  const currentPage = parseInt(searchParams.get('page'), 10) || 1;

  useEffect(() => {
    setLoading(true);
    getDiscussions({ page: currentPage })
      .then((data) => { setDiscussions(data.discussions); setPagination(data.pagination); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentPage]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) { navigate('/login'); return; }
    setSubmitting(true);
    try {
      await createDiscussion(form);
      setShowForm(false);
      setForm({ title: '', content: '', opinion: 'buy', region: '' });
      const data = await getDiscussions({ page: 1 });
      setDiscussions(data.discussions);
      setPagination(data.pagination);
    } catch (err) {
      alert(err.response?.data?.error || '등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (id) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const data = await getDiscussion(id);
      setDetail(data);
    } catch (_) {}
    setDetailLoading(false);
  };

  const handleVote = async (vote) => {
    if (!isAuthenticated) { navigate('/login'); return; }
    try {
      const data = await voteDiscussion(selectedId, vote);
      setDetail((prev) => ({
        ...prev,
        discussion: { ...prev.discussion, ...data.votes },
        myVote: data.myVote,
      }));
      // 목록도 갱신
      setDiscussions((prev) => prev.map((d) =>
        d.id === selectedId ? { ...d, ...data.votes } : d
      ));
    } catch (_) {}
  };

  const handleComment = async () => {
    if (!isAuthenticated) { navigate('/login'); return; }
    if (!commentText.trim()) return;
    try {
      await createDiscussionComment(selectedId, commentText);
      setCommentText('');
      const data = await getDiscussion(selectedId);
      setDetail(data);
    } catch (_) {}
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 py-10">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-2xl font-bold text-white mb-2">투자 토론</h1>
          <p className="text-slate-400">아파트 매수/매도/관망 의견을 나누고 투표하세요</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-5 pb-16">
        {/* 글쓰기 버튼 */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => { if (!isAuthenticated) { navigate('/login'); return; } setShowForm(!showForm); }}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors"
          >
            토론 시작
          </button>
        </div>

        {/* 글쓰기 폼 */}
        {showForm && (
          <form onSubmit={handleSubmit} className="mb-4 bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="flex gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">내 의견</label>
                <div className="flex gap-2">
                  {(['buy', 'sell', 'hold']).map((op) => {
                    const c = OPINION_COLORS[op];
                    return (
                      <button
                        key={op}
                        type="button"
                        onClick={() => setForm({ ...form, opinion: op })}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                          form.opinion === op ? `${c.bg} ${c.text} ${c.border}` : 'border-gray-200 text-gray-400'
                        }`}
                      >
                        {OPINION_LABELS[op]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">지역</label>
                <input
                  type="text"
                  placeholder="예: 강남구, 서초구"
                  value={form.region}
                  onChange={(e) => setForm({ ...form, region: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
            </div>
            <input
              type="text"
              placeholder="토론 주제를 입력하세요"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary-500 outline-none"
            />
            <textarea
              placeholder="의견을 작성하세요 (최소 10자)"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={4}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500">취소</button>
              <button type="submit" disabled={submitting} className="px-6 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50">
                {submitting ? '등록 중...' : '등록'}
              </button>
            </div>
          </form>
        )}

        <div className="flex gap-4">
          {/* 토론 목록 */}
          <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${selectedId ? 'w-1/2' : 'w-full'} transition-all`}>
            {loading ? (
              <div className="py-16 text-center">
                <div className="w-7 h-7 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin mx-auto" />
              </div>
            ) : discussions.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {discussions.map((d) => {
                  const total = d.vote_buy + d.vote_sell + d.vote_hold || 1;
                  const c = OPINION_COLORS[d.opinion] || OPINION_COLORS.hold;
                  return (
                    <div
                      key={d.id}
                      onClick={() => openDetail(d.id)}
                      className={`px-5 py-4 cursor-pointer transition-colors ${
                        selectedId === d.id ? 'bg-primary-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
                          {OPINION_LABELS[d.opinion]}
                        </span>
                        {d.region && <span className="text-[11px] text-gray-400">{d.region}</span>}
                        {d.apartment_name && <span className="text-[11px] text-gray-400">{d.apartment_name}</span>}
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{d.title}</h3>
                      <div className="flex items-center gap-3 mt-2">
                        {/* 미니 투표 바 */}
                        <div className="flex-1 flex rounded-full overflow-hidden h-1.5 bg-gray-100">
                          <div className="bg-red-500" style={{ width: `${(d.vote_buy / total) * 100}%` }} />
                          <div className="bg-gray-400" style={{ width: `${(d.vote_hold / total) * 100}%` }} />
                          <div className="bg-blue-500" style={{ width: `${(d.vote_sell / total) * 100}%` }} />
                        </div>
                        <span className="text-[11px] text-gray-400">{d.vote_buy + d.vote_sell + d.vote_hold}표</span>
                        <span className="text-[11px] text-gray-400">{d.comment_count}댓글</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-400">
                        <span>{d.nickname}</span>
                        <span>{dayjs(d.created_at).format('MM.DD')}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-16 text-center text-sm text-gray-400">
                아직 토론이 없습니다. 첫 번째 토론을 시작해보세요!
              </div>
            )}
          </div>

          {/* 상세 패널 */}
          {selectedId && (
            <div className="w-1/2 bg-white rounded-xl border border-gray-200 overflow-hidden max-h-[calc(100vh-200px)] overflow-y-auto">
              {detailLoading ? (
                <div className="py-16 text-center">
                  <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin mx-auto" />
                </div>
              ) : detail ? (
                <>
                  <div className="px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${OPINION_COLORS[detail.discussion.opinion]?.bg} ${OPINION_COLORS[detail.discussion.opinion]?.text}`}>
                          {OPINION_LABELS[detail.discussion.opinion]}
                        </span>
                        {detail.discussion.region && <span className="text-xs text-gray-400">{detail.discussion.region}</span>}
                      </div>
                      <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <h2 className="text-base font-bold text-gray-900">{detail.discussion.title}</h2>
                    <div className="flex gap-2 mt-1 text-xs text-gray-400">
                      <span>{detail.discussion.nickname}</span>
                      <span>{dayjs(detail.discussion.created_at).format('YYYY.MM.DD')}</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap leading-relaxed">
                      {detail.discussion.content}
                    </p>
                  </div>

                  {/* 투표 */}
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h4 className="text-sm font-bold text-gray-700 mb-3">투표</h4>
                    <VoteBar
                      buy={detail.discussion.vote_buy}
                      sell={detail.discussion.vote_sell}
                      hold={detail.discussion.vote_hold}
                      myVote={detail.myVote}
                      onVote={handleVote}
                    />
                  </div>

                  {/* 댓글 */}
                  <div className="px-5 py-3 border-b border-gray-100">
                    <h4 className="text-sm font-bold text-gray-700">댓글 {detail.comments?.length || 0}</h4>
                  </div>
                  <div className="divide-y divide-gray-50 max-h-60 overflow-y-auto">
                    {(detail.comments || []).map((c) => (
                      <div key={c.id} className="px-5 py-2.5">
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span className="font-medium text-gray-600">{c.nickname}</span>
                          <span>{dayjs(c.created_at).format('MM.DD HH:mm')}</span>
                        </div>
                        <p className="text-sm text-gray-700 mt-0.5">{c.content}</p>
                      </div>
                    ))}
                  </div>
                  <div className="px-5 py-3 border-t border-gray-100">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder={isAuthenticated ? '댓글 입력' : '로그인 필요'}
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleComment(); }}
                        disabled={!isAuthenticated}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50"
                      />
                      <button
                        onClick={handleComment}
                        className="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700"
                      >
                        등록
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
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
                  onClick={() => setSearchParams({ page: p })}
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
