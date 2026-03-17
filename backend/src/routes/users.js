const express = require('express');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All routes in this file require authentication
router.use(authMiddleware);

// GET /favorites - Get user's favorite apartments
router.get('/favorites', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.name, a.address, a.road_address AS "roadAddress",
              a.lat AS latitude, a.lng AS longitude,
              a.build_year AS "buildYear", a.total_units AS "totalUnits",
              a.dong_count AS "dongCount",
              (SELECT th.price FROM trade_history th
               WHERE th.apartment_id = a.id
               ORDER BY th.trade_date DESC LIMIT 1) AS "latestPrice",
              f.created_at AS "favoritedAt"
       FROM apartments a
       INNER JOIN favorites f ON a.id = f.apartment_id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('Error fetching favorites:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /favorites/:id - Add favorite
router.post('/favorites/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const apartment = await pool.query(
      'SELECT id FROM apartments WHERE id = $1',
      [id]
    );

    if (apartment.rows.length === 0) {
      return res.status(404).json({ error: 'Apartment not found' });
    }

    const existing = await pool.query(
      'SELECT id FROM favorites WHERE user_id = $1 AND apartment_id = $2',
      [req.user.id, id]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Already in favorites' });
    }

    await pool.query(
      `INSERT INTO favorites (user_id, apartment_id, created_at)
       VALUES ($1, $2, NOW())`,
      [req.user.id, id]
    );

    return res.status(201).json({ message: 'Added to favorites' });
  } catch (err) {
    console.error('Error adding favorite:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /favorites/:id - Remove favorite
router.delete('/favorites/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM favorites WHERE user_id = $1 AND apartment_id = $2',
      [req.user.id, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Favorite not found' });
    }

    return res.json({ message: 'Removed from favorites' });
  } catch (err) {
    console.error('Error removing favorite:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
