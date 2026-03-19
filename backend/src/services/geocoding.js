const axios = require('axios');
const { trackApiCall, checkDailyLimit } = require('./apiUsageTracker');

const GEOCODE_URL = 'https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode';

async function geocodeAddress(address) {
  const clientId = process.env.NAVER_MAP_CLIENT_ID;
  const clientSecret = process.env.NAVER_MAP_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  // 일일 한도 체크
  const { allowed } = await checkDailyLimit('geocode');
  if (!allowed) {
    console.warn(`[Geocode] 일일 한도 초과. "${address}" 스킵`);
    return null;
  }

  try {
    const response = await axios.get(GEOCODE_URL, {
      params: { query: address },
      headers: {
        'X-NCP-APIGW-API-KEY-ID': clientId,
        'X-NCP-APIGW-API-KEY': clientSecret,
      },
      timeout: 5000,
    });

    // 호출 기록
    await trackApiCall('geocode');

    const { addresses } = response.data;
    if (addresses && addresses.length > 0) {
      return {
        lat: parseFloat(addresses[0].y),
        lng: parseFloat(addresses[0].x),
        roadAddress: addresses[0].roadAddress || null,
      };
    }

    return null;
  } catch (err) {
    console.error(`Geocoding failed for "${address}":`, err.message);
    return null;
  }
}

module.exports = { geocodeAddress };
