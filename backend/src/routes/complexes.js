const express = require('express');
const axios = require('axios');
const pool = require('../config/database');
const redis = require('../config/redis');

const router = express.Router();

const LIST_BASE_URL = 'https://apis.data.go.kr/1613000/AptListService3';
const INFO_BASE_URL = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV3';
const API_KEY = () => process.env.DATA_GO_KR_API_KEY;
const CACHE_TTL = 60 * 60 * 24; // 24시간

async function fetchFromMolit(baseUrl, endpoint, params) {
  const serviceKey = API_KEY();
  if (!serviceKey) {
    throw new Error('DATA_GO_KR_API_KEY가 설정되지 않았습니다.');
  }

  const response = await axios.get(`${baseUrl}/${endpoint}`, {
    params: {
      serviceKey,
      numOfRows: params.numOfRows || '100',
      pageNo: params.pageNo || '1',
      ...params,
    },
    timeout: 10000,
  });

  const data = response.data;

  if (data?.response?.header?.resultCode && data.response.header.resultCode !== '00') {
    throw new Error(`API 오류: ${data.response.header.resultMsg}`);
  }

  const body = data?.response?.body;
  const items = body?.items?.item || [];
  const totalCount = parseInt(body?.totalCount, 10) || 0;
  const itemList = Array.isArray(items) ? items : items ? [items] : [];

  return { totalCount, body, items: itemList };
}

// ─── 단지 목록 API ───

function formatListItems(items) {
  return items.map(item => ({
    kaptCode: item.kaptCode,
    kaptName: item.kaptName,
    as1: item.as1 || null,
    as2: item.as2 || null,
    as3: item.as3 || null,
    as4: item.as4 || null,
    bjdCode: item.bjdCode || null,
    doroJuso: item.doroJuso || null,
  }));
}

function listResponse(result) {
  return {
    totalCount: result.totalCount,
    pageNo: parseInt(result.body?.pageNo, 10) || 1,
    numOfRows: parseInt(result.body?.numOfRows, 10) || 100,
    items: formatListItems(result.items),
  };
}

// GET /complexes/sido
router.get('/sido', async (req, res) => {
  try {
    const { sidoCode, pageNo, numOfRows } = req.query;
    if (!sidoCode) return res.status(400).json({ error: 'sidoCode는 필수입니다.' });

    const cacheKey = `complexes:sido:${sidoCode}:${pageNo || 1}:${numOfRows || 100}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const result = await fetchFromMolit(LIST_BASE_URL, 'getSidoAptList3', { sidoCode, pageNo, numOfRows });
    const response = listResponse(result);
    await redis.set(cacheKey, JSON.stringify(response), 'EX', CACHE_TTL);
    return res.json(response);
  } catch (err) {
    console.error('Error fetching sido apt list:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /complexes/sigungu
router.get('/sigungu', async (req, res) => {
  try {
    const { sigunguCode, pageNo, numOfRows } = req.query;
    if (!sigunguCode) return res.status(400).json({ error: 'sigunguCode는 필수입니다.' });

    const cacheKey = `complexes:sigungu:${sigunguCode}:${pageNo || 1}:${numOfRows || 100}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const result = await fetchFromMolit(LIST_BASE_URL, 'getSigunguAptList3', { sigunguCode, pageNo, numOfRows });
    const response = listResponse(result);
    await redis.set(cacheKey, JSON.stringify(response), 'EX', CACHE_TTL);
    return res.json(response);
  } catch (err) {
    console.error('Error fetching sigungu apt list:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /complexes/legaldong
router.get('/legaldong', async (req, res) => {
  try {
    const { bjdCode, pageNo, numOfRows } = req.query;
    if (!bjdCode) return res.status(400).json({ error: 'bjdCode는 필수입니다.' });

    const cacheKey = `complexes:bjd:${bjdCode}:${pageNo || 1}:${numOfRows || 100}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const result = await fetchFromMolit(LIST_BASE_URL, 'getLegaldongAptList3', { bjdCode, pageNo, numOfRows });
    const response = listResponse(result);
    await redis.set(cacheKey, JSON.stringify(response), 'EX', CACHE_TTL);
    return res.json(response);
  } catch (err) {
    console.error('Error fetching legaldong apt list:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /complexes/roadname
router.get('/roadname', async (req, res) => {
  try {
    const { roadCode, pageNo, numOfRows } = req.query;
    if (!roadCode) return res.status(400).json({ error: 'roadCode는 필수입니다.' });

    const cacheKey = `complexes:road:${roadCode}:${pageNo || 1}:${numOfRows || 100}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const result = await fetchFromMolit(LIST_BASE_URL, 'getRoadnameAptList3', { roadCode, pageNo, numOfRows });
    const response = listResponse(result);
    await redis.set(cacheKey, JSON.stringify(response), 'EX', CACHE_TTL);
    return res.json(response);
  } catch (err) {
    console.error('Error fetching roadname apt list:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /complexes/all
router.get('/all', async (req, res) => {
  try {
    const { pageNo, numOfRows } = req.query;

    const cacheKey = `complexes:all:${pageNo || 1}:${numOfRows || 100}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const result = await fetchFromMolit(LIST_BASE_URL, 'getTotalAptList3', { pageNo, numOfRows });
    const response = listResponse(result);
    await redis.set(cacheKey, JSON.stringify(response), 'EX', CACHE_TTL);
    return res.json(response);
  } catch (err) {
    console.error('Error fetching total apt list:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── 기본 정보 API ───

// GET /complexes/info/:kaptCode — 단지 기본 정보 조회
router.get('/info/:kaptCode', async (req, res) => {
  try {
    const { kaptCode } = req.params;

    const cacheKey = `complex:info:${kaptCode}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const serviceKey = API_KEY();
    if (!serviceKey) return res.status(500).json({ error: 'API 키 미설정' });

    const response = await axios.get(`${INFO_BASE_URL}/getAphusBassInfoV3`, {
      params: { serviceKey, kaptCode },
      timeout: 10000,
    });

    const data = response.data;
    if (data?.response?.header?.resultCode !== '00') {
      throw new Error(data?.response?.header?.resultMsg || 'API 오류');
    }

    const item = data?.response?.body?.item || {};
    const info = {
      kaptCode: item.kaptCode,
      kaptName: item.kaptName,
      kaptAddr: item.kaptAddr,
      doroJuso: item.doroJuso,
      codeSaleNm: item.codeSaleNm,       // 분양형태
      codeHeatNm: item.codeHeatNm,       // 난방방식
      codeAptNm: item.codeAptNm,         // 단지분류
      codeMgrNm: item.codeMgrNm,         // 관리방식
      codeHallNm: item.codeHallNm,       // 복도유형
      kaptTarea: item.kaptTarea ? parseFloat(item.kaptTarea) : null,   // 연면적
      kaptDongCnt: item.kaptDongCnt ? parseInt(item.kaptDongCnt, 10) : null,  // 동수
      kaptdaCnt: item.kaptdaCnt ? parseInt(item.kaptdaCnt, 10) : null,        // 세대수
      kaptMparea60: item.kaptMparea_60 ? parseInt(item.kaptMparea_60, 10) : null,   // 60㎡이하
      kaptMparea85: item.kaptMparea_85 ? parseInt(item.kaptMparea_85, 10) : null,   // 85㎡이하
      kaptMparea135: item.kaptMparea_135 ? parseInt(item.kaptMparea_135, 10) : null, // 135㎡이하
      kaptBcompany: item.kaptBcompany || null,   // 시공사
      kaptAcompany: item.kaptAcompany || null,   // 시행사
      kaptTel: item.kaptTel || null,
      kaptUsedate: item.kaptUsedate || null,     // 사용승인일
      bjdCode: item.bjdCode || null,
    };

    await redis.set(cacheKey, JSON.stringify(info), 'EX', CACHE_TTL);
    return res.json(info);
  } catch (err) {
    console.error('Error fetching complex info:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
