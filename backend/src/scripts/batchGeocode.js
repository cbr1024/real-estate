require('dotenv').config();

const pool = require('../config/database');
const { geocodeAddress } = require('../services/geocoding');

async function batchGeocode() {
  const result = await pool.query(
    'SELECT id, name, address FROM apartments WHERE lat IS NULL ORDER BY id'
  );

  console.log(`좌표 없는 아파트: ${result.rows.length}개`);

  let success = 0;
  let failed = 0;

  for (const apt of result.rows) {
    const geo = await geocodeAddress(apt.address);

    if (geo) {
      await pool.query(
        'UPDATE apartments SET lat = $1, lng = $2, road_address = COALESCE(road_address, $3) WHERE id = $4',
        [geo.lat, geo.lng, geo.roadAddress, apt.id]
      );
      success++;
    } else {
      failed++;
    }

    // Rate limit 방지 (100ms 간격)
    await new Promise(resolve => setTimeout(resolve, 100));

    if ((success + failed) % 50 === 0) {
      console.log(`  진행: ${success + failed}/${result.rows.length} (성공: ${success}, 실패: ${failed})`);
    }
  }

  console.log(`\n완료: 성공 ${success}, 실패 ${failed}`);

  const geoCount = await pool.query('SELECT COUNT(*) FROM apartments WHERE lat IS NOT NULL');
  const totalCount = await pool.query('SELECT COUNT(*) FROM apartments');
  console.log(`좌표 있는 아파트: ${geoCount.rows[0].count}/${totalCount.rows[0].count}`);

  process.exit(0);
}

batchGeocode().catch(e => { console.error(e); process.exit(1); });
