const axios = require('axios');
const xml2js = require('xml2js');
const pool = require('../config/database');

const parser = new xml2js.Parser({ explicitArray: false });

async function syncTradeData() {
  const serviceKey = process.env.DATA_GO_KR_API_KEY;

  if (!serviceKey || serviceKey === 'your_data_go_kr_api_key') {
    console.warn('DATA_GO_KR_API_KEY not configured. Skipping data sync.');
    return { totalInserted: 0, totalErrors: 0, skipped: true };
  }

  const baseUrl = process.env.DATA_GO_KR_BASE_URL ||
    'http://openapi.molit.go.kr/OpenAPI_ToolInstall498/service/rest/RTMSDataSvcAptTradeDev';

  const now = new Date();
  const dealYmd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const lawdCodes = process.env.LAWD_CODES
    ? process.env.LAWD_CODES.split(',')
    : ['11110'];

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const lawdCd of lawdCodes) {
    try {
      const response = await axios.get(baseUrl, {
        params: {
          serviceKey,
          LAWD_CD: lawdCd.trim(),
          DEAL_YMD: dealYmd,
        },
        timeout: 30000,
      });

      // Validate response
      if (typeof response.data !== 'string' && typeof response.data !== 'object') {
        console.error(`Unexpected response type for lawdCd ${lawdCd}: ${typeof response.data}`);
        totalErrors++;
        continue;
      }

      const parsed = await parser.parseStringPromise(
        typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
      );

      // Check API error response
      const header = parsed.response && parsed.response.header;
      if (header && header.resultCode !== '00') {
        console.error(`API error for lawdCd ${lawdCd}: ${header.resultMsg || 'Unknown error'} (code: ${header.resultCode})`);
        totalErrors++;
        continue;
      }

      const body = parsed.response && parsed.response.body;

      if (!body || !body.items || !body.items.item) {
        console.log(`No data returned for lawdCd: ${lawdCd}`);
        continue;
      }

      let items = body.items.item;
      if (!Array.isArray(items)) {
        items = [items];
      }

      for (const item of items) {
        try {
          const aptName = (item['아파트'] || '').trim();
          const rawAmount = (item['거래금액'] || '').replace(/,/g, '').trim();
          const dealAmount = parseInt(rawAmount, 10);
          const year = (item['년'] || '').trim();
          const month = (item['월'] || '').trim().padStart(2, '0');
          const day = (item['일'] || '').trim().padStart(2, '0');
          const area = parseFloat((item['전용면적'] || '0').trim());
          const floor = parseInt((item['층'] || '0').trim(), 10);

          // Validate required fields
          if (!aptName || !year || isNaN(dealAmount) || dealAmount <= 0) {
            totalSkipped++;
            continue;
          }

          const tradeDate = `${year}-${month}-${day}`;

          // Validate date format
          if (isNaN(Date.parse(tradeDate))) {
            totalSkipped++;
            continue;
          }

          // Find or skip if apartment not in DB
          const aptResult = await pool.query(
            'SELECT id FROM apartments WHERE name = $1 LIMIT 1',
            [aptName]
          );

          if (aptResult.rows.length === 0) {
            totalSkipped++;
            continue;
          }

          const apartmentId = aptResult.rows[0].id;

          await pool.query(
            `INSERT INTO trade_history
             (apartment_id, trade_date, price, floor, area, trade_type, dong, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT DO NOTHING`,
            [
              apartmentId,
              tradeDate,
              dealAmount,
              floor,
              area,
              'sale',
              (item['법정동'] || '').trim(),
            ]
          );
          totalInserted++;
        } catch (insertErr) {
          console.error('Error inserting trade record:', insertErr.message);
          totalErrors++;
        }
      }
    } catch (fetchErr) {
      if (fetchErr.code === 'ECONNABORTED') {
        console.error(`Timeout fetching data for lawdCd ${lawdCd}`);
      } else if (fetchErr.response?.status === 429) {
        console.error(`Rate limited by API for lawdCd ${lawdCd}. Waiting 60s...`);
        await new Promise((resolve) => setTimeout(resolve, 60000));
      } else {
        console.error(`Error fetching data for lawdCd ${lawdCd}:`, fetchErr.message);
      }
      totalErrors++;
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
        'trade_data',
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
