import client from './client';

export const getPolicyList = async (params = {}) => {
  const { data } = await client.get('/policy', { params });
  return data;
};

export const getPolicyCategories = async () => {
  const { data } = await client.get('/policy/categories');
  return data;
};
