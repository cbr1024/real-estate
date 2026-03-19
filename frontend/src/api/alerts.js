import client from './client';

export const getMyAlerts = async () => {
  const { data } = await client.get('/alerts');
  return data;
};

export const getAlertForApartment = async (apartmentId) => {
  const { data } = await client.get(`/alerts/apartment/${apartmentId}`);
  return data;
};

export const createAlert = async ({ apartment_id, alert_type, target_price }) => {
  const { data } = await client.post('/alerts', { apartment_id, alert_type, target_price });
  return data;
};

export const deleteAlert = async (alertId) => {
  const { data } = await client.delete(`/alerts/${alertId}`);
  return data;
};

export const toggleAlert = async (alertId) => {
  const { data } = await client.put(`/alerts/${alertId}/toggle`);
  return data;
};
