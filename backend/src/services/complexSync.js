const axios = require('axios');
const pool = require('../config/database');
const redis = require('../config/redis');

const LIST_BASE_URL = 'https://apis.data.go.kr/1613000/AptListService3';
const INFO_BASE_URL = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV3';

// 서울 25개 구 법정동 코드 (5자리 시군구코드)
const SEOUL_SIGUNGU_CODES = [
  '11110', '11140', '11170', '11200', '11215',
  '11230', '11260', '11290', '11305', '11320',
  '11350', '11380', '11410', '11440', '11470',
  '11500', '11530', '11545', '11560', '11590',
  '11620', '11650', '11680', '11710', '11740',
];

// 단지 목록 API로 kaptCode 목록 조회 (시군구 단위)
async function fetchKaptCodesBySigungu(serviceKey, sigunguCode) {
  const allItems = [];
  let pageNo = 1;

  while (true) {
    const response = await axios.get(`${LIST_BASE_URL}/getSigunguAptList3`, {
      params: { serviceKey, sigunguCode, pageNo, numOfRows: 1000 },
      timeout: 15000,
    });

    const body = response.data?.response?.body;
    if (!body || !body.items) break;

    let items = Array.isArray(body.items) ? body.items : (body.items.item ? (Array.isArray(body.items.item) ? body.items.item : [body.items.item]) : []);
    if (items.length === 0) break;
    allItems.push(...items);

    if (allItems.length >= parseInt(body.totalCount || '0', 10)) break;
    pageNo++;
  }

  return allItems.map(item => ({
    kaptCode: item.kaptCode,
    kaptName: item.kaptName,
    as3: item.as3 || '', // 읍면동
  }));
}

// 기본 정보 API로 상세 정보 조회
async function fetchComplexInfo(serviceKey, kaptCode) {
  const response = await axios.get(`${INFO_BASE_URL}/getAphusBassInfoV3`, {
    params: { serviceKey, kaptCode },
    timeout: 10000,
  });

  const header = response.data?.response?.header;
  if (header?.resultCode !== '00') return null;

  const item = response.data?.response?.body?.item;
  if (!item) return null;

  return {
    kaptCode: item.kaptCode,
    kaptName: item.kaptName,
    kaptAddr: item.kaptAddr,
    doroJuso: item.doroJuso,
    kaptDongCnt: item.kaptDongCnt ? parseInt(item.kaptDongCnt, 10) : null,
    kaptdaCnt: item.kaptdaCnt ? parseInt(item.kaptdaCnt, 10) : null,
    kaptUsedate: item.kaptUsedate || null,
  };
}

// DB의 아파트와 kaptCode 매칭 (이름 + 주소 기반)
async function matchAndUpdate(serviceKey, options = {}) {
  const sigunguCodes = options.sigunguCodes || SEOUL_SIGUNGU_CODES;
  let matched = 0;
  let updated = 0;
  let failed = 0;

  // kapt_code가 없는 아파트만 대상
  const unmatched = await pool.query(
    'SELECT id, name, address FROM apartments WHERE kapt_code IS NULL'
  );

  if (unmatched.rows.length === 0) {
    console.log('모든 아파트에 kapt_code가 매핑되어 있습니다.');
    return { matched: 0, updated: 0, failed: 0 };
  }

  console.log(`kapt_code 미매핑 아파트: ${unmatched.rows.length}개`);

  // 시군구별로 단지 목록 수집
  const kaptMap = new Map(); // kaptName -> [{kaptCode, as3}]

  for (const code of sigunguCodes) {
    try {
      const list = await fetchKaptCodesBySigungu(serviceKey, code);
      for (const item of list) {
        const name = item.kaptName.trim();
        if (!kaptMap.has(name)) kaptMap.set(name, []);
        kaptMap.get(name).push(item);
      }
      console.log(`  [목록] ${code}: ${list.length}개 단지`);
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`  [목록 오류] ${code}: ${err.message}`);
    }
  }

  console.log(`총 ${kaptMap.size}개 단지명 수집 완료. 매칭 시작...`);

  // 이름 기반 매칭
  for (const apt of unmatched.rows) {
    const candidates = kaptMap.get(apt.name.trim());
    if (!candidates || candidates.length === 0) continue;

    // 주소의 동 이름으로 후보 좁히기
    let best = candidates[0];
    if (candidates.length > 1 && apt.address) {
      for (const c of candidates) {
        if (c.as3 && apt.address.includes(c.as3)) {
          best = c;
          break;
        }
      }
    }

    try {
      // kapt_code 저장
      await pool.query(
        'UPDATE apartments SET kapt_code = $1 WHERE id = $2',
        [best.kaptCode, apt.id]
      );
      matched++;

      // 기본 정보 API로 세대수/동수 조회 (실패 시 건너뜀)
      try {
        const info = await fetchComplexInfo(serviceKey, best.kaptCode);
        if (info && (info.kaptdaCnt || info.kaptDongCnt)) {
          await pool.query(
            `UPDATE apartments
             SET total_units = COALESCE($1, total_units),
                 dong_count = COALESCE($2, dong_count)
             WHERE id = $3`,
            [info.kaptdaCnt, info.kaptDongCnt, apt.id]
          );
          updated++;
          console.log(`  [갱신] ${apt.name}: ${info.kaptdaCnt}세대, ${info.kaptDongCnt}동`);
        }
      } catch (infoErr) {
        // 기본 정보 API 장애 시 kaptCode 매칭만 유지
      }

      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`  [오류] ${apt.name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`매칭 완료: ${matched}개 매칭, ${updated}개 갱신, ${failed}개 실패`);
  return { matched, updated, failed };
}

// kapt_code는 있지만 total_units/dong_count가 없는 아파트 보충
async function fillMissingInfo(serviceKey) {
  const missing = await pool.query(
    'SELECT id, kapt_code FROM apartments WHERE kapt_code IS NOT NULL AND (total_units IS NULL OR dong_count IS NULL)'
  );

  if (missing.rows.length === 0) return { updated: 0 };

  let updated = 0;
  console.log(`세대수/동수 미입력 아파트: ${missing.rows.length}개`);

  for (const apt of missing.rows) {
    try {
      const info = await fetchComplexInfo(serviceKey, apt.kapt_code);
      if (info && (info.kaptdaCnt || info.kaptDongCnt)) {
        await pool.query(
          `UPDATE apartments
           SET total_units = COALESCE($1, total_units),
               dong_count = COALESCE($2, dong_count)
           WHERE id = $3`,
          [info.kaptdaCnt, info.kaptDongCnt, apt.id]
        );
        updated++;
      }
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`  [보충 오류] ${apt.kapt_code}: ${err.message}`);
    }
  }

  return { updated };
}

async function syncComplexInfo(options = {}) {
  const serviceKey = process.env.DATA_GO_KR_API_KEY;
  if (!serviceKey) {
    console.warn('DATA_GO_KR_API_KEY 미설정. 동기화 건너뜀.');
    return { skipped: true };
  }

  console.log('=== 공동주택 단지 정보 동기화 시작 ===');

  // 1단계: kapt_code 없는 아파트 매칭 + 세대수/동수 입력
  const matchResult = await matchAndUpdate(serviceKey, options);

  // 2단계: kapt_code 있지만 세대수/동수 없는 아파트 보충
  const fillResult = await fillMissingInfo(serviceKey);

  console.log('=== 동기화 완료 ===');
  console.log(`매칭: ${matchResult.matched}, 갱신: ${matchResult.updated + fillResult.updated}, 실패: ${matchResult.failed}`);

  return {
    matched: matchResult.matched,
    updated: matchResult.updated + fillResult.updated,
    failed: matchResult.failed,
  };
}

module.exports = { syncComplexInfo };
