import client from './client';

export const getCommercialList = async (params = {}) => {
  const { data } = await client.get('/commercial', { params });
  return data;
};

export const getCommercialDetail = async (id) => {
  const { data } = await client.get(`/commercial/${id}`);
  return data;
};

export const getCommercialTrades = async (id) => {
  const { data } = await client.get(`/commercial/${id}/trades`);
  return data;
};

export const getCommercialStats = async () => {
  const { data } = await client.get('/commercial/stats/summary');
  return data;
};
