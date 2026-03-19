import client from './client';

export const getAuctions = async (params = {}) => {
  const { data } = await client.get('/auctions', { params });
  return data;
};

export const getApartmentAuctions = async (apartmentId) => {
  const { data } = await client.get(`/auctions/apartment/${apartmentId}`);
  return data;
};
