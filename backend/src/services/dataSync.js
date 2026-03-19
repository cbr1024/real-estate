const axios = require('axios');
const pool = require('../config/database');
const { geocodeAddress } = require('./geocoding');

// 국토부 API 엔드포인트
const API_ENDPOINTS = {
  sale: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev',
  rent: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
};

// 서울 25개 구 법정동 코드
const SEOUL_LAWD_CODES = [
  '11110', '11140', '11170', '11200', '11215',
  '11230', '11260', '11290', '11305', '11320',
  '11350', '11380', '11410', '11440', '11470',
  '11500', '11530', '11545', '11560', '11590',
  '11620', '11650', '11680', '11710', '11740',
];

const LAWD_MAP = {
  '11110': '서울특별시 종로구', '11140': '서울특별시 중구',
  '11170': '서울특별시 용산구', '11200': '서울특별시 성동구',
  '11215': '서울특별시 광진구', '11230': '서울특별시 동대문구',
  '11260': '서울특별시 중랑구', '11290': '서울특별시 성북구',
  '11305': '서울특별시 강북구', '11320': '서울특별시 도봉구',
  '11350': '서울특별시 노원구', '11380': '서울특별시 은평구',
  '11410': '서울특별시 서대문구', '11440': '서울특별시 마포구',
  '11470': '서울특별시 양천구', '11500': '서울특별시 강서구',
  '11530': '서울특별시 구로구', '11545': '서울특별시 금천구',
  '11560': '서울특별시 영등포구', '11590': '서울특별시 동작구',
  '11620': '서울특별시 관악구', '11650': '서울특별시 서초구',
  '11680': '서울특별시 강남구', '11710': '서울특별시 송파구',
  '11740': '서울특별시 강동구',
};

// 지오코딩 한도는 geocoding.js 내부에서 Redis 기반으로 체크됨

async function findOrCreateApartment(aptName, item, lawdCd) {
  // 기존 아파트 검색
  const existing = await pool.query(
    'SELECT id FROM apartments WHERE name = $1 AND address LIKE $2 LIMIT 1',
    [aptName, `%${(item['법정동'] || '').trim()}%`]
  );

  if (existing.rows.length > 0) {
    return { id: existing.rows[0].id, isNew: false };
  }

  // 주소 조합
  const sigu = LAWD_MAP[lawdCd] || '';
  const dong = String(item['법정동'] || '').trim();
  const jibun = String(item['지번'] || '').trim();
  const address = `${sigu} ${dong} ${jibun}`.trim();
  const buildYear = parseInt(String(item['건축년도'] || '0'), 10) || null;

  // 지오코딩 (일일 한도는 geocoding.js에서 Redis로 체크)
  const geo = await geocodeAddress(address);

  const result = await pool.query(
    `INSERT INTO apartments (name, address, road_address, lat, lng, build_year, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING id`,
    [aptName, address, geo?.roadAddress || null, geo?.lat || null, geo?.lng || null, buildYear]
  );

  const status = geo ? '좌표 OK' : '좌표 없음';
  console.log(`  [NEW] ${aptName} (${address}) - ${status}`);

  return { id: result.rows[0].id, isNew: true };
}

async function fetchAndInsert({ serviceKey, baseUrl, lawdCd, dealYmd, tradeType }) {
  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  let newApartments = 0;

  try {
    let pageNo = 1;
    const numOfRows = 1000;
    let allItems = [];

    while (true) {
      const response = await axios.get(baseUrl, {
        params: {
          serviceKey,
          LAWD_CD: lawdCd.trim(),
          DEAL_YMD: dealYmd,
          pageNo,
          numOfRows,
        },
        timeout: 30000,
      });

      const data = response.data;
      const header = data?.response?.header;
      if (header && header.resultCode !== '000') {
        console.error(`API error [${tradeType}] ${lawdCd}: ${header.resultMsg || 'Unknown'} (${header.resultCode})`);
        return { inserted, skipped, errors: 1, newApartments };
      }

      const body = data?.response?.body;
      if (!body || !body.items || !body.items.item) {
        break;
      }

      const totalCount = parseInt(body.totalCount || '0', 10);
      let items = body.items.item;
      if (!Array.isArray(items)) items = [items];
      allItems = allItems.concat(items);

      if (allItems.length >= totalCount) break;
      pageNo++;
    }

    if (allItems.length === 0) {
      return { inserted, skipped, errors, newApartments };
    }

    console.log(`  [${tradeType}] ${LAWD_MAP[lawdCd] || lawdCd}: ${allItems.length}건`);

    for (const item of allItems) {
      try {
        const aptName = String(item.aptNm || item['아파트'] || '').trim();
        const year = String(item.dealYear || item['년'] || '').trim();
        const month = String(item.dealMonth || item['월'] || '').trim().padStart(2, '0');
        const day = String(item.dealDay || item['일'] || '').trim().padStart(2, '0');
        const area = parseFloat(item.excluUseAr || item['전용면적'] || '0');
        const floor = parseInt(item.floor || item['층'] || '0', 10);
        const dong = (item.umdNm || item['법정동'] || '').trim();
        const buildYear = parseInt(item.buildYear || item['건축년도'] || '0', 10);
        const jibun = String(item.jibun || item['지번'] || '').trim();

        const itemNormalized = { '법정동': dong, '건축년도': buildYear, '지번': jibun };

        let price;
        if (tradeType === 'sale') {
          price = parseInt(String(item.dealAmount || item['거래금액'] || '0').replace(/,/g, '').trim(), 10);
        } else {
          price = parseInt(String(item.deposit || item['보증금액'] || item['보증금'] || '0').replace(/,/g, '').trim(), 10);
        }

        let actualTradeType = tradeType;
        if (tradeType === 'rent') {
          const monthlyRent = parseInt(String(item.monthlyRent || item['월세금액'] || item['월세'] || '0').replace(/,/g, '').trim(), 10);
          actualTradeType = monthlyRent > 0 ? 'monthly' : 'jeonse';
        }

        if (!aptName || !year || isNaN(price) || price <= 0) {
          skipped++;
          continue;
        }

        const tradeDate = `${year}-${month}-${day}`;
        if (isNaN(Date.parse(tradeDate))) {
          skipped++;
          continue;
        }

        const { id: apartmentId, isNew } = await findOrCreateApartment(aptName, itemNormalized, lawdCd);
        if (isNew) newApartments++;

        await pool.query(
          `INSERT INTO trade_history
           (apartment_id, trade_date, price, floor, area, trade_type, dong, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT DO NOTHING`,
          [apartmentId, tradeDate, price, floor, area, actualTradeType, dong]
        );
        inserted++;
      } catch (insertErr) {
        console.error('Insert error:', insertErr.message);
        errors++;
      }
    }
  } catch (fetchErr) {
    if (fetchErr.response?.status === 429) {
      console.error(`Rate limited [${tradeType}] ${lawdCd}. 60s 대기...`);
      await new Promise((r) => setTimeout(r, 60000));
    } else {
      console.error(`Fetch error [${tradeType}] ${lawdCd}:`, fetchErr.message);
    }
    errors++;
  }

  return { inserted, skipped, errors, newApartments };
}

async function syncTradeData(options = {}) {
  const serviceKey = process.env.DATA_GO_KR_API_KEY;

  if (!serviceKey || serviceKey === 'your_data_go_kr_api_key') {
    console.warn('DATA_GO_KR_API_KEY not configured. Skipping data sync.');
    return { totalInserted: 0, totalErrors: 0, skipped: true };
  }

  // 수집 대상 월 (기본: 이번 달 + 지난 달)
  const now = new Date();
  const thisMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const months = options.months || [lastMonth, thisMonth];

  // 서울 25개 구 전체 (환경변수로 오버라이드 가능)
  const lawdCodes = options.lawdCodes || (process.env.LAWD_CODES
    ? process.env.LAWD_CODES.split(',')
    : SEOUL_LAWD_CODES);

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalNewApartments = 0;

  console.log(`=== Data Sync Start ===`);
  console.log(`지역: ${lawdCodes.length}개 구, 월: ${months.join(', ')}`);

  for (const dealYmd of months) {
    console.log(`\n--- ${dealYmd} ---`);

    for (const lawdCd of lawdCodes) {
      // 매매
      const saleResult = await fetchAndInsert({
        serviceKey, baseUrl: API_ENDPOINTS.sale,
        lawdCd, dealYmd, tradeType: 'sale',
      });
      totalInserted += saleResult.inserted;
      totalSkipped += saleResult.skipped;
      totalErrors += saleResult.errors;
      totalNewApartments += saleResult.newApartments;

      // 전월세
      const rentResult = await fetchAndInsert({
        serviceKey, baseUrl: API_ENDPOINTS.rent,
        lawdCd, dealYmd, tradeType: 'rent',
      });
      totalInserted += rentResult.inserted;
      totalSkipped += rentResult.skipped;
      totalErrors += rentResult.errors;
      totalNewApartments += rentResult.newApartments;

      // API 호출 간 딜레이 (rate limit 방지: 1초)
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // 결과 로그
  const status = totalErrors > 0
    ? (totalInserted > 0 ? 'partial' : 'failed')
    : 'success';

  try {
    await pool.query(
      `INSERT INTO data_sync_log (api_name, last_sync_at, status, record_count, error_message, created_at)
       VALUES ($1, NOW(), $2, $3, $4, NOW())`,
      ['trade_data_all', status, totalInserted,
       totalErrors > 0 ? `${totalErrors} errors, ${totalSkipped} skipped` : null]
    );
  } catch (logErr) {
    console.error('Log error:', logErr.message);
  }

  console.log(`\n=== Data Sync Complete ===`);
  console.log(`신규 아파트: ${totalNewApartments}, 거래: ${totalInserted} inserted, ${totalSkipped} skipped, ${totalErrors} errors`);
  return { totalInserted, totalSkipped, totalErrors, totalNewApartments };
}

module.exports = { syncTradeData };
