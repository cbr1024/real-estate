import client from './client';

export const getFavorites = async () => {
  const response = await client.get('/users/favorites');
  return response.data;
};

export const addFavorite = async (apartmentId) => {
  const response = await client.post(`/users/favorites/${apartmentId}`);
  return response.data;
};

export const removeFavorite = async (apartmentId) => {
  const response = await client.delete(`/users/favorites/${apartmentId}`);
  return response.data;
};
