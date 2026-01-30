const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { createNotification } = require('./notifications');

// Get comments for a question or answer
router.get('/', async (req, res) => {
    try {
        const { parentType, parentId } = req.query;

        if (!parentType || !parentId) {
            return res.status(400).json({ error: 'parentType and parentId required' });
        }

        const [comments] = await db.query(
            `SELECT c.*,
                    u.first_name, u.last_name, u.avatar_url
             FROM comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.parent_type = ? AND c.parent_id = ?
             ORDER BY c.created_at ASC`,
            [parentType, parentId]
        );

        res.json(comments);
    } catch (error) {
        console.error('Get comments error:', error);
        res.status(500).json({ error: 'Failed to get comments' });
    }
});

// Create comment
router.post('/',
    authenticateToken,
    [
        body('parentType').isIn(['question', 'answer']),
        body('parentId').isInt(),
        body('body').trim().isLength({ min: 1, max: 600 })
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { parentType, parentId, body } = req.body;

            // Verify parent exists and user is team member
            let teamId;
            let parentOwnerId;
            let questionId;
            let answerId = null;

            if (parentType === 'question') {
                const [questions] = await db.query(
                    'SELECT team_id, user_id FROM questions WHERE id = ?',
                    [parentId]
                );
                if (questions.length === 0) {
                    return res.status(404).json({ error: 'Question not found' });
                }
                teamId = questions[0].team_id;
                parentOwnerId = questions[0].user_id;
                questionId = parentId;
            } else {
                const [answers] = await db.query(
                    `SELECT a.user_id, a.question_id, q.team_id FROM answers a
                     JOIN questions q ON a.question_id = q.id
                     WHERE a.id = ?`,
                    [parentId]
                );
                if (answers.length === 0) {
                    return res.status(404).json({ error: 'Answer not found' });
                }
                teamId = answers[0].team_id;
                parentOwnerId = answers[0].user_id;
                questionId = answers[0].question_id;
                answerId = parentId;
            }

            const [membership] = await db.query(
                'SELECT * FROM team_members WHERE user_id = ? AND team_id = ?',
                [req.user.userId, teamId]
            );

            if (membership.length === 0) {
                return res.status(403).json({ error: 'Not a member of this team' });
            }

            // Create comment
            const [result] = await db.query(
                'INSERT INTO comments (parent_type, parent_id, user_id, body) VALUES (?, ?, ?, ?)',
                [parentType, parentId, req.user.userId, body]
            );

            // Update question last activity
            await db.query(
                'UPDATE questions SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?',
                [questionId]
            );

            // Notify parent owner about new comment
            await createNotification({
                userId: parentOwnerId,
                actorId: req.user.userId,
                questionId: questionId,
                answerId: answerId,
                commentId: result.insertId,
                type: 'comment'
            });

            res.status(201).json({
                message: 'Comment created successfully',
                commentId: result.insertId
            });
        } catch (error) {
            console.error('Create comment error:', error);
            res.status(500).json({ error: 'Failed to create comment' });
        }
    }
);

// Delete comment
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const [comments] = await db.query(
            'SELECT user_id FROM comments WHERE id = ?',
            [id]
        );

        if (comments.length === 0) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        if (comments[0].user_id !== req.user.userId) {
            return res.status(403).json({ error: 'Not authorized to delete this comment' });
        }

        await db.query('DELETE FROM comments WHERE id = ?', [id]);

        res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
        console.error('Delete comment error:', error);
        res.status(500).json({ error: 'Failed to delete comment' });
    }
});

module.exports = router;
