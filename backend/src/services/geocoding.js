const axios = require('axios');

const GEOCODE_URL = 'https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode';

async function geocodeAddress(address) {
  const clientId = process.env.NAVER_MAP_CLIENT_ID;
  const clientSecret = process.env.NAVER_MAP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
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
