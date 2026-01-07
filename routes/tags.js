const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get all tags for a team
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { teamId } = req.query;

        if (!teamId) {
            return res.status(400).json({ error: 'teamId is required' });
        }

        const [tags] = await db.query(
            `SELECT * FROM tags
             WHERE team_id = ?
             ORDER BY question_count DESC, name ASC`,
            [teamId]
        );

        res.json(tags);
    } catch (error) {
        console.error('Get tags error:', error);
        res.status(500).json({ error: 'Failed to get tags' });
    }
});

// Search tags by name
router.get('/search', authenticateToken, async (req, res) => {
    try {
        const { teamId, q } = req.query;

        if (!teamId || !q) {
            return res.status(400).json({ error: 'teamId and q (query) are required' });
        }

        const [tags] = await db.query(
            `SELECT * FROM tags
             WHERE team_id = ? AND name LIKE ?
             ORDER BY question_count DESC, name ASC
             LIMIT 10`,
            [teamId, `%${q}%`]
        );

        res.json(tags);
    } catch (error) {
        console.error('Search tags error:', error);
        res.status(500).json({ error: 'Failed to search tags' });
    }
});

module.exports = router;
