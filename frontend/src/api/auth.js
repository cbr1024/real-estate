import client from './client';

export const register = async ({ email, password, nickname }) => {
  const response = await client.post('/auth/register', { email, password, nickname });
  return response.data;
};

export const login = async ({ email, password }) => {
  const response = await client.post('/auth/login', { email, password });
  return response.data;
};

export const logout = async () => {
  const response = await client.post('/auth/logout');
  return response.data;
};

export const getMe = async () => {
  const response = await client.get('/auth/me');
  return response.data;
};

export const refreshToken = async () => {
  const response = await client.post('/auth/refresh');
  return response.data;
};

export const verifyEmail = async (token) => {
  const response = await client.get('/auth/verify-email', { params: { token } });
  return response.data;
};

export const resendVerification = async (email) => {
  const response = await client.post('/auth/resend-verification', { email });
  return response.data;
};

export const findId = async (nickname) => {
  const response = await client.post('/auth/find-id', { nickname });
  return response.data;
};

export const requestPasswordReset = async (email) => {
  const response = await client.post('/auth/request-password-reset', { email });
  return response.data;
};

export const verifyResetToken = async (token) => {
  const response = await client.get('/auth/verify-reset-token', { params: { token } });
  return response.data;
};

export const resetPassword = async (token, password) => {
  const response = await client.post('/auth/reset-password', { token, password });
  return response.data;
};
