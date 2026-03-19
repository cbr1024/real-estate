const express = require('express');
const axios = require('axios');
const pool = require('../config/database');
const redis = require('../config/redis');
const { trackApiCall, checkDailyLimit } = require('../services/apiUsageTracker');

const router = express.Router();

// 학교 이름에서 학교 유형 추출
function detectSchoolType(name, category) {
  if (/초등학교/.test(name)) return '초등학교';
  if (/중학교/.test(name)) return '중학교';
  if (/고등학교/.test(name)) return '고등학교';
  if (category) {
    if (/초등/.test(category)) return '초등학교';
    if (/중학/.test(category)) return '중학교';
    if (/고등/.test(category)) return '고등학교';
  }
  return '기타';
}

// 두 좌표 간 거리 계산 (미터)
function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// GET /apartment/:id — 아파트 주변 학군 정보
router.get('/apartment/:id', async (req, res) => {
  try {
    const apartmentId = parseInt(req.params.id, 10);
    if (isNaN(apartmentId)) {
      return res.status(400).json({ error: '유효하지 않은 아파트 ID입니다.' });
    }

    // 아파트 좌표 조회
    const aptResult = await pool.query('SELECT lat, lng FROM apartments WHERE id = $1', [apartmentId]);
    if (aptResult.rows.length === 0) {
      return res.status(404).json({ error: '아파트를 찾을 수 없습니다.' });
    }

    const { lat, lng } = aptResult.rows[0];
    if (!lat || !lng) {
      return res.json({ schools: [], message: '좌표 정보가 없습니다.' });
    }

    // Redis 캐시 확인 (아파트 단위, 30일)
    const cacheKey = `schools:apt:${apartmentId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // DB 캐시 확인 (7일 이내 데이터)
    const dbSchools = await pool.query(
      `SELECT school_name, school_type, address, lat, lng, distance, category
       FROM nearby_schools
       WHERE apartment_id = $1 AND fetched_at > NOW() - INTERVAL '7 days'
       ORDER BY distance`,
      [apartmentId]
    );

    if (dbSchools.rows.length > 0) {
      const result = formatSchoolResult(dbSchools.rows);
      await redis.set(cacheKey, JSON.stringify(result), 'EX', 86400 * 7);
      return res.json(result);
    }

    // Naver Places API로 학교 검색
    const { allowed } = await checkDailyLimit('place_search');
    if (!allowed) {
      return res.status(429).json({ error: '일일 API 한도에 도달했습니다.', schools: [] });
    }

    const response = await axios.get('https://naveropenapi.apigw.ntruss.com/map-place/v1/search', {
      params: { query: '학교', coordinate: `${lng},${lat}`, display: 20 },
      headers: {
        'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_MAP_CLIENT_ID,
        'X-NCP-APIGW-API-KEY': process.env.NAVER_MAP_CLIENT_SECRET,
      },
    });

    await trackApiCall('place_search');

    const schools = [];
    if (response.data?.places) {
      for (const p of response.data.places) {
        const pLat = parseFloat(p.y);
        const pLng = parseFloat(p.x);
        const distance = calcDistance(parseFloat(lat), parseFloat(lng), pLat, pLng);

        // 2km 이내 학교만
        if (distance > 2000) continue;

        const schoolType = detectSchoolType(p.name, p.category);
        if (schoolType === '기타') continue;

        const school = {
          school_name: p.name,
          school_type: schoolType,
          address: p.road_address || p.address || '',
          lat: pLat,
          lng: pLng,
          distance,
          category: p.category || '',
        };
        schools.push(school);

        // DB 캐시 저장
        await pool.query(
          `INSERT INTO nearby_schools (apartment_id, school_name, school_type, address, lat, lng, distance, category)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (apartment_id, school_name) DO UPDATE SET
             distance = EXCLUDED.distance, fetched_at = NOW()`,
          [apartmentId, school.school_name, school.school_type, school.address, school.lat, school.lng, school.distance, school.category]
        );
      }
    }

    // 거리 순 정렬
    schools.sort((a, b) => a.distance - b.distance);

    const result = formatSchoolResult(schools);
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 86400 * 7);
    return res.json(result);
  } catch (err) {
    console.error('Error fetching school info:', err.message);
    return res.status(500).json({ error: '학군 정보 조회에 실패했습니다.', schools: [] });
  }
});

function formatSchoolResult(schools) {
  const grouped = {
    초등학교: [],
    중학교: [],
    고등학교: [],
  };

  for (const s of schools) {
    const type = s.school_type;
    if (grouped[type]) {
      grouped[type].push({
        name: s.school_name,
        address: s.address,
        lat: parseFloat(s.lat),
        lng: parseFloat(s.lng),
        distance: s.distance,
      });
    }
  }

  // 각 유형별 가장 가까운 학교 요약
  const summary = {};
  for (const [type, list] of Object.entries(grouped)) {
    if (list.length > 0) {
      summary[type] = {
        nearest: list[0].name,
        distance: list[0].distance,
        count: list.length,
      };
    }
  }

  return {
    schools: grouped,
    summary,
    totalCount: schools.length,
  };
}

module.exports = router;
