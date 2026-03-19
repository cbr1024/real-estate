import client from './client';

export const getPosts = async (params = {}) => {
  const { data } = await client.get('/community', { params });
  return data;
};

export const getPost = async (id) => {
  const { data } = await client.get(`/community/${id}`);
  return data;
};

export const createPost = async (post) => {
  const { data } = await client.post('/community', post);
  return data;
};

export const deletePost = async (id) => {
  const { data } = await client.delete(`/community/${id}`);
  return data;
};

export const createComment = async (postId, content) => {
  const { data } = await client.post(`/community/${postId}/comments`, { content });
  return data;
};

export const deleteComment = async (id) => {
  const { data } = await client.delete(`/community/comments/${id}`);
  return data;
};

export const likePost = async (id) => {
  const { data } = await client.post(`/community/${id}/like`);
  return data;
};
