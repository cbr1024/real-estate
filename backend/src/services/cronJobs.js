const cron = require('node-cron');
const { syncTradeData } = require('./dataSync');

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

  console.log('Cron jobs initialized');
}

module.exports = { initCronJobs };
