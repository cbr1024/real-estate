import client from './client';

export const getColumns = async (params = {}) => {
  const { data } = await client.get('/columns', { params });
  return data;
};

export const getColumn = async (id) => {
  const { data } = await client.get(`/columns/${id}`);
  return data;
};

export const createColumn = async (column) => {
  const { data } = await client.post('/columns', column);
  return data;
};

export const deleteColumn = async (id) => {
  const { data } = await client.delete(`/columns/${id}`);
  return data;
};
