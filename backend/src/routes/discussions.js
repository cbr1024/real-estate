const express = require('express');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const optionalAuth = async (req, res, next) => {
  const token = req.cookies?.access_token
    || (req.headers.authorization?.startsWith('Bearer ') && req.headers.authorization.split(' ')[1]);
  if (!token) return next();
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch (_) {}
  next();
};

const VALID_OPINIONS = ['buy', 'sell', 'hold'];

// GET / — 토론 목록 (누구나)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    const region = req.query.region || null;

    let where = 'WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (region) {
      where += ` AND d.region ILIKE $${paramIdx++}`;
      params.push(`%${region}%`);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM investment_discussions d ${where}`, params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT d.id, d.title, d.region, d.opinion,
              d.vote_buy, d.vote_sell, d.vote_hold,
              d.views, d.comment_count, d.created_at,
              u.nickname, a.name AS apartment_name
       FROM investment_discussions d
       JOIN users u ON d.user_id = u.id
       LEFT JOIN apartments a ON d.apartment_id = a.id
       ${where}
       ORDER BY d.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      params
    );

    return res.json({
      discussions: result.rows.map((d) => ({ ...d, nickname: d.nickname || '익명' })),
      pagination: { page, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Error fetching discussions:', err);
    return res.status(500).json({ error: '토론 조회에 실패했습니다.' });
  }
});

// GET /:id — 토론 상세 (누구나)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await pool.query('UPDATE investment_discussions SET views = views + 1 WHERE id = $1', [id]);

    const result = await pool.query(
      `SELECT d.*, u.nickname, u.id AS author_id, a.name AS apartment_name
       FROM investment_discussions d
       JOIN users u ON d.user_id = u.id
       LEFT JOIN apartments a ON d.apartment_id = a.id
       WHERE d.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '토론을 찾을 수 없습니다.' });
    }

    const discussion = {
      ...result.rows[0],
      nickname: result.rows[0].nickname || '익명',
      is_mine: req.user?.id === result.rows[0].author_id,
    };

    // 내 투표
    let myVote = null;
    if (req.user) {
      const voteResult = await pool.query(
        'SELECT vote FROM discussion_votes WHERE discussion_id = $1 AND user_id = $2',
        [id, req.user.id]
      );
      myVote = voteResult.rows[0]?.vote || null;
    }

    // 댓글
    const comments = await pool.query(
      `SELECT c.id, c.content, c.created_at, u.nickname, u.id AS user_id
       FROM discussion_comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.discussion_id = $1
       ORDER BY c.created_at ASC`,
      [id]
    );

    return res.json({
      discussion,
      myVote,
      comments: comments.rows.map((c) => ({
        ...c,
        nickname: c.nickname || '익명',
        is_mine: req.user?.id === c.user_id,
      })),
    });
  } catch (err) {
    console.error('Error fetching discussion:', err);
    return res.status(500).json({ error: '토론 조회에 실패했습니다.' });
  }
});

// POST / — 토론 작성 (로그인 필수)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, content, opinion, region, apartment_id } = req.body;

    if (!title || title.trim().length < 2) {
      return res.status(400).json({ error: '제목을 2자 이상 입력해주세요.' });
    }
    if (!content || content.trim().length < 10) {
      return res.status(400).json({ error: '내용을 10자 이상 입력해주세요.' });
    }
    if (!VALID_OPINIONS.includes(opinion)) {
      return res.status(400).json({ error: '의견을 선택해주세요. (매수/매도/관망)' });
    }

    const result = await pool.query(
      `INSERT INTO investment_discussions (user_id, title, content, opinion, region, apartment_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [req.user.id, title.trim(), content.trim(), opinion, region || null, apartment_id || null]
    );

    return res.json({ message: '토론이 등록되었습니다.', id: result.rows[0].id });
  } catch (err) {
    console.error('Error creating discussion:', err);
    return res.status(500).json({ error: '토론 등록에 실패했습니다.' });
  }
});

// POST /:id/vote — 투표 (로그인 필수)
router.post('/:id/vote', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const discussionId = parseInt(req.params.id, 10);
    const { vote } = req.body;
    if (!VALID_OPINIONS.includes(vote)) {
      return res.status(400).json({ error: '유효하지 않은 투표입니다.' });
    }

    await client.query('BEGIN');

    // 기존 투표 확인
    const existing = await client.query(
      'SELECT vote FROM discussion_votes WHERE discussion_id = $1 AND user_id = $2',
      [discussionId, req.user.id]
    );

    if (existing.rows.length > 0) {
      const oldVote = existing.rows[0].vote;
      // 기존 투표 카운트 감소
      await client.query(
        `UPDATE investment_discussions SET vote_${oldVote} = GREATEST(vote_${oldVote} - 1, 0) WHERE id = $1`,
        [discussionId]
      );
      // 업데이트
      await client.query(
        'UPDATE discussion_votes SET vote = $1 WHERE discussion_id = $2 AND user_id = $3',
        [vote, discussionId, req.user.id]
      );
    } else {
      await client.query(
        'INSERT INTO discussion_votes (discussion_id, user_id, vote) VALUES ($1, $2, $3)',
        [discussionId, req.user.id, vote]
      );
    }

    // 새 투표 카운트 증가
    await client.query(
      `UPDATE investment_discussions SET vote_${vote} = vote_${vote} + 1 WHERE id = $1`,
      [discussionId]
    );

    await client.query('COMMIT');

    // 최신 카운트 반환
    const updated = await pool.query(
      'SELECT vote_buy, vote_sell, vote_hold FROM investment_discussions WHERE id = $1',
      [discussionId]
    );

    return res.json({ message: '투표가 반영되었습니다.', votes: updated.rows[0], myVote: vote });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error voting:', err);
    return res.status(500).json({ error: '투표 처리에 실패했습니다.' });
  } finally {
    client.release();
  }
});

// POST /:id/comments — 댓글 작성
router.post('/:id/comments', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || content.trim().length < 1) {
      return res.status(400).json({ error: '댓글 내용을 입력해주세요.' });
    }

    await pool.query(
      'INSERT INTO discussion_comments (discussion_id, user_id, content) VALUES ($1, $2, $3)',
      [req.params.id, req.user.id, content.trim()]
    );
    await pool.query(
      'UPDATE investment_discussions SET comment_count = comment_count + 1 WHERE id = $1',
      [req.params.id]
    );

    return res.json({ message: '댓글이 등록되었습니다.' });
  } catch (err) {
    return res.status(500).json({ error: '댓글 등록에 실패했습니다.' });
  }
});

// DELETE /:id — 토론 삭제 (본인만)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM investment_discussions WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '토론을 찾을 수 없습니다.' });
    }
    return res.json({ message: '토론이 삭제되었습니다.' });
  } catch (err) {
    return res.status(500).json({ error: '토론 삭제에 실패했습니다.' });
  }
});

module.exports = router;
