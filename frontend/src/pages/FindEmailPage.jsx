import { useState } from 'react';
import { Link } from 'react-router-dom';
import { findId } from '../api/auth';

export default function FindEmailPage() {
  const [nickname, setNickname] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult('');

    if (!nickname) {
      setError('닉네임을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const data = await findId(nickname);
      setResult(data.email);
    } catch (err) {
      setError(err.response?.data?.error || '아이디 찾기에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">아이디 찾기</h1>
            <p className="text-sm text-gray-500 mt-1">가입 시 사용한 닉네임을 입력해주세요</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {result ? (
            <div className="text-center">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-6">
                <p className="text-sm text-gray-600 mb-1">등록된 아이디</p>
                <p className="text-lg font-bold text-gray-900">{result}</p>
              </div>
              <Link to="/login"
                className="inline-block w-full py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium text-sm text-center transition-colors">
                로그인하러 가기
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">닉네임</label>
                <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)}
                  placeholder="닉네임을 입력하세요"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all" />
              </div>
              <button type="submit" disabled={isLoading}
                className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white rounded-lg font-medium text-sm transition-colors">
                {isLoading ? '찾는 중...' : '아이디 찾기'}
              </button>
            </form>
          )}

          <p className="text-center text-sm text-gray-500 mt-6">
            <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">로그인으로 돌아가기</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
