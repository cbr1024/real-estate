import client from './client';

export const getSchoolsForApartment = async (apartmentId) => {
  const { data } = await client.get(`/schools/apartment/${apartmentId}`);
  return data;
};
