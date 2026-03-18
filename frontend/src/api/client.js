import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // HttpOnly 쿠키 자동 전송
});

// 401 처리: token_expired면 자동 갱신 시도
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // auth 관련 요청은 리다이렉트하지 않음
    if (originalRequest.url?.includes('/auth/')) {
      return Promise.reject(error);
    }

    // Access Token 만료 → Refresh Token으로 갱신 시도
    if (error.response?.status === 401 && error.response?.data?.error === 'token_expired' && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        return client(originalRequest); // 원래 요청 재시도
      } catch (refreshErr) {
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      }
    }

    if (error.response?.status === 401) {
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export default client;
