const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get user by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { teamId } = req.query;

        const [users] = await db.query(
            'SELECT id, email, first_name, last_name, work_type, role, avatar_url, bio, location, created_at FROM users WHERE id = ?',
            [id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get user's teams
        const [teams] = await db.query(
            `SELECT t.*, tm.role as user_role
             FROM teams t
             JOIN team_members tm ON t.id = tm.team_id
             WHERE tm.user_id = ?`,
            [id]
        );

        let questions = [];
        let answers = [];

        // If teamId provided, get user's activity in that team
        if (teamId) {
            // Get user's questions in this team
            const [userQuestions] = await db.query(
                `SELECT q.*,
                        GROUP_CONCAT(DISTINCT t.name) as tags
                 FROM questions q
                 LEFT JOIN question_tags qt ON q.id = qt.question_id
                 LEFT JOIN tags t ON qt.tag_id = t.id
                 WHERE q.user_id = ? AND q.team_id = ?
                 GROUP BY q.id
                 ORDER BY q.created_at DESC`,
                [id, teamId]
            );
            questions = userQuestions;

            // Get user's answers in this team
            const [userAnswers] = await db.query(
                `SELECT a.*, q.title as question_title, q.id as question_id
                 FROM answers a
                 JOIN questions q ON a.question_id = q.id
                 WHERE a.user_id = ? AND q.team_id = ?
                 ORDER BY a.created_at DESC`,
                [id, teamId]
            );
            answers = userAnswers;
        }

        res.json({
            ...users[0],
            teams,
            questions,
            answers
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

// Update user profile
router.put('/profile',
    authenticateToken,
    [
        body('firstName').optional().trim(),
        body('lastName').optional().trim(),
        body('bio').optional().trim(),
        body('location').optional().trim()
    ],
    async (req, res) => {
        try {
            const { firstName, lastName, bio, location } = req.body;

            const updates = [];
            const params = [];

            if (firstName !== undefined) {
                updates.push('first_name = ?');
                params.push(firstName);
            }
            if (lastName !== undefined) {
                updates.push('last_name = ?');
                params.push(lastName);
            }
            if (bio !== undefined) {
                updates.push('bio = ?');
                params.push(bio);
            }
            if (location !== undefined) {
                updates.push('location = ?');
                params.push(location);
            }

            if (updates.length === 0) {
                return res.status(400).json({ error: 'No updates provided' });
            }

            params.push(req.user.userId);
            await db.query(
                `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
                params
            );

            res.json({ message: 'Profile updated successfully' });
        } catch (error) {
            console.error('Update profile error:', error);
            res.status(500).json({ error: 'Failed to update profile' });
        }
    }
);

// Search users (for mentions/notifications)
router.get('/search', authenticateToken, async (req, res) => {
    try {
        const { teamId, q } = req.query;

        if (!teamId) {
            return res.status(400).json({ error: 'teamId is required' });
        }

        let query = `
            SELECT u.id, u.email, u.first_name, u.last_name, u.avatar_url
            FROM users u
            JOIN team_members tm ON u.id = tm.user_id
            WHERE tm.team_id = ?
        `;

        const params = [teamId];

        if (q) {
            query += ` AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)`;
            params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }

        query += ` ORDER BY u.first_name, u.last_name LIMIT 10`;

        const [users] = await db.query(query, params);

        res.json(users);
    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({ error: 'Failed to search users' });
    }
});

module.exports = router;
