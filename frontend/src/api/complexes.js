import client from './client';

// 시도별 공동주택 단지 목록
export const getComplexesBySido = async (sidoCode, pageNo = 1, numOfRows = 100) => {
  const response = await client.get('/complexes/sido', {
    params: { sidoCode, pageNo, numOfRows },
  });
  return response.data;
};

// 시군구별 공동주택 단지 목록
export const getComplexesBySigungu = async (sigunguCode, pageNo = 1, numOfRows = 100) => {
  const response = await client.get('/complexes/sigungu', {
    params: { sigunguCode, pageNo, numOfRows },
  });
  return response.data;
};

// 법정동별 공동주택 단지 목록
export const getComplexesByLegaldong = async (bjdCode, pageNo = 1, numOfRows = 100) => {
  const response = await client.get('/complexes/legaldong', {
    params: { bjdCode, pageNo, numOfRows },
  });
  return response.data;
};

// 도로명별 공동주택 단지 목록
export const getComplexesByRoadname = async (roadCode, pageNo = 1, numOfRows = 100) => {
  const response = await client.get('/complexes/roadname', {
    params: { roadCode, pageNo, numOfRows },
  });
  return response.data;
};

// 전체 공동주택 단지 목록
export const getAllComplexes = async (pageNo = 1, numOfRows = 100) => {
  const response = await client.get('/complexes/all', {
    params: { pageNo, numOfRows },
  });
  return response.data;
};

// 단지 기본 정보 조회 (세대수, 동수, 시공사 등)
export const getComplexInfo = async (kaptCode) => {
  const response = await client.get(`/complexes/info/${kaptCode}`);
  return response.data;
};
