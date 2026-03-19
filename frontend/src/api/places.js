import client from './client';

export const getNearbyPlaces = async (lat, lng, type) => {
  const { data } = await client.get('/places/nearby', { params: { lat, lng, type } });
  return data;
};
