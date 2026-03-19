import client from './client';

export const getPlans = async () => {
  const { data } = await client.get('/subscriptions/plans');
  return data;
};

export const getMySubscription = async () => {
  const { data } = await client.get('/subscriptions/me');
  return data;
};

export const updateMySubscription = async (planId) => {
  const { data } = await client.put('/subscriptions/me', { plan_id: planId });
  return data;
};
