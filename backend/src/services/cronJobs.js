const cron = require('node-cron');
const pool = require('../config/database');
const { syncTradeData } = require('./dataSync');
const { checkPriceAlerts } = require('./alertChecker');
const { scrapePolicy } = require('./policyScraper');
const { scrapeSeoulAuctions } = require('./auctionScraper');

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

  // Daily at 4:00 AM - scrape Seoul apartment auction data
  cron.schedule('0 4 * * *', async () => {
    console.log('Scraping Seoul apartment auctions...');
    try {
      const result = await scrapeSeoulAuctions();
      console.log('Auction scrape completed:', result);
    } catch (err) {
      console.error('Auction scrape failed:', err);
    }
  });

  // 서버 시작 시 정책 데이터가 없으면 즉시 수집
  pool.query('SELECT COUNT(*) FROM policy_announcements').then((r) => {
    if (parseInt(r.rows[0].count, 10) === 0) {
      console.log('No policy data found. Running initial scrape...');
      scrapePolicy(5).catch(console.error);
    }
  }).catch(() => {});

  console.log('Cron jobs initialized');
}

module.exports = { initCronJobs };
