const axios = require('axios');
const xml2js = require('xml2js');
const pool = require('../config/database');

const parser = new xml2js.Parser({ explicitArray: false });

// 국토부 API 엔드포인트
const API_ENDPOINTS = {
  sale: 'http://openapi.molit.go.kr:8081/OpenAPI_ToolInstall498/service/rest/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev',
  rent: 'http://openapi.molit.go.kr:8081/OpenAPI_ToolInstallPackage/service/rest/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
};

async function fetchAndInsert({ serviceKey, baseUrl, lawdCd, dealYmd, tradeType }) {
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const response = await axios.get(baseUrl, {
      params: {
        serviceKey,
        LAWD_CD: lawdCd.trim(),
        DEAL_YMD: dealYmd,
      },
      timeout: 30000,
    });

    if (typeof response.data !== 'string' && typeof response.data !== 'object') {
      console.error(`Unexpected response type for ${tradeType} lawdCd ${lawdCd}`);
      return { inserted, skipped, errors: 1 };
    }

    const parsed = await parser.parseStringPromise(
      typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
    );

    const header = parsed.response && parsed.response.header;
    if (header && header.resultCode !== '00') {
      console.error(`API error [${tradeType}] lawdCd ${lawdCd}: ${header.resultMsg || 'Unknown'} (code: ${header.resultCode})`);
      return { inserted, skipped, errors: 1 };
    }

    const body = parsed.response && parsed.response.body;
    if (!body || !body.items || !body.items.item) {
      console.log(`No data [${tradeType}] lawdCd: ${lawdCd}`);
      return { inserted, skipped, errors };
    }

    let items = body.items.item;
    if (!Array.isArray(items)) items = [items];

    for (const item of items) {
      try {
        const aptName = (item['아파트'] || '').trim();
        const year = (item['년'] || '').trim();
        const month = (item['월'] || '').trim().padStart(2, '0');
        const day = (item['일'] || '').trim().padStart(2, '0');
        const area = parseFloat((item['전용면적'] || '0').trim());
        const floor = parseInt((item['층'] || '0').trim(), 10);

        // 매매: 거래금액, 전월세: 보증금(+월세)
        let price;
        if (tradeType === 'sale') {
          price = parseInt((item['거래금액'] || '0').replace(/,/g, '').trim(), 10);
        } else {
          // 전월세: 보증금액
          price = parseInt((item['보증금액'] || item['보증금'] || '0').replace(/,/g, '').trim(), 10);
        }

        // 전월세 구분: 월세가 0이면 전세, 아니면 월세
        let actualTradeType = tradeType;
        if (tradeType === 'rent') {
          const monthlyRent = parseInt((item['월세금액'] || item['월세'] || '0').replace(/,/g, '').trim(), 10);
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

        const aptResult = await pool.query(
          'SELECT id FROM apartments WHERE name = $1 LIMIT 1',
          [aptName]
        );

        if (aptResult.rows.length === 0) {
          skipped++;
          continue;
        }

        await pool.query(
          `INSERT INTO trade_history
           (apartment_id, trade_date, price, floor, area, trade_type, dong, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT DO NOTHING`,
          [
            aptResult.rows[0].id,
            tradeDate,
            price,
            floor,
            area,
            actualTradeType,
            (item['법정동'] || '').trim(),
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

  return { inserted, skipped, errors };
}

async function syncTradeData() {
  const serviceKey = process.env.DATA_GO_KR_API_KEY;

  if (!serviceKey || serviceKey === 'your_data_go_kr_api_key') {
    console.warn('DATA_GO_KR_API_KEY not configured. Skipping data sync.');
    return { totalInserted: 0, totalErrors: 0, skipped: true };
  }

  const now = new Date();
  const dealYmd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const lawdCodes = process.env.LAWD_CODES
    ? process.env.LAWD_CODES.split(',')
    : ['11110'];

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const lawdCd of lawdCodes) {
    // 매매 데이터 수집
    const saleResult = await fetchAndInsert({
      serviceKey,
      baseUrl: API_ENDPOINTS.sale,
      lawdCd,
      dealYmd,
      tradeType: 'sale',
    });
    totalInserted += saleResult.inserted;
    totalSkipped += saleResult.skipped;
    totalErrors += saleResult.errors;

    // 전월세 데이터 수집
    const rentResult = await fetchAndInsert({
      serviceKey,
      baseUrl: API_ENDPOINTS.rent,
      lawdCd,
      dealYmd,
      tradeType: 'rent',
    });
    totalInserted += rentResult.inserted;
    totalSkipped += rentResult.skipped;
    totalErrors += rentResult.errors;
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

  console.log(`Data sync complete: ${totalInserted} inserted, ${totalSkipped} skipped, ${totalErrors} errors`);

  return { totalInserted, totalSkipped, totalErrors };
}

module.exports = { syncTradeData };
