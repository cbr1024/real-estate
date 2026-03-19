import client from './client';

export const getDiscussions = async (params = {}) => {
  const { data } = await client.get('/discussions', { params });
  return data;
};

export const getDiscussion = async (id) => {
  const { data } = await client.get(`/discussions/${id}`);
  return data;
};

export const createDiscussion = async (discussion) => {
  const { data } = await client.post('/discussions', discussion);
  return data;
};

export const deleteDiscussion = async (id) => {
  const { data } = await client.delete(`/discussions/${id}`);
  return data;
};

export const voteDiscussion = async (id, vote) => {
  const { data } = await client.post(`/discussions/${id}/vote`, { vote });
  return data;
};

export const createDiscussionComment = async (id, content) => {
  const { data } = await client.post(`/discussions/${id}/comments`, { content });
  return data;
};
