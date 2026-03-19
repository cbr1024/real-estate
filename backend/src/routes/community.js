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

const VALID_CATEGORIES = ['동네소식', '매매후기', '전세후기', '인테리어', '이사팁'];

// GET / — 게시글 목록 (누구나)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    const category = req.query.category || null;
    const region = req.query.region || null;

    let where = 'WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (category) {
      where += ` AND p.category = $${paramIdx++}`;
      params.push(category);
    }
    if (region) {
      where += ` AND p.region ILIKE $${paramIdx++}`;
      params.push(`%${region}%`);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM community_posts p ${where}`, params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT p.id, p.category, p.region, p.title, p.views, p.likes, p.comment_count, p.created_at,
              u.nickname
       FROM community_posts p
       JOIN users u ON p.user_id = u.id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      params
    );

    return res.json({
      posts: result.rows.map((p) => ({ ...p, nickname: p.nickname || '익명' })),
      pagination: { page, total, totalPages: Math.ceil(total / limit) },
      categories: VALID_CATEGORIES,
    });
  } catch (err) {
    console.error('Error fetching community posts:', err);
    return res.status(500).json({ error: '게시글 조회에 실패했습니다.' });
  }
});

// GET /:id — 게시글 상세 (누구나)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.id, 10);

    // 조회수 증가
    await pool.query('UPDATE community_posts SET views = views + 1 WHERE id = $1', [postId]);

    const result = await pool.query(
      `SELECT p.*, u.nickname, u.id AS author_id
       FROM community_posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [postId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    const post = { ...result.rows[0], nickname: result.rows[0].nickname || '익명', is_mine: req.user?.id === result.rows[0].author_id };

    // 댓글
    const comments = await pool.query(
      `SELECT c.id, c.content, c.created_at, u.nickname, u.id AS user_id
       FROM community_comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [postId]
    );

    return res.json({
      post,
      comments: comments.rows.map((c) => ({
        ...c,
        nickname: c.nickname || '익명',
        is_mine: req.user?.id === c.user_id,
      })),
    });
  } catch (err) {
    console.error('Error fetching post:', err);
    return res.status(500).json({ error: '게시글 조회에 실패했습니다.' });
  }
});

// POST / — 게시글 작성 (로그인 필수)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, content, category, region } = req.body;

    if (!title || title.trim().length < 2) {
      return res.status(400).json({ error: '제목을 2자 이상 입력해주세요.' });
    }
    if (!content || content.trim().length < 10) {
      return res.status(400).json({ error: '내용을 10자 이상 입력해주세요.' });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: '유효하지 않은 카테고리입니다.' });
    }

    const result = await pool.query(
      `INSERT INTO community_posts (user_id, title, content, category, region)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.user.id, title.trim(), content.trim(), category, region || null]
    );

    return res.json({ message: '게시글이 등록되었습니다.', id: result.rows[0].id });
  } catch (err) {
    console.error('Error creating post:', err);
    return res.status(500).json({ error: '게시글 등록에 실패했습니다.' });
  }
});

// DELETE /:id — 게시글 삭제 (본인만)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM community_posts WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }
    return res.json({ message: '게시글이 삭제되었습니다.' });
  } catch (err) {
    return res.status(500).json({ error: '게시글 삭제에 실패했습니다.' });
  }
});

// POST /:id/comments — 댓글 작성 (로그인 필수)
router.post('/:id/comments', authMiddleware, async (req, res) => {
  try {
    const postId = parseInt(req.params.id, 10);
    const { content } = req.body;
    if (!content || content.trim().length < 1) {
      return res.status(400).json({ error: '댓글 내용을 입력해주세요.' });
    }

    await pool.query(
      'INSERT INTO community_comments (post_id, user_id, content) VALUES ($1, $2, $3)',
      [postId, req.user.id, content.trim()]
    );

    await pool.query(
      'UPDATE community_posts SET comment_count = comment_count + 1 WHERE id = $1',
      [postId]
    );

    return res.json({ message: '댓글이 등록되었습니다.' });
  } catch (err) {
    console.error('Error creating comment:', err);
    return res.status(500).json({ error: '댓글 등록에 실패했습니다.' });
  }
});

// DELETE /comments/:id — 댓글 삭제
router.delete('/comments/:id', authMiddleware, async (req, res) => {
  try {
    const comment = await pool.query(
      'SELECT post_id FROM community_comments WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (comment.rows.length === 0) {
      return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    }

    await pool.query('DELETE FROM community_comments WHERE id = $1', [req.params.id]);
    await pool.query(
      'UPDATE community_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = $1',
      [comment.rows[0].post_id]
    );

    return res.json({ message: '댓글이 삭제되었습니다.' });
  } catch (err) {
    return res.status(500).json({ error: '댓글 삭제에 실패했습니다.' });
  }
});

// POST /:id/like — 좋아요 (로그인 필수)
router.post('/:id/like', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE community_posts SET likes = likes + 1 WHERE id = $1', [req.params.id]);
    return res.json({ message: '좋아요!' });
  } catch (err) {
    return res.status(500).json({ error: '처리에 실패했습니다.' });
  }
});

module.exports = router;
