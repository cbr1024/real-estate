const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');
const pool = require('../config/database');

const agent = new https.Agent({ rejectUnauthorized: false });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0';
const BASE_URL = 'https://www.molit.go.kr/USR/NEWS/m_71';

// 부동산 관련 카테고리 필터
const REAL_ESTATE_CATEGORIES = ['주택토지', '건설', '부동산'];

async function fetchWithCookie(url) {
  // 국토교통부는 첫 요청에서 쿠키를 발급하고 307 리다이렉트함
  const first = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 15000,
    maxRedirects: 0,
    httpsAgent: agent,
    validateStatus: () => true,
  });

  const cookie = first.headers['set-cookie']?.[0]?.split(';')[0];
  if (!cookie) throw new Error('No cookie received');

  const second = await axios.get(url, {
    headers: { 'User-Agent': UA, Cookie: cookie },
    timeout: 15000,
    httpsAgent: agent,
  });

  return second.data;
}

async function scrapePolicy(pages = 3) {
  let totalInserted = 0;
  let totalSkipped = 0;

  for (let page = 1; page <= pages; page++) {
    try {
      const url = `${BASE_URL}/lst.jsp?lcmspage=${page}`;
      const html = await fetchWithCookie(url);
      const $ = cheerio.load(html);

      const rows = $('tbody tr');
      console.log(`  [국토교통부] 페이지 ${page}: ${rows.length}건`);

      for (let i = 0; i < rows.length; i++) {
        const row = $(rows[i]);
        const num = row.find('.bd_num').text().trim();
        const titleEl = row.find('.bd_title a');
        const title = titleEl.text().replace(/\s+/g, ' ').trim();
        const href = titleEl.attr('href') || '';
        const category = row.find('.bd_field').text().trim();
        const dateStr = row.find('.bd_date').text().trim();
        const views = parseInt(row.find('.bd_inquiry').text().trim(), 10) || 0;

        if (!title || !num) continue;

        // href에서 id 추출: "dtl.jsp?lcmspage=1&id=95091798"
        const idMatch = href.match(/id=(\d+)/);
        const sourceId = idMatch ? idMatch[1] : num;
        const detailUrl = idMatch ? `${BASE_URL}/dtl.jsp?id=${idMatch[1]}` : '';

        try {
          await pool.query(
            `INSERT INTO policy_announcements (source, source_id, title, category, url, published_at, views)
             VALUES ('molit', $1, $2, $3, $4, $5, $6)
             ON CONFLICT (source, source_id) DO UPDATE SET views = $6, title = $2`,
            [sourceId, title, category, detailUrl, dateStr || null, views]
          );
          totalInserted++;
        } catch (err) {
          totalSkipped++;
        }
      }

      // 페이지 간 딜레이
      if (page < pages) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (err) {
      console.error(`  [국토교통부] 페이지 ${page} 오류:`, err.message);
    }
  }

  console.log(`  [국토교통부] 완료: ${totalInserted}건 저장, ${totalSkipped}건 스킵`);
  return { inserted: totalInserted, skipped: totalSkipped };
}

module.exports = { scrapePolicy };
