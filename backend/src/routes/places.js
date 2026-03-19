const express = require('express');
const axios = require('axios');
const redis = require('../config/redis');
const { trackApiCall, checkDailyLimit } = require('../services/apiUsageTracker');

const router = express.Router();

// GET /nearby — 주변 시설 검색 (학교, 지하철)
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, type } = req.query;
    if (!lat || !lng || !type) {
      return res.status(400).json({ error: 'lat, lng, type 파라미터가 필요합니다.' });
    }

    const queryMap = { school: '학교', subway: '지하철역' };
    const query = queryMap[type];
    if (!query) {
      return res.status(400).json({ error: '유효하지 않은 type입니다.' });
    }

    // 캐시 확인 (넓은 범위)
    const roundedLat = parseFloat(lat).toFixed(2);
    const roundedLng = parseFloat(lng).toFixed(2);
    const cacheKey = `places:${type}:${roundedLat}:${roundedLng}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    // 일일 한도 체크
    const { allowed, remaining } = await checkDailyLimit('place_search');
    if (!allowed) {
      return res.status(429).json({
        error: '일일 API 한도에 도달했습니다. 내일 다시 시도해주세요.',
        places: [],
      });
    }

    const response = await axios.get('https://naveropenapi.apigw.ntruss.com/map-place/v1/search', {
      params: { query, coordinate: `${lng},${lat}` },
      headers: {
        'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_MAP_CLIENT_ID,
        'X-NCP-APIGW-API-KEY': process.env.NAVER_MAP_CLIENT_SECRET,
      },
    });

    // 호출 기록
    await trackApiCall('place_search');

    let places = [];
    if (response.data?.places) {
      places = response.data.places.map((p) => ({
        name: p.name,
        address: p.road_address || p.address,
        lat: parseFloat(p.y),
        lng: parseFloat(p.x),
        category: p.category,
        distance: p.distance ? parseInt(p.distance, 10) : null,
      }));
    }

    const result = { places };
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 86400 * 7); // 7일 캐시
    return res.json(result);
  } catch (err) {
    console.error('Error fetching nearby places:', err.message);
    return res.status(500).json({ error: '주변 시설 검색에 실패했습니다.', places: [] });
  }
});

module.exports = router;
