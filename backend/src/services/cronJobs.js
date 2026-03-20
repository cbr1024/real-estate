const cron = require('node-cron');
const pool = require('../config/database');
const { syncTradeData, syncCommercialData } = require('./dataSync');
const { checkPriceAlerts } = require('./alertChecker');
const { scrapePolicy } = require('./policyScraper');
const { syncComplexInfo } = require('./complexSync');
const axios = require('axios');

function initCronJobs() {
  // Daily at 2:00 AM - sync trade data from 국토부 실거래가 API
  cron.schedule('0 2 * * *', async () => {
    console.log('Starting daily trade data sync...');
    try {
      const result = await syncTradeData();
      console.log('Daily sync completed:', result);
    } catch (err) {
      console.error('Daily sync failed:', err);
    }
  });

  // Daily at 2:30 AM - sync commercial/officetel trade data
  cron.schedule('30 2 * * *', async () => {
    console.log('Starting commercial data sync...');
    try {
      const result = await syncCommercialData();
      console.log('Commercial sync completed:', result);
    } catch (err) {
      console.error('Commercial sync failed:', err);
    }
  });

  // Daily at 3:00 AM - check price alerts (after data sync)
  cron.schedule('0 3 * * *', async () => {
    console.log('Checking price alerts...');
    try {
      const result = await checkPriceAlerts();
      console.log('Alert check completed:', result);
    } catch (err) {
      console.error('Alert check failed:', err);
    }
  });

  // Daily at 6:00 AM - scrape government policy announcements
  cron.schedule('0 6 * * *', async () => {
    console.log('Scraping policy announcements...');
    try {
      const result = await scrapePolicy(3);
      console.log('Policy scrape completed:', result);
    } catch (err) {
      console.error('Policy scrape failed:', err);
    }
  });

  // Daily at 4:00 AM - trigger auction crawl via Python backoffice
  cron.schedule('0 4 * * *', async () => {
    console.log('Triggering auction crawl via Python server...');
    try {
      const result = await axios.post('http://python-server:8000/api/crawl/auction', {}, { timeout: 10000 });
      console.log('Auction crawl triggered:', result.data);
    } catch (err) {
      console.error('Auction crawl trigger failed:', err.message);
      // 5시에 재시도
      setTimeout(async () => {
        console.log('Retrying auction crawl...');
        try {
          const retry = await axios.post('http://python-server:8000/api/crawl/auction', {}, { timeout: 10000 });
          console.log('Auction crawl retry triggered:', retry.data);
        } catch (retryErr) {
          console.error('Auction crawl retry failed:', retryErr.message);
        }
      }, 60 * 60 * 1000);
    }
  });

  // Weekly on Sunday at 3:30 AM - sync complex info (세대수/동수)
  cron.schedule('30 3 * * 0', async () => {
    console.log('Starting complex info sync...');
    try {
      const result = await syncComplexInfo();
      console.log('Complex info sync completed:', result);
    } catch (err) {
      console.error('Complex info sync failed:', err);
    }
  });

  // 서버 시작 시 정책 데이터가 없으면 즉시 수집
  pool.query('SELECT COUNT(*) FROM policy_announcements').then((r) => {
    if (parseInt(r.rows[0].count, 10) === 0) {
      console.log('No policy data found. Running initial scrape...');
      scrapePolicy(5).catch(console.error);
    }
  }).catch(() => {});

  // 서버 시작 시 세대수/동수 없는 아파트가 있으면 동기화
  pool.query('SELECT COUNT(*) FROM apartments WHERE kapt_code IS NULL AND total_units IS NULL').then((r) => {
    if (parseInt(r.rows[0].count, 10) > 0) {
      console.log(`${r.rows[0].count}개 아파트에 단지정보 없음. 동기화 예약 (60초 후)...`);
      setTimeout(() => syncComplexInfo().catch(console.error), 60000);
    }
  }).catch(() => {});

  console.log('Cron jobs initialized');
}

module.exports = { initCronJobs };
