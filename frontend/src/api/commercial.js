import client from './client';

export const getCommercialByBounds = async (bounds, params = {}) => {
  const { data } = await client.get('/commercial', {
    params: { swLat: bounds.sw.lat, swLng: bounds.sw.lng, neLat: bounds.ne.lat, neLng: bounds.ne.lng, ...params },
  });
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
