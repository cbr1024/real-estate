import client from './client';

export const getAdminStats = async () => {
  const { data } = await client.get('/admin/stats');
  return data;
};

export const getUsers = async (params = {}) => {
  const { data } = await client.get('/admin/users', { params });
  return data;
};

export const updateUserSubscription = async (userId, planId) => {
  const { data } = await client.put(`/admin/users/${userId}/subscription`, { plan_id: planId });
  return data;
};

export const updateUserRole = async (userId, role) => {
  const { data } = await client.put(`/admin/users/${userId}/role`, { role });
  return data;
};

export const getApiUsage = async () => {
  const { data } = await client.get('/admin/api-usage');
  return data;
};
