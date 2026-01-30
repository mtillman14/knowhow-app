const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get notifications for current user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { limit = 20, offset = 0, unread } = req.query;
        const userId = req.user.userId;

        let whereClause = 'WHERE n.user_id = ?';
        const params = [userId];

        if (unread === 'true') {
            whereClause += ' AND n.is_read = FALSE';
        }

        const [notifications] = await db.query(
            `SELECT n.*,
                    q.title as question_title,
                    q.team_id,
                    t.slug as team_slug,
                    actor.first_name as actor_first_name,
                    actor.last_name as actor_last_name,
                    actor.avatar_url as actor_avatar_url
             FROM notifications n
             LEFT JOIN questions q ON n.question_id = q.id
             LEFT JOIN teams t ON q.team_id = t.id
             LEFT JOIN users actor ON n.actor_id = actor.id
             ${whereClause}
             ORDER BY n.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), parseInt(offset)]
        );

        // Get total count
        const [countResult] = await db.query(
            `SELECT COUNT(*) as total FROM notifications n ${whereClause}`,
            params
        );

        res.json({
            notifications,
            total: countResult[0].total
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ error: 'Failed to get notifications' });
    }
});

// Get unread notification count
router.get('/unread/count', authenticateToken, async (req, res) => {
    try {
        const [result] = await db.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [req.user.userId]
        );

        res.json({ count: result[0].count });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({ error: 'Failed to get unread count' });
    }
});

// Mark all notifications as read (must be before /:id routes)
router.put('/read-all', authenticateToken, async (req, res) => {
    try {
        await db.query(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
            [req.user.userId]
        );

        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Mark all read error:', error);
        res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
});

// Mark notification as read
router.put('/:id/read', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify notification belongs to user
        const [notifications] = await db.query(
            'SELECT user_id FROM notifications WHERE id = ?',
            [id]
        );

        if (notifications.length === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        if (notifications[0].user_id !== req.user.userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        await db.query(
            'UPDATE notifications SET is_read = TRUE WHERE id = ?',
            [id]
        );

        res.json({ message: 'Notification marked as read' });
    } catch (error) {
        console.error('Mark read error:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

// Delete a notification
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify notification belongs to user
        const [notifications] = await db.query(
            'SELECT user_id FROM notifications WHERE id = ?',
            [id]
        );

        if (notifications.length === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        if (notifications[0].user_id !== req.user.userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        await db.query('DELETE FROM notifications WHERE id = ?', [id]);

        res.json({ message: 'Notification deleted' });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

// Helper function to create a notification (exported for use by other routes)
async function createNotification({ userId, actorId, questionId, answerId, commentId, type }) {
    // Don't notify yourself
    if (userId === actorId) {
        return null;
    }

    try {
        const [result] = await db.query(
            `INSERT INTO notifications (user_id, actor_id, question_id, answer_id, comment_id, type)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, actorId, questionId || null, answerId || null, commentId || null, type]
        );
        return result.insertId;
    } catch (error) {
        console.error('Create notification error:', error);
        return null;
    }
}

module.exports = router;
module.exports.createNotification = createNotification;
