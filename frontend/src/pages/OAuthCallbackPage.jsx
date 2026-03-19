import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe } from '../api/auth';
import useAuthStore from '../stores/useAuthStore';

export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const authLogin = useAuthStore((s) => s.login);

  useEffect(() => {
    // 소셜 로그인 후 쿠키가 이미 세팅된 상태 → /me로 유저 정보 조회
    getMe()
      .then((data) => {
        authLogin(data.user);
        navigate('/');
      })
      .catch(() => {
        navigate('/login?error=oauth_failed');
      });
  }, [authLogin, navigate]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-gray-500">로그인 처리 중...</div>
    </div>
  );
}
