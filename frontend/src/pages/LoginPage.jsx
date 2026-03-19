import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login, resendVerification } from '../api/auth';
import useAuthStore from '../stores/useAuthStore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [needVerification, setNeedVerification] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const navigate = useNavigate();
  const authLogin = useAuthStore((s) => s.login);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNeedVerification(false);
    setResendMsg('');

    if (!email || !password) {
      setError('아이디와 비밀번호를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const data = await login({ email, password });
      authLogin(data.user);
      navigate('/');
    } catch (err) {
      const resp = err.response?.data;
      if (resp?.needVerification) {
        setNeedVerification(true);
      }
      setError(resp?.error || '로그인에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setResendMsg('');
    try {
      await resendVerification(email);
      setResendMsg('인증 메일이 재발송되었습니다. 메일함을 확인해주세요.');
    } catch (err) {
      setResendMsg(err.response?.data?.error || '재발송에 실패했습니다.');
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">로그인</h1>
            <p className="text-sm text-gray-500 mt-1">아파트 시세 서비스에 오신 것을 환영합니다</p>

            {error && (
              <div className={`mt-4 p-3 rounded-lg border text-left ${needVerification ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
                <p className={`text-sm ${needVerification ? 'text-yellow-700' : 'text-red-600'}`}>{error}</p>
                {needVerification && (
                  <div className="mt-2">
                    <button onClick={handleResend}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                      인증 메일 다시 보내기
                    </button>
                    {resendMsg && <p className="text-xs text-green-600 mt-1">{resendMsg}</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">아이디</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일을 입력하세요"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">비밀번호</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all" />
            </div>
            <button type="submit" disabled={isLoading}
              className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white rounded-lg font-medium text-sm transition-colors">
              {isLoading ? '로그인 중...' : '로그인'}
            </button>
          </form>

          {/* 소셜 로그인 */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-3 text-gray-400">또는</span>
            </div>
          </div>

          <div className="space-y-3">
            <a href="/api/oauth/naver"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm text-white transition-colors"
              style={{ backgroundColor: '#03C75A' }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M13.5 10.56L6.26 0H0v20h6.5V9.44L13.74 20H20V0h-6.5v10.56z" fill="white"/>
              </svg>
              네이버 로그인
            </a>
            <a href="/api/oauth/kakao"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-colors"
              style={{ backgroundColor: '#FEE500', color: '#191919' }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M10 0C4.478 0 0 3.588 0 8.015c0 2.86 1.89 5.37 4.735 6.79-.21.78-.76 2.83-.87 3.27-.14.54.2.53.42.39.17-.12 2.75-1.87 3.86-2.63.6.09 1.22.13 1.85.13 5.522 0 10-3.588 10-8.015C20 3.588 15.522 0 10 0z" fill="#191919"/>
              </svg>
              카카오 로그인
            </a>
          </div>

          <div className="flex justify-center gap-4 mt-5 text-sm">
            <Link to="/find-id" className="text-gray-500 hover:text-gray-700">아이디 찾기</Link>
            <span className="text-gray-300">|</span>
            <Link to="/forgot-password" className="text-gray-500 hover:text-gray-700">비밀번호 재설정</Link>
          </div>

          <p className="text-center text-sm text-gray-500 mt-4">
            계정이 없으신가요?{' '}
            <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">회원가입</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
