import client from './client';

export const getReviews = async (apartmentId, { page = 1, sort = 'recent' } = {}) => {
  const { data } = await client.get(`/reviews/apartment/${apartmentId}`, { params: { page, sort } });
  return data;
};

export const createReview = async (apartmentId, review) => {
  const { data } = await client.post(`/reviews/apartment/${apartmentId}`, review);
  return data;
};

export const deleteReview = async (id) => {
  const { data } = await client.delete(`/reviews/${id}`);
  return data;
};

export const reportReview = async (id) => {
  const { data } = await client.post(`/reviews/${id}/report`);
  return data;
};

export const toggleHelpful = async (id) => {
  const { data } = await client.post(`/reviews/${id}/helpful`);
  return data;
};
