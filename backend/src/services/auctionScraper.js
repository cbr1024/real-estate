const axios = require('axios');
const pool = require('../config/database');

const SEARCH_URL = 'https://www.courtauction.go.kr/pgj//pgjsearch/searchControllerMain.on';
const BASE_URL = 'https://www.courtauction.go.kr';

// 서울 법원 코드 (새 시스템 NELS 기준)
const SEOUL_COURTS = [
  { code: '0001', name: '서울중앙지방법원' },
  { code: '0008', name: '서울동부지방법원' },
  { code: '0012', name: '서울서부지방법원' },
  { code: '0009', name: '서울남부지방법원' },
  { code: '0010', name: '서울북부지방법원' },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 아파트 매칭
async function matchApartment(address) {
  if (!address) return null;
  try {
    const aptMatch = address.match(/([가-힣]+아파트|[가-힣]+\d+차)/);
    if (aptMatch) {
      const result = await pool.query(
        `SELECT id FROM apartments WHERE name ILIKE $1 LIMIT 1`,
        [`%${aptMatch[1]}%`]
      );
      if (result.rows.length > 0) return result.rows[0].id;
    }
    const parts = address.split(' ').filter(Boolean);
    if (parts.length >= 3) {
      const result = await pool.query(
        `SELECT id FROM apartments WHERE address ILIKE $1 LIMIT 1`,
        [`%${parts.slice(0, 3).join('%')}%`]
      );
      if (result.rows.length > 0) return result.rows[0].id;
    }
  } catch (_) {}
  return null;
}

// 대법원 경매 물건검색 API 호출
async function fetchAuctionSearch(courtCode, pageNo = 1) {
  try {
    const payload = [
      // dma_pageInfo
      {
        pageNo: String(pageNo),
        page: '20',
        bfPageNo: '',
        startRowNo: String((pageNo - 1) * 20),
        totalCnt: '',
        totalYn: pageNo === 1 ? 'Y' : 'N',
      },
      // dma_srchGdsDtlSrchInfo
      {
        rletDspslSpcCondCd: '',
        bidDvsCd: '000331',       // 경매
        mvprpRletDvsCd: '0001',   // 부동산
        cortAuctnSrchCondCd: '2', // 소재지별
        rprsAdongSdCd: '11',      // 서울
        rprsAdongSggCd: '',
        rprsAdongEmdCd: '',
        rdnmSdCd: '',
        rdnmSggCd: '',
        rdnmNo: '',
        mvprpDspslPlcAdongSdCd: '',
        mvprpDspslPlcAdongSggCd: '',
        mvprpDspslPlcAdongEmdCd: '',
        rdDspslPlcAdongSdCd: '',
        rdDspslPlcAdongSggCd: '',
        rdDspslPlcAdongEmdCd: '',
        cortOfcCd: courtCode,
        jdbnCd: '',
        execrOfcDvsCd: '',
        lclDspslGdsLstUsgCd: '0000802', // 아파트
        mclDspslGdsLstUsgCd: '',
        sclDspslGdsLstUsgCd: '',
        cortAuctnMbrsId: '',
        aeeEvlAmtMin: '',
        aeeEvlAmtMax: '',
        rletLwsDspslPrcMin: '',
        rletLwsDspslPrcMax: '',
        mvprpLwsDspslPrcMin: '',
        mvprpLwsDspslPrcMax: '',
        lwsDspslPrcRateMin: '',
        lwsDspslPrcRateMax: '',
        flbdNcntMin: '',
        flbdNcntMax: '',
        objctArDtsMin: '',
        objctArDtsMax: '',
        mvprpArtclKndCd: '',
        mvprpArtclNm: '',
        mvprpAtchmPlcTypCd: '',
        notifyLoc: '',
        lafjOrderBy: '1',
        pgmId: 'PGJ151M01',
        csNo: '',
        cortStDvs: '',
        statNum: '',
        bidBgngYmd: '',
        bidEndYmd: '',
      },
    ];

    const response = await axios.post(SEARCH_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': `${BASE_URL}/pgj/index.on`,
        'Origin': BASE_URL,
      },
      timeout: 30000,
    });

    return response.data;
  } catch (err) {
    console.error(`[AuctionScraper] API 호출 실패 (court: ${courtCode}, page: ${pageNo}):`, err.message);
    return null;
  }
}

// API 응답 파싱
function parseAuctionResponse(data, courtName) {
  const items = [];
  if (!data) return items;

  // 응답 구조 확인 — WebSquare JSON 응답
  let list = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (data.data && Array.isArray(data.data)) {
    list = data.data;
  } else if (data.result && Array.isArray(data.result)) {
    list = data.result;
  } else if (data.dlt_gdsDtlSrchLst) {
    list = data.dlt_gdsDtlSrchLst;
  } else {
    // 중첩 구조 탐색
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key]) && data[key].length > 0) {
        list = data[key];
        break;
      }
    }
  }

  for (const item of list) {
    try {
      const caseNumber = item.csNo || item.caseNo || '';
      if (!caseNumber) continue;

      const address = item.dspslPlcAdrs || item.addr || item.address || '';
      const detailAddr = item.dspslGdsNm || item.dtlAddr || '';
      const appraisalValue = parseInt(String(item.aeeEvlAmt || item.appraisalAmt || 0).replace(/[^\d]/g, ''), 10) || null;
      const minimumPrice = parseInt(String(item.lwsDspslPrc || item.minPrice || 0).replace(/[^\d]/g, ''), 10) || null;

      let auctionDate = null;
      const dateStr = item.dspslDxdyYmd || item.auctionDate || '';
      if (dateStr.length >= 8) {
        auctionDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
      }

      const failCount = parseInt(item.flbdNcnt || item.failCount || 0, 10);
      const area = parseFloat(item.objctArDts || item.area || 0) || null;
      const floor = parseInt(item.flrInfo || item.floor || 0, 10) || null;
      const cortOfcCd = item.cortOfcCd || '';

      items.push({
        case_number: caseNumber,
        court_name: courtName,
        address,
        detail_address: detailAddr,
        area,
        floor,
        appraisal_value: appraisalValue,
        minimum_price: minimumPrice,
        auction_date: auctionDate,
        fail_count: failCount,
        status: 'scheduled',
        court_url: `${BASE_URL}/pgj/index.on`,
      });
    } catch (_) {}
  }

  return items;
}

// 메인 스크래핑 함수
async function scrapeSeoulAuctions() {
  console.log('[AuctionScraper] 서울 아파트 경매 정보 수집 시작...');
  let totalSaved = 0;
  let totalErrors = 0;

  for (const court of SEOUL_COURTS) {
    console.log(`[AuctionScraper] ${court.name} (${court.code}) 조회 중...`);

    for (let page = 1; page <= 5; page++) {
      const data = await fetchAuctionSearch(court.code, page);
      if (!data) break;

      const items = parseAuctionResponse(data, court.name);
      console.log(`[AuctionScraper] ${court.name} page ${page}: ${items.length}건 파싱`);

      if (items.length === 0) break;

      for (const item of items) {
        try {
          const apartmentId = await matchApartment(item.address);

          await pool.query(
            `INSERT INTO auction_items
              (case_number, court_name, apartment_id, address, detail_address, area, floor,
               appraisal_value, minimum_price, auction_date, fail_count, status, court_url, fetched_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
             ON CONFLICT (case_number) DO UPDATE SET
               minimum_price = EXCLUDED.minimum_price,
               auction_date = EXCLUDED.auction_date,
               fail_count = EXCLUDED.fail_count,
               status = EXCLUDED.status,
               apartment_id = COALESCE(EXCLUDED.apartment_id, auction_items.apartment_id),
               fetched_at = NOW()`,
            [
              item.case_number, item.court_name, apartmentId,
              item.address, item.detail_address, item.area, item.floor,
              item.appraisal_value, item.minimum_price, item.auction_date,
              item.fail_count, item.status, item.court_url,
            ]
          );
          totalSaved++;
        } catch (err) {
          totalErrors++;
          console.error(`[AuctionScraper] DB 저장 실패 (${item.case_number}):`, err.message);
        }
      }

      await sleep(2000);
    }

    await sleep(3000);
  }

  // 지난 경매 상태 업데이트
  await pool.query(
    `UPDATE auction_items SET status = 'closed' WHERE auction_date < CURRENT_DATE AND status = 'scheduled'`
  ).catch(() => {});

  // 수집 로그
  await pool.query(
    `INSERT INTO data_sync_log (api_name, last_sync_at, status, record_count, error_message)
     VALUES ('auction_scraper', NOW(), $1, $2, $3)`,
    [totalErrors > 0 ? 'partial' : 'success', totalSaved, totalErrors > 0 ? `${totalErrors}건 오류` : null]
  ).catch(() => {});

  console.log(`[AuctionScraper] 완료 — 저장: ${totalSaved}건, 오류: ${totalErrors}건`);
  return { saved: totalSaved, errors: totalErrors };
}

module.exports = { scrapeSeoulAuctions };
