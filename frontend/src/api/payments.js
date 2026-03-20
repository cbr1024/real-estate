import client from './client';

export const preparePayment = async (planId) => {
  const { data } = await client.post('/payments/prepare', { plan_id: planId });
  return data;
};

export const confirmPayment = async ({ paymentKey, orderId, amount }) => {
  const { data } = await client.post('/payments/confirm', { paymentKey, orderId, amount });
  return data;
};

export const getPaymentHistory = async () => {
  const { data } = await client.get('/payments/history');
  return data;
};

export const cancelPayment = async (paymentId, reason) => {
  const { data } = await client.post('/payments/cancel', { payment_id: paymentId, reason });
  return data;
};

export const freeDowngrade = async () => {
  const { data } = await client.post('/payments/free-downgrade');
  return data;
};

export const startFreeTrial = async (planId) => {
  const { data } = await client.post('/payments/free-trial', { plan_id: planId });
  return data;
};

export const getTrialStatus = async () => {
  const { data } = await client.get('/payments/trial-status');
  return data;
};

export const requestRefund = async (paymentId, reason) => {
  const { data } = await client.post('/payments/refund', { payment_id: paymentId, reason });
  return data;
};
