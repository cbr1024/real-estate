require('dotenv').config();

const { syncTradeData } = require('../services/dataSync');

// 서울 25개 구 법정동코드
const SEOUL_LAWD_CODES = [
  '11680', // 강남구
  '11650', // 서초구
  '11710', // 송파구
  '11740', // 강동구
  '11560', // 영등포구
  '11440', // 마포구
  '11470', // 양천구
  '11500', // 강서구
  '11200', // 성동구
  '11215', // 광진구
  '11170', // 용산구
  '11110', // 종로구
  '11140', // 중구
  '11230', // 동대문구
  '11260', // 중랑구
  '11290', // 성북구
  '11305', // 강북구
  '11320', // 도봉구
  '11350', // 노원구
  '11380', // 은평구
  '11410', // 서대문구
  '11530', // 구로구
  '11545', // 금천구
  '11590', // 동작구
  '11620', // 관악구
];

// 최근 3개월
function getRecentMonths(count) {
  const months = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push(ym);
  }
  return months;
}

async function run() {
  console.log('=== 초기 데이터 수집 시작 ===');
  console.log('서울 25개구, 최근 3개월\n');

  const months = getRecentMonths(3);

  try {
    const result = await syncTradeData({
      lawdCodes: SEOUL_LAWD_CODES,
      months,
    });

    console.log('\n=== 최종 결과 ===');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Initial sync failed:', err);
  }

  // 완료 후 DB 통계
  const pool = require('../config/database');
  try {
    const aptCount = await pool.query('SELECT COUNT(*) FROM apartments');
    const tradeCount = await pool.query('SELECT COUNT(*) FROM trade_history');
    const geoCount = await pool.query('SELECT COUNT(*) FROM apartments WHERE lat IS NOT NULL');

    console.log(`\n=== DB 통계 ===`);
    console.log(`아파트: ${aptCount.rows[0].count}개`);
    console.log(`좌표 있는 아파트: ${geoCount.rows[0].count}개`);
    console.log(`거래 내역: ${tradeCount.rows[0].count}건`);
  } catch (e) {
    console.error('Stats query failed:', e.message);
  }

  process.exit(0);
}

run();
