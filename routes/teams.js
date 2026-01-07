const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Create new team
router.post('/',
    authenticateToken,
    [
        body('name').trim().notEmpty(),
        body('slug').trim().notEmpty().matches(/^[a-z0-9-]+$/),
        body('companyName').optional().trim(),
        body('companySize').optional().trim(),
        body('primaryGoal').optional().trim()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { name, slug, companyName, companySize, primaryGoal } = req.body;

            // Check if slug is already taken
            const [existing] = await db.query('SELECT id FROM teams WHERE slug = ?', [slug]);
            if (existing.length > 0) {
                return res.status(400).json({ error: 'Team URL already taken' });
            }

            // Create team
            const [result] = await db.query(
                'INSERT INTO teams (name, slug, company_name, company_size, primary_goal) VALUES (?, ?, ?, ?, ?)',
                [name, slug, companyName, companySize, primaryGoal]
            );

            const teamId = result.insertId;

            // Add creator as admin
            await db.query(
                'INSERT INTO team_members (user_id, team_id, role) VALUES (?, ?, ?)',
                [req.user.userId, teamId, 'admin']
            );

            res.status(201).json({
                message: 'Team created successfully',
                teamId,
                slug
            });
        } catch (error) {
            console.error('Create team error:', error);
            res.status(500).json({ error: 'Failed to create team' });
        }
    }
);

// Get team by slug
router.get('/:slug', authenticateToken, async (req, res) => {
    try {
        const { slug } = req.params;

        const [teams] = await db.query(
            'SELECT * FROM teams WHERE slug = ?',
            [slug]
        );

        if (teams.length === 0) {
            return res.status(404).json({ error: 'Team not found' });
        }

        const team = teams[0];

        // Check if user is a member of this team
        const [membership] = await db.query(
            'SELECT * FROM team_members WHERE user_id = ? AND team_id = ?',
            [req.user.userId, team.id]
        );

        if (membership.length === 0) {
            return res.status(403).json({ error: 'Team membership required' });
        }

        // Get team statistics
        const [stats] = await db.query(
            `SELECT
                (SELECT COUNT(*) FROM questions WHERE team_id = ?) as question_count,
                (SELECT COUNT(*) FROM team_members WHERE team_id = ?) as member_count,
                (SELECT COUNT(*) FROM tags WHERE team_id = ?) as tag_count`,
            [team.id, team.id, team.id]
        );

        res.json({
            ...team,
            stats: stats[0]
        });
    } catch (error) {
        console.error('Get team error:', error);
        res.status(500).json({ error: 'Failed to get team' });
    }
});

// Get team members
router.get('/:slug/members', authenticateToken, async (req, res) => {
    try {
        const { slug } = req.params;

        const [teams] = await db.query('SELECT id FROM teams WHERE slug = ?', [slug]);
        if (teams.length === 0) {
            return res.status(404).json({ error: 'Team not found' });
        }

        const teamId = teams[0].id;

        // Check if user is a member of this team
        const [membership] = await db.query(
            'SELECT * FROM team_members WHERE user_id = ? AND team_id = ?',
            [req.user.userId, teamId]
        );

        if (membership.length === 0) {
            return res.status(403).json({ error: 'Team membership required' });
        }

        const [members] = await db.query(
            `SELECT u.id, u.email, u.first_name, u.last_name, u.avatar_url, tm.role, tm.joined_at
             FROM users u
             JOIN team_members tm ON u.id = tm.user_id
             WHERE tm.team_id = ?
             ORDER BY tm.joined_at ASC`,
            [teams[0].id]
        );

        res.json(members);
    } catch (error) {
        console.error('Get members error:', error);
        res.status(500).json({ error: 'Failed to get team members' });
    }
});

// Add member to team
router.post('/:slug/members',
    authenticateToken,
    [body('email').isEmail().normalizeEmail()],
    async (req, res) => {
        try {
            const { slug } = req.params;
            const { email } = req.body;

            const [teams] = await db.query('SELECT id FROM teams WHERE slug = ?', [slug]);
            if (teams.length === 0) {
                return res.status(404).json({ error: 'Team not found' });
            }

            const teamId = teams[0].id;

            // Check if user is a member of this team
            const [membership] = await db.query(
                'SELECT * FROM team_members WHERE user_id = ? AND team_id = ?',
                [req.user.userId, teamId]
            );

            if (membership.length === 0) {
                return res.status(403).json({ error: 'Team membership required' });
            }

            // Find user by email
            const [users] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
            if (users.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            const userId = users[0].id;

            // Check if already a member
            const [existing] = await db.query(
                'SELECT * FROM team_members WHERE user_id = ? AND team_id = ?',
                [userId, teamId]
            );

            if (existing.length > 0) {
                return res.status(400).json({ error: 'User is already a team member' });
            }

            // Add member
            await db.query(
                'INSERT INTO team_members (user_id, team_id, role) VALUES (?, ?, ?)',
                [userId, teamId, 'member']
            );

            res.status(201).json({ message: 'Member added successfully' });
        } catch (error) {
            console.error('Add member error:', error);
            res.status(500).json({ error: 'Failed to add member' });
        }
    }
);

module.exports = router;
