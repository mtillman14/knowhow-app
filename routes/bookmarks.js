const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Toggle bookmark (add or remove)
router.post('/',
    authenticateToken,
    [
        body('questionId').isInt()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { questionId } = req.body;
            const userId = req.user.userId;

            // Check if bookmark exists
            const [existing] = await db.query(
                'SELECT id FROM bookmarks WHERE user_id = ? AND question_id = ?',
                [userId, questionId]
            );

            if (existing.length > 0) {
                // Remove bookmark
                await db.query(
                    'DELETE FROM bookmarks WHERE user_id = ? AND question_id = ?',
                    [userId, questionId]
                );

                return res.json({
                    message: 'Bookmark removed',
                    bookmarked: false
                });
            } else {
                // Verify question exists
                const [question] = await db.query(
                    'SELECT id FROM questions WHERE id = ?',
                    [questionId]
                );

                if (question.length === 0) {
                    return res.status(404).json({ error: 'Question not found' });
                }

                // Add bookmark
                await db.query(
                    'INSERT INTO bookmarks (user_id, question_id) VALUES (?, ?)',
                    [userId, questionId]
                );

                return res.status(201).json({
                    message: 'Bookmark added',
                    bookmarked: true
                });
            }
        } catch (error) {
            console.error('Bookmark toggle error:', error);
            res.status(500).json({ error: 'Failed to toggle bookmark' });
        }
    }
);

// Check if question is bookmarked
router.get('/check',
    authenticateToken,
    async (req, res) => {
        try {
            const { questionId } = req.query;

            if (!questionId) {
                return res.status(400).json({ error: 'questionId is required' });
            }

            const [bookmark] = await db.query(
                'SELECT id FROM bookmarks WHERE user_id = ? AND question_id = ?',
                [req.user.userId, questionId]
            );

            res.json({
                bookmarked: bookmark.length > 0
            });
        } catch (error) {
            console.error('Check bookmark error:', error);
            res.status(500).json({ error: 'Failed to check bookmark' });
        }
    }
);

// Get user's bookmarked questions for a team
router.get('/',
    authenticateToken,
    async (req, res) => {
        try {
            const { teamId } = req.query;

            if (!teamId) {
                return res.status(400).json({ error: 'teamId is required' });
            }

            const [bookmarks] = await db.query(`
                SELECT
                    q.id,
                    q.title,
                    q.body,
                    q.view_count,
                    q.score,
                    q.answer_count,
                    q.is_closed,
                    q.created_at,
                    q.updated_at,
                    q.last_activity_at,
                    u.id as user_id,
                    u.first_name,
                    u.last_name,
                    u.avatar_url,
                    b.created_at as bookmarked_at,
                    (SELECT COUNT(*) FROM answers WHERE question_id = q.id AND is_accepted = TRUE) as has_accepted_answer
                FROM bookmarks b
                JOIN questions q ON b.question_id = q.id
                JOIN users u ON q.user_id = u.id
                WHERE b.user_id = ? AND q.team_id = ?
                ORDER BY b.created_at DESC
            `, [req.user.userId, teamId]);

            // Get tags for each question
            for (const bookmark of bookmarks) {
                const [tags] = await db.query(`
                    SELECT t.name
                    FROM question_tags qt
                    JOIN tags t ON qt.tag_id = t.id
                    WHERE qt.question_id = ?
                `, [bookmark.id]);
                bookmark.tags = tags;
            }

            res.json(bookmarks);
        } catch (error) {
            console.error('Get bookmarks error:', error);
            res.status(500).json({ error: 'Failed to get bookmarks' });
        }
    }
);

module.exports = router;
