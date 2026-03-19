const pool = require('../config/database');
const { sendAlertEmail } = require('./mailer');

async function checkPriceAlerts() {
  try {
    // 활성 알림 중, 최근 24시간 내 새 거래가 있는 것만 조회
    const result = await pool.query(
      `SELECT pa.id, pa.user_id, pa.apartment_id, pa.alert_type, pa.target_price,
              u.email, u.nickname,
              a.name AS apartment_name,
              th.price AS new_price, th.trade_date, th.area, th.floor
       FROM price_alerts pa
       JOIN users u ON pa.user_id = u.id
       JOIN apartments a ON pa.apartment_id = a.id
       JOIN LATERAL (
         SELECT price, trade_date, area, floor
         FROM trade_history
         WHERE apartment_id = pa.apartment_id
         ORDER BY created_at DESC LIMIT 1
       ) th ON true
       WHERE pa.is_active = TRUE
         AND th.trade_date >= CURRENT_DATE - INTERVAL '7 days'
         AND (pa.last_notified_at IS NULL OR pa.last_notified_at < NOW() - INTERVAL '24 hours')`
    );

    let sentCount = 0;
    for (const alert of result.rows) {
      // target_price 설정 시 해당 가격 이하일 때만 알림
      if (alert.target_price && alert.new_price > alert.target_price) {
        continue;
      }

      try {
        await sendAlertEmail(alert.email, {
          nickname: alert.nickname,
          apartmentName: alert.apartment_name,
          price: alert.new_price,
          area: alert.area,
          floor: alert.floor,
          tradeDate: alert.trade_date,
        });

        await pool.query(
          'UPDATE price_alerts SET last_notified_at = NOW() WHERE id = $1',
          [alert.id]
        );
        sentCount++;
      } catch (e) {
        console.error(`Failed to send alert email to ${alert.email}:`, e.message);
      }
    }

    return { checked: result.rows.length, sent: sentCount };
  } catch (err) {
    console.error('Error checking price alerts:', err);
    throw err;
  }
}

module.exports = { checkPriceAlerts };
