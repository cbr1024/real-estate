const axios = require('axios');
const xml2js = require('xml2js');
const pool = require('../config/database');
const { geocodeAddress } = require('./geocoding');

const parser = new xml2js.Parser({ explicitArray: false });

// 국토부 API 엔드포인트 (data.go.kr HTTPS)
const API_ENDPOINTS = {
  sale: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev',
  rent: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
};

// 법정동 코드 → 시/구 매핑 (주소 조합용)
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

async function findOrCreateApartment(aptName, item, lawdCd) {
  // 기존 아파트 검색
  const existing = await pool.query(
    'SELECT id FROM apartments WHERE name = $1 AND address LIKE $2 LIMIT 1',
    [aptName, `%${(item['법정동'] || '').trim()}%`]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  // 주소 조합
  const sigu = LAWD_MAP[lawdCd] || '';
  const dong = String(item['법정동'] || '').trim();
  const jibun = String(item['지번'] || '').trim();
  const address = `${sigu} ${dong} ${jibun}`.trim();
  const buildYear = parseInt(String(item['건축년도'] || '0'), 10) || null;

  // 지오코딩으로 좌표 획득 (지번 주소로 검색)
  const geocodeQuery = address; // "서울특별시 강남구 대치동 316" 형식
  const geo = await geocodeAddress(geocodeQuery);

  const result = await pool.query(
    `INSERT INTO apartments (name, address, road_address, lat, lng, build_year, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING id`,
    [
      aptName,
      address,
      geo?.roadAddress || null,
      geo?.lat || null,
      geo?.lng || null,
      buildYear,
    ]
  );

  const status = geo ? '좌표 OK' : '좌표 없음';
  console.log(`  [NEW] ${aptName} (${address}) - ${status}`);

  return result.rows[0].id;
}

async function fetchAndInsert({ serviceKey, baseUrl, lawdCd, dealYmd, tradeType }) {
  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  let newApartments = 0;

  try {
    // 페이지별 전체 수집
    let pageNo = 1;
    const numOfRows = 1000;
    let totalCount = 0;
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
        console.error(`API error [${tradeType}] lawdCd ${lawdCd}: ${header.resultMsg || 'Unknown'} (code: ${header.resultCode})`);
        return { inserted, skipped, errors: 1, newApartments };
      }

      const body = data?.response?.body;
      if (!body || !body.items || !body.items.item) {
        if (pageNo === 1) console.log(`No data [${tradeType}] lawdCd: ${lawdCd}`);
        break;
      }

      totalCount = parseInt(body.totalCount || '0', 10);
      let items = body.items.item;
      if (!Array.isArray(items)) items = [items];
      allItems = allItems.concat(items);

      if (allItems.length >= totalCount) break;
      pageNo++;
    }

    if (allItems.length === 0) {
      return { inserted, skipped, errors, newApartments };
    }

    console.log(`  [${tradeType}] ${lawdCd}: ${allItems.length}건 처리중...`);

    for (const item of allItems) {
      try {
        const aptName = (item.aptNm || item['아파트'] || '').trim();
        const year = String(item.dealYear || item['년'] || '').trim();
        const month = String(item.dealMonth || item['월'] || '').trim().padStart(2, '0');
        const day = String(item.dealDay || item['일'] || '').trim().padStart(2, '0');
        const area = parseFloat(item.excluUseAr || item['전용면적'] || '0');
        const floor = parseInt(item.floor || item['층'] || '0', 10);
        const dong = (item.umdNm || item['법정동'] || '').trim();
        const buildYear = parseInt(item.buildYear || item['건축년도'] || '0', 10);
        const jibun = String(item.jibun || item['지번'] || '').trim();

        // API 필드명 통일 (JSON 응답용)
        const itemNormalized = { ...item, '아파트': aptName, '법정동': dong, '건축년도': buildYear, '지번': jibun };

        let price;
        if (tradeType === 'sale') {
          const raw = String(item.dealAmount || item['거래금액'] || '0');
          price = parseInt(raw.replace(/,/g, '').trim(), 10);
        } else {
          const raw = String(item.deposit || item['보증금액'] || item['보증금'] || '0');
          price = parseInt(raw.replace(/,/g, '').trim(), 10);
        }

        let actualTradeType = tradeType;
        if (tradeType === 'rent') {
          const rawRent = String(item.monthlyRent || item['월세금액'] || item['월세'] || '0');
          const monthlyRent = parseInt(rawRent.replace(/,/g, '').trim(), 10);
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

        // 아파트 자동 등록 (없으면 생성)
        const prevCount = await pool.query('SELECT COUNT(*) FROM apartments');
        const apartmentId = await findOrCreateApartment(aptName, itemNormalized, lawdCd);
        const afterCount = await pool.query('SELECT COUNT(*) FROM apartments');
        if (parseInt(afterCount.rows[0].count) > parseInt(prevCount.rows[0].count)) {
          newApartments++;
        }

        await pool.query(
          `INSERT INTO trade_history
           (apartment_id, trade_date, price, floor, area, trade_type, dong, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT DO NOTHING`,
          [
            apartmentId,
            tradeDate,
            price,
            floor,
            area,
            actualTradeType,
            dong,
          ]
        );
        inserted++;
      } catch (insertErr) {
        console.error('Error inserting trade record:', insertErr.message);
        errors++;
      }
    }
  } catch (fetchErr) {
    if (fetchErr.code === 'ECONNABORTED') {
      console.error(`Timeout [${tradeType}] lawdCd ${lawdCd}`);
    } else if (fetchErr.response?.status === 429) {
      console.error(`Rate limited [${tradeType}] lawdCd ${lawdCd}. Waiting 60s...`);
      await new Promise((resolve) => setTimeout(resolve, 60000));
    } else {
      console.error(`Error [${tradeType}] lawdCd ${lawdCd}:`, fetchErr.message);
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

  // 수집 대상 월 (기본: 이번 달)
  const now = new Date();
  const months = options.months || [
    `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  ];

  const lawdCodes = options.lawdCodes || (process.env.LAWD_CODES
    ? process.env.LAWD_CODES.split(',')
    : ['11680']); // 기본: 강남구

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalNewApartments = 0;

  console.log(`=== Data Sync Start ===`);
  console.log(`지역: ${lawdCodes.length}개, 월: ${months.join(', ')}`);

  for (const dealYmd of months) {
    console.log(`\n--- ${dealYmd} 수집 ---`);

    for (const lawdCd of lawdCodes) {
      const area = LAWD_MAP[lawdCd] || lawdCd;
      console.log(`\n[${area}]`);

      // 매매 데이터
      const saleResult = await fetchAndInsert({
        serviceKey, baseUrl: API_ENDPOINTS.sale,
        lawdCd, dealYmd, tradeType: 'sale',
      });
      totalInserted += saleResult.inserted;
      totalSkipped += saleResult.skipped;
      totalErrors += saleResult.errors;
      totalNewApartments += saleResult.newApartments;

      // 전월세 데이터
      const rentResult = await fetchAndInsert({
        serviceKey, baseUrl: API_ENDPOINTS.rent,
        lawdCd, dealYmd, tradeType: 'rent',
      });
      totalInserted += rentResult.inserted;
      totalSkipped += rentResult.skipped;
      totalErrors += rentResult.errors;
      totalNewApartments += rentResult.newApartments;

      // API 호출 간 딜레이 (rate limit 방지)
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Log sync result
  const status = totalErrors > 0
    ? (totalInserted > 0 ? 'partial' : 'failed')
    : 'success';

  try {
    await pool.query(
      `INSERT INTO data_sync_log (api_name, last_sync_at, status, record_count, error_message, created_at)
       VALUES ($1, NOW(), $2, $3, $4, NOW())`,
      [
        'trade_data_all',
        status,
        totalInserted,
        totalErrors > 0 ? `${totalErrors} errors, ${totalSkipped} skipped` : null,
      ]
    );
  } catch (logErr) {
    console.error('Error logging sync result:', logErr.message);
  }

  console.log(`\n=== Data Sync Complete ===`);
  console.log(`신규 아파트: ${totalNewApartments}, 거래: ${totalInserted} inserted, ${totalSkipped} skipped, ${totalErrors} errors`);

  return { totalInserted, totalSkipped, totalErrors, totalNewApartments };
}

module.exports = { syncTradeData };
