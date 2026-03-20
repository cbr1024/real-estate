const express = require('express');
const axios = require('axios');
const redis = require('../config/redis');
const { trackApiCall, checkDailyLimit, checkUserDailyLimit, trackUserCall } = require('../services/apiUsageTracker');

const router = express.Router();

// 선택적 인증 (사용자별 제한용)
const optionalAuth = async (req, res, next) => {
  const token = req.cookies?.access_token
    || (req.headers.authorization?.startsWith('Bearer ') && req.headers.authorization.split(' ')[1]);
  if (!token) return next();
  try {
    const jwt = require('jsonwebtoken');
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (_) {}
  next();
};

// GET /nearby — 주변 시설 검색 (학교, 지하철)
// 네이버 검색 API(지역검색) 사용 — 일 25,000건 무료
router.get('/nearby', optionalAuth, async (req, res) => {
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

    // 1. 캐시 확인 (좌표 소수점 2자리 기준, 7일 캐시)
    const roundedLat = parseFloat(lat).toFixed(2);
    const roundedLng = parseFloat(lng).toFixed(2);
    const cacheKey = `places:${type}:${roundedLat}:${roundedLng}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    // 2. 전체 일일 한도 체크 (일 20,000건 안전 한도)
    const globalLimit = await checkDailyLimit('place_search');
    if (!globalLimit.allowed) {
      return res.status(429).json({
        error: '일일 API 한도에 도달했습니다. 내일 다시 시도해주세요.',
        places: [],
        remaining: 0,
      });
    }

    // 3. 사용자별 일일 한도 체크 (50회/일)
    const userId = req.user?.id || req.ip;
    const userLimit = await checkUserDailyLimit('place_search', userId);
    if (!userLimit.allowed) {
      return res.status(429).json({
        error: '사용자 일일 검색 한도에 도달했습니다.',
        places: [],
        remaining: 0,
      });
    }

    // 4. 네이버 검색 API 키 확인
    const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
    const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(503).json({ error: '검색 서비스가 설정되지 않았습니다.', places: [] });
    }

    // 5. 역지오코딩으로 지역명 얻기 (캐시)
    const geoKey = `geo_name:${roundedLat}:${roundedLng}`;
    let areaName = await redis.get(geoKey);
    if (!areaName) {
      // 좌표 → 주소 변환 시도 (간단한 매핑)
      // 기본값: 서울 사용
      areaName = '서울';
      try {
        const geoRes = await axios.get('https://naveropenapi.apigw.ntruss.com/map-reversegeocode/v2/gc', {
          params: { coords: `${lng},${lat}`, output: 'json', orders: 'legalcode' },
          headers: {
            'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_MAP_CLIENT_ID,
            'X-NCP-APIGW-API-KEY': process.env.NAVER_MAP_CLIENT_SECRET,
          },
          timeout: 5000,
        });
        const region = geoRes.data?.results?.[0]?.region;
        if (region) {
          // "강남구"만 사용 (시/도 제외 — 검색 정확도 향상)
          areaName = region.area2?.name || region.area1?.name || '서울';
        }
      } catch (_) {}
      await redis.set(geoKey, areaName, 'EX', 86400 * 30);
    }


    // 검색 키워드 구성
    const queries = type === 'school'
      ? [`${areaName} 초등학교`, `${areaName} 중학교`, `${areaName} 고등학교`]
      : [`${areaName} 지하철역`];

    const baseLat = parseFloat(lat);
    const baseLng = parseFloat(lng);
    let places = [];

    for (const q of queries) {

      const response = await axios.get('https://openapi.naver.com/v1/search/local.json', {
        params: { query: q, display: 5 },
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
        timeout: 10000,
      });

      // 호출 기록
      await trackApiCall('place_search');
      await trackUserCall('place_search', userId);


      if (response.data?.items) {
        const parsed = response.data.items
          .filter((item) => item.mapx && item.mapy)
          .map((item) => {
            const pLng = parseFloat(item.mapx) / 10000000;
            const pLat = parseFloat(item.mapy) / 10000000;

            const R = 6371000;
            const dLat = ((pLat - baseLat) * Math.PI) / 180;
            const dLng = ((pLng - baseLng) * Math.PI) / 180;
            const a = Math.sin(dLat / 2) ** 2 +
              Math.cos((baseLat * Math.PI) / 180) * Math.cos((pLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
            const distance = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));

            return {
              name: item.title.replace(/<[^>]*>/g, ''),
              address: item.roadAddress || item.address || '',
              lat: pLat,
              lng: pLng,
              category: item.category || '',
              distance,
            };
          })
          .filter((p) => {
            if (p.distance > 3000) return false;
            if (type === 'school') return /초등학교|중학교|고등학교/.test(p.category);
            return true;
          });


        places = places.concat(parsed);
      }
    }

    // 중복 제거 + 거리순 정렬
    const seen = new Set();
    places = places
      .filter((p) => { if (seen.has(p.name)) return false; seen.add(p.name); return true; })
      .sort((a, b) => a.distance - b.distance);

    const result = { places, remaining: globalLimit.remaining - 1 };
    // 결과가 있을 때만 캐시 (빈 결과는 캐시하지 않음)
    if (places.length > 0) {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', 86400 * 7);
    }
    return res.json(result);
  } catch (err) {
    console.error('Error fetching nearby places:', err.message);
    return res.status(500).json({ error: '주변 시설 검색에 실패했습니다.', places: [] });
  }
});

module.exports = router;
