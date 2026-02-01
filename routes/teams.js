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
            `SELECT u.id, u.email, u.first_name, u.last_name, u.avatar_url, u.bio, tm.role, tm.joined_at,
                    tm.started_at, tm.ended_at,
                    (SELECT COUNT(*) FROM questions WHERE user_id = u.id AND team_id = ?) as question_count,
                    (SELECT COUNT(*) FROM answers a
                     JOIN questions q ON a.question_id = q.id
                     WHERE a.user_id = u.id AND q.team_id = ?) as answer_count
             FROM users u
             JOIN team_members tm ON u.id = tm.user_id
             WHERE tm.team_id = ?
             ORDER BY tm.joined_at ASC`,
            [teamId, teamId, teamId]
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

// Get invite details by token (for invite page)
router.get('/invites/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const [invites] = await db.query(
            `SELECT ti.*, t.name as team_name, t.slug as team_slug,
                    u.first_name as invited_by_first_name, u.last_name as invited_by_last_name
             FROM team_invites ti
             JOIN teams t ON ti.team_id = t.id
             JOIN users u ON ti.invited_by = u.id
             WHERE ti.token = ?`,
            [token]
        );

        if (invites.length === 0) {
            return res.status(404).json({ error: 'Invite not found' });
        }

        const invite = invites[0];

        // Check if expired
        if (new Date(invite.expires_at) < new Date()) {
            return res.status(400).json({ error: 'This invite has expired' });
        }

        // Check if already used
        if (invite.status !== 'pending') {
            return res.status(400).json({ error: `This invite has already been ${invite.status}` });
        }

        res.json({
            email: invite.email,
            teamName: invite.team_name,
            teamSlug: invite.team_slug,
            invitedBy: `${invite.invited_by_first_name} ${invite.invited_by_last_name}`,
            expiresAt: invite.expires_at
        });
    } catch (error) {
        console.error('Get invite error:', error);
        res.status(500).json({ error: 'Failed to get invite details' });
    }
});

// Leave team (self-removal)
router.delete('/:slug/leave', authenticateToken, async (req, res) => {
    try {
        const { slug } = req.params;

        // Get team
        const [teams] = await db.query('SELECT id FROM teams WHERE slug = ?', [slug]);
        if (teams.length === 0) {
            return res.status(404).json({ error: 'Team not found' });
        }

        const teamId = teams[0].id;

        // Check if user is a member
        const [membership] = await db.query(
            'SELECT role FROM team_members WHERE user_id = ? AND team_id = ?',
            [req.user.userId, teamId]
        );

        if (membership.length === 0) {
            return res.status(400).json({ error: 'You are not a member of this team' });
        }

        // If user is an admin, check if they're the last admin
        if (membership[0].role === 'admin') {
            const [admins] = await db.query(
                `SELECT COUNT(*) as count FROM team_members
                 WHERE team_id = ? AND role = 'admin' AND user_id != ?`,
                [teamId, req.user.userId]
            );

            if (admins[0].count === 0) {
                // Check if there are other members who could be promoted
                const [otherMembers] = await db.query(
                    `SELECT COUNT(*) as count FROM team_members
                     WHERE team_id = ? AND user_id != ?`,
                    [teamId, req.user.userId]
                );

                if (otherMembers[0].count > 0) {
                    return res.status(400).json({
                        error: 'You are the only admin. Please promote another member to admin before leaving.'
                    });
                }
                // If no other members, allow leaving (team will be empty)
            }
        }

        // Remove the user from the team
        await db.query(
            'DELETE FROM team_members WHERE user_id = ? AND team_id = ?',
            [req.user.userId, teamId]
        );

        res.json({ message: 'You have left the team' });
    } catch (error) {
        console.error('Leave team error:', error);
        res.status(500).json({ error: 'Failed to leave team' });
    }
});

// Accept invite
router.post('/invites/accept', authenticateToken, async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        // Get invite
        const [invites] = await db.query(
            `SELECT ti.*, t.slug as team_slug
             FROM team_invites ti
             JOIN teams t ON ti.team_id = t.id
             WHERE ti.token = ?`,
            [token]
        );

        if (invites.length === 0) {
            return res.status(404).json({ error: 'Invite not found' });
        }

        const invite = invites[0];

        // Check if expired
        if (new Date(invite.expires_at) < new Date()) {
            return res.status(400).json({ error: 'This invite has expired' });
        }

        // Check if already used
        if (invite.status !== 'pending') {
            return res.status(400).json({ error: `This invite has already been ${invite.status}` });
        }

        // Get user email
        const [users] = await db.query('SELECT email FROM users WHERE id = ?', [req.user.userId]);
        const userEmail = users[0].email;

        // Check if email matches
        if (userEmail.toLowerCase() !== invite.email.toLowerCase()) {
            return res.status(403).json({
                error: 'This invite was sent to a different email address'
            });
        }

        // Check if already a member
        const [existing] = await db.query(
            'SELECT * FROM team_members WHERE user_id = ? AND team_id = ?',
            [req.user.userId, invite.team_id]
        );

        if (existing.length > 0) {
            // Update invite status and redirect anyway
            await db.query(
                'UPDATE team_invites SET status = ? WHERE id = ?',
                ['accepted', invite.id]
            );
            return res.json({
                message: 'You are already a member of this team',
                teamSlug: invite.team_slug
            });
        }

        // Add user to team
        await db.query(
            'INSERT INTO team_members (user_id, team_id, role) VALUES (?, ?, ?)',
            [req.user.userId, invite.team_id, 'member']
        );

        // Update invite status
        await db.query(
            'UPDATE team_invites SET status = ? WHERE id = ?',
            ['accepted', invite.id]
        );

        res.json({
            message: 'You have successfully joined the team',
            teamSlug: invite.team_slug
        });
    } catch (error) {
        console.error('Accept invite error:', error);
        res.status(500).json({ error: 'Failed to accept invite' });
    }
});

module.exports = router;
