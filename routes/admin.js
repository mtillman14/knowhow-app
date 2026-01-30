const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireTeamAdmin } = require('../middleware/auth');

// Get team members with stats (admin only)
router.get('/:teamId/members', authenticateToken, requireTeamAdmin, async (req, res) => {
    try {
        const { teamId } = req.params;

        const [members] = await db.query(
            `SELECT u.id, u.email, u.first_name, u.last_name, u.avatar_url,
                    tm.role, tm.joined_at,
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

        // Get stats
        const totalMembers = members.length;
        const adminCount = members.filter(m => m.role === 'admin').length;

        const [pendingInvites] = await db.query(
            `SELECT COUNT(*) as count FROM team_invites
             WHERE team_id = ? AND status = 'pending' AND expires_at > NOW()`,
            [teamId]
        );

        res.json({
            members,
            stats: {
                totalMembers,
                adminCount,
                pendingInvites: pendingInvites[0].count
            }
        });
    } catch (error) {
        console.error('Get admin members error:', error);
        res.status(500).json({ error: 'Failed to get team members' });
    }
});

// Update member role (admin only)
router.put('/:teamId/members/:memberId/role',
    authenticateToken,
    requireTeamAdmin,
    [body('role').isIn(['admin', 'member'])],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { teamId, memberId } = req.params;
            const { role } = req.body;

            // Cannot change own role
            if (parseInt(memberId) === req.user.userId) {
                return res.status(400).json({ error: 'You cannot change your own role' });
            }

            // Check if demoting would leave team without admins
            if (role === 'member') {
                const [admins] = await db.query(
                    `SELECT COUNT(*) as count FROM team_members
                     WHERE team_id = ? AND role = 'admin' AND user_id != ?`,
                    [teamId, memberId]
                );

                if (admins[0].count === 0) {
                    return res.status(400).json({
                        error: 'Cannot demote. Team must have at least one admin.'
                    });
                }
            }

            // Update role
            await db.query(
                'UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?',
                [role, teamId, memberId]
            );

            res.json({ message: 'Member role updated successfully' });
        } catch (error) {
            console.error('Update member role error:', error);
            res.status(500).json({ error: 'Failed to update member role' });
        }
    }
);

// Remove member from team (admin only)
router.delete('/:teamId/members/:memberId', authenticateToken, requireTeamAdmin, async (req, res) => {
    try {
        const { teamId, memberId } = req.params;

        // Cannot remove self
        if (parseInt(memberId) === req.user.userId) {
            return res.status(400).json({ error: 'You cannot remove yourself from the team' });
        }

        // Check if member exists
        const [member] = await db.query(
            'SELECT * FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, memberId]
        );

        if (member.length === 0) {
            return res.status(404).json({ error: 'Member not found' });
        }

        // If removing an admin, check if there would be at least one admin left
        if (member[0].role === 'admin') {
            const [admins] = await db.query(
                `SELECT COUNT(*) as count FROM team_members
                 WHERE team_id = ? AND role = 'admin' AND user_id != ?`,
                [teamId, memberId]
            );

            if (admins[0].count === 0) {
                return res.status(400).json({
                    error: 'Cannot remove. Team must have at least one admin.'
                });
            }
        }

        // Remove member
        await db.query(
            'DELETE FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, memberId]
        );

        res.json({ message: 'Member removed successfully' });
    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({ error: 'Failed to remove member' });
    }
});

// Get pending invites (admin only)
router.get('/:teamId/invites', authenticateToken, requireTeamAdmin, async (req, res) => {
    try {
        const { teamId } = req.params;

        const [invites] = await db.query(
            `SELECT ti.id, ti.email, ti.token, ti.status, ti.created_at, ti.expires_at,
                    u.first_name as invited_by_first_name, u.last_name as invited_by_last_name
             FROM team_invites ti
             JOIN users u ON ti.invited_by = u.id
             WHERE ti.team_id = ? AND ti.status = 'pending' AND ti.expires_at > NOW()
             ORDER BY ti.created_at DESC`,
            [teamId]
        );

        res.json(invites);
    } catch (error) {
        console.error('Get invites error:', error);
        res.status(500).json({ error: 'Failed to get invites' });
    }
});

// Create invite (admin only)
router.post('/:teamId/invites',
    authenticateToken,
    requireTeamAdmin,
    [body('email').isEmail().normalizeEmail()],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { teamId } = req.params;
            const { email } = req.body;

            // Check if user is already a member
            const [existingMember] = await db.query(
                `SELECT tm.* FROM team_members tm
                 JOIN users u ON tm.user_id = u.id
                 WHERE tm.team_id = ? AND u.email = ?`,
                [teamId, email]
            );

            if (existingMember.length > 0) {
                return res.status(400).json({ error: 'User is already a team member' });
            }

            // Check if there's already a pending invite for this email
            const [existingInvite] = await db.query(
                `SELECT * FROM team_invites
                 WHERE team_id = ? AND email = ? AND status = 'pending' AND expires_at > NOW()`,
                [teamId, email]
            );

            if (existingInvite.length > 0) {
                return res.status(400).json({ error: 'An invite for this email is already pending' });
            }

            // Generate unique token
            const token = crypto.randomBytes(32).toString('hex');

            // Create invite
            await db.query(
                `INSERT INTO team_invites (team_id, email, invited_by, token)
                 VALUES (?, ?, ?, ?)`,
                [teamId, email, req.user.userId, token]
            );

            // Get team info for the invite link
            const [team] = await db.query('SELECT slug FROM teams WHERE id = ?', [teamId]);

            res.status(201).json({
                message: 'Invite created successfully',
                inviteLink: `/invite/${token}`,
                token
            });
        } catch (error) {
            console.error('Create invite error:', error);
            res.status(500).json({ error: 'Failed to create invite' });
        }
    }
);

// Cancel invite (admin only)
router.delete('/:teamId/invites/:inviteId', authenticateToken, requireTeamAdmin, async (req, res) => {
    try {
        const { teamId, inviteId } = req.params;

        // Check if invite exists and belongs to this team
        const [invite] = await db.query(
            'SELECT * FROM team_invites WHERE id = ? AND team_id = ?',
            [inviteId, teamId]
        );

        if (invite.length === 0) {
            return res.status(404).json({ error: 'Invite not found' });
        }

        // Update status to cancelled
        await db.query(
            'UPDATE team_invites SET status = ? WHERE id = ?',
            ['cancelled', inviteId]
        );

        res.json({ message: 'Invite cancelled successfully' });
    } catch (error) {
        console.error('Cancel invite error:', error);
        res.status(500).json({ error: 'Failed to cancel invite' });
    }
});

module.exports = router;
