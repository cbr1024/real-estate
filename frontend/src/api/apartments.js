import client from './client';

export const getApartmentsByBounds = async (bounds, filters = {}) => {
  const params = {
    swLat: bounds.sw.lat,
    swLng: bounds.sw.lng,
    neLat: bounds.ne.lat,
    neLng: bounds.ne.lng,
    ...filters,
  };
  const response = await client.get('/apartments', { params });
  return response.data;
};

export const getApartmentDetail = async (id) => {
  const response = await client.get(`/apartments/${id}`);
  return response.data;
};

export const getTradeHistory = async (id, params = {}) => {
  const response = await client.get(`/apartments/${id}/trades`, { params });
  return response.data;
};

export const getAnalysis = async (id) => {
  const response = await client.get(`/apartments/${id}/analysis`);
  return response.data;
};

export const compareApartments = async (ids, tradeType = 'sale') => {
  const response = await client.get('/apartments/compare', { params: { ids: ids.join(','), tradeType } });
  return response.data;
};

export const getApartmentStats = async (id, months) => {
  const response = await client.get(`/apartments/${id}/stats`, { params: { months } });
  return response.data;
};

export const searchApartments = async (query) => {
  const response = await client.get('/apartments/search', {
    params: { q: query },
  });
  return response.data;
};
