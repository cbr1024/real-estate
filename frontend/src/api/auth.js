import client from './client';

export const register = async ({ email, password, nickname }) => {
  const response = await client.post('/auth/register', {
    email,
    password,
    nickname,
  });
  return response.data;
};

export const login = async ({ email, password }) => {
  const response = await client.post('/auth/login', {
    email,
    password,
  });
  return response.data;
};

export const logout = async () => {
  const response = await client.post('/auth/logout');
  return response.data;
};
