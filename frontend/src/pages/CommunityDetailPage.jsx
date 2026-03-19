import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPost, createComment, deleteComment, deletePost, likePost } from '../api/community';
import useAuthStore from '../stores/useAuthStore';
import dayjs from 'dayjs';

export default function CommunityDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();
  const [comment, setComment] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['community-post', id],
    queryFn: () => getPost(id),
  });

  const commentMutation = useMutation({
    mutationFn: (content) => createComment(id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-post', id] });
      setComment('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePost(id),
    onSuccess: () => navigate('/community'),
  });

  const likeMutation = useMutation({
    mutationFn: () => likePost(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['community-post', id] }),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: deleteComment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['community-post', id] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  const post = data?.post;
  const comments = data?.comments || [];

  if (!post) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-gray-500">게시글을 찾을 수 없습니다.</p>
        <button onClick={() => navigate('/community')} className="mt-3 text-primary-600 text-sm font-medium">
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* 뒤로가기 */}
        <button
          onClick={() => navigate('/community')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          커뮤니티로 돌아가기
        </button>

        {/* 게시글 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                {post.category}
              </span>
              {post.region && <span className="text-xs text-gray-400">{post.region}</span>}
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-3">{post.title}</h1>
            <div className="flex items-center gap-3 text-sm text-gray-400 mb-5">
              <span className="font-medium text-gray-600">{post.nickname}</span>
              <span>{dayjs(post.created_at).format('YYYY.MM.DD HH:mm')}</span>
              <span>조회 {post.views}</span>
            </div>
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap min-h-[100px]">
              {post.content}
            </div>
          </div>

          {/* 좋아요 & 삭제 */}
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
            <button
              onClick={() => { if (!isAuthenticated) { navigate('/login'); return; } likeMutation.mutate(); }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-500 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              좋아요 {post.likes > 0 && post.likes}
            </button>
            {post.is_mine && (
              <button
                onClick={() => { if (confirm('게시글을 삭제하시겠습니까?')) deleteMutation.mutate(); }}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                삭제
              </button>
            )}
          </div>
        </div>

        {/* 댓글 */}
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-800">댓글 {comments.length}개</h3>
          </div>

          {comments.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {comments.map((c) => (
                <div key={c.id} className="px-6 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-gray-700">{c.nickname}</span>
                      <span className="text-gray-400">{dayjs(c.created_at).format('MM.DD HH:mm')}</span>
                    </div>
                    {c.is_mine && (
                      <button
                        onClick={() => { if (confirm('댓글을 삭제하시겠습니까?')) deleteCommentMutation.mutate(c.id); }}
                        className="text-[11px] text-gray-400 hover:text-red-500"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mt-1">{c.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-6 text-center text-sm text-gray-400">
              첫 번째 댓글을 남겨보세요
            </div>
          )}

          {/* 댓글 작성 */}
          <div className="px-6 py-3 border-t border-gray-100">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={isAuthenticated ? '댓글을 입력하세요' : '로그인 후 댓글을 작성할 수 있습니다'}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && comment.trim()) {
                    if (!isAuthenticated) { navigate('/login'); return; }
                    commentMutation.mutate(comment);
                  }
                }}
                disabled={!isAuthenticated}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-gray-50"
              />
              <button
                onClick={() => {
                  if (!isAuthenticated) { navigate('/login'); return; }
                  if (comment.trim()) commentMutation.mutate(comment);
                }}
                disabled={commentMutation.isPending}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                등록
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
