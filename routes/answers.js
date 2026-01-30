const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { createNotification } = require('./notifications');

// Get answers for a question
router.get('/question/:questionId', async (req, res) => {
    try {
        const { questionId } = req.params;
        const { sort = 'score' } = req.query;

        let orderBy = 'a.is_accepted DESC, a.score DESC, a.created_at ASC';
        if (sort === 'oldest') {
            orderBy = 'a.is_accepted DESC, a.created_at ASC';
        } else if (sort === 'newest') {
            orderBy = 'a.is_accepted DESC, a.created_at DESC';
        }

        const [answers] = await db.query(
            `SELECT a.*,
                    u.id as user_id, u.first_name, u.last_name, u.avatar_url, u.bio
             FROM answers a
             JOIN users u ON a.user_id = u.id
             WHERE a.question_id = ?
             ORDER BY ${orderBy}`,
            [questionId]
        );

        // Get user votes if authenticated
        if (req.user) {
            for (const answer of answers) {
                const [votes] = await db.query(
                    'SELECT vote_type FROM votes WHERE votable_type = ? AND votable_id = ? AND user_id = ?',
                    ['answer', answer.id, req.user.userId]
                );
                answer.userVote = votes.length > 0 ? votes[0].vote_type : null;
            }
        }

        res.json(answers);
    } catch (error) {
        console.error('Get answers error:', error);
        res.status(500).json({ error: 'Failed to get answers' });
    }
});

// Create new answer
router.post('/',
    authenticateToken,
    [
        body('questionId').isInt(),
        body('body').trim().notEmpty()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { questionId, body } = req.body;

            // Verify question exists and user is team member
            const [questions] = await db.query(
                'SELECT team_id, user_id, is_closed FROM questions WHERE id = ?',
                [questionId]
            );

            if (questions.length === 0) {
                return res.status(404).json({ error: 'Question not found' });
            }

            const question = questions[0];
            const teamId = question.team_id;

            const [membership] = await db.query(
                'SELECT role FROM team_members WHERE user_id = ? AND team_id = ?',
                [req.user.userId, teamId]
            );

            if (membership.length === 0) {
                return res.status(403).json({ error: 'Not a member of this team' });
            }

            // Check if question is closed (allow owner and admin to still answer)
            if (question.is_closed) {
                const isOwner = question.user_id === req.user.userId;
                const isAdmin = membership[0].role === 'admin';
                if (!isOwner && !isAdmin) {
                    return res.status(403).json({ error: 'This question is closed and not accepting new answers' });
                }
            }

            // Create answer
            const [result] = await db.query(
                'INSERT INTO answers (question_id, user_id, body) VALUES (?, ?, ?)',
                [questionId, req.user.userId, body]
            );

            // Update question answer count and last activity
            await db.query(
                'UPDATE questions SET answer_count = answer_count + 1, last_activity_at = CURRENT_TIMESTAMP WHERE id = ?',
                [questionId]
            );

            // Notify question author about new answer
            await createNotification({
                userId: question.user_id,
                actorId: req.user.userId,
                questionId: questionId,
                answerId: result.insertId,
                type: 'answer'
            });

            res.status(201).json({
                message: 'Answer created successfully',
                answerId: result.insertId
            });
        } catch (error) {
            console.error('Create answer error:', error);
            res.status(500).json({ error: 'Failed to create answer' });
        }
    }
);

// Update answer
router.put('/:id',
    authenticateToken,
    [body('body').trim().notEmpty()],
    async (req, res) => {
        try {
            const { id } = req.params;
            const { body } = req.body;

            // Check if user owns the answer
            const [answers] = await db.query(
                'SELECT user_id, question_id FROM answers WHERE id = ?',
                [id]
            );

            if (answers.length === 0) {
                return res.status(404).json({ error: 'Answer not found' });
            }

            if (answers[0].user_id !== req.user.userId) {
                return res.status(403).json({ error: 'Not authorized to edit this answer' });
            }

            // Update answer
            await db.query(
                'UPDATE answers SET body = ? WHERE id = ?',
                [body, id]
            );

            // Update question last activity
            await db.query(
                'UPDATE questions SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?',
                [answers[0].question_id]
            );

            res.json({ message: 'Answer updated successfully' });
        } catch (error) {
            console.error('Update answer error:', error);
            res.status(500).json({ error: 'Failed to update answer' });
        }
    }
);

// Delete answer
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if user owns the answer or is team admin
        const [answers] = await db.query(
            `SELECT a.user_id, a.question_id, q.team_id
             FROM answers a
             JOIN questions q ON a.question_id = q.id
             WHERE a.id = ?`,
            [id]
        );

        if (answers.length === 0) {
            return res.status(404).json({ error: 'Answer not found' });
        }

        const answer = answers[0];

        // Check if user owns it or is admin
        const [membership] = await db.query(
            'SELECT role FROM team_members WHERE user_id = ? AND team_id = ?',
            [req.user.userId, answer.team_id]
        );

        if (answer.user_id !== req.user.userId && (!membership.length || membership[0].role !== 'admin')) {
            return res.status(403).json({ error: 'Not authorized to delete this answer' });
        }

        // Delete answer
        await db.query('DELETE FROM answers WHERE id = ?', [id]);

        // Update question answer count
        await db.query(
            'UPDATE questions SET answer_count = answer_count - 1, last_activity_at = CURRENT_TIMESTAMP WHERE id = ?',
            [answer.question_id]
        );

        res.json({ message: 'Answer deleted successfully' });
    } catch (error) {
        console.error('Delete answer error:', error);
        res.status(500).json({ error: 'Failed to delete answer' });
    }
});

// Accept answer (any team member can mark as approved)
router.post('/:id/accept', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Get answer and question info
        const [answers] = await db.query(
            `SELECT a.*, q.team_id
             FROM answers a
             JOIN questions q ON a.question_id = q.id
             WHERE a.id = ?`,
            [id]
        );

        if (answers.length === 0) {
            return res.status(404).json({ error: 'Answer not found' });
        }

        const answer = answers[0];

        // Verify user is a member of the team
        const [membership] = await db.query(
            'SELECT * FROM team_members WHERE user_id = ? AND team_id = ?',
            [req.user.userId, answer.team_id]
        );

        if (membership.length === 0) {
            return res.status(403).json({ error: 'Team membership required' });
        }

        // Unaccept any previously accepted answer
        await db.query(
            'UPDATE answers SET is_accepted = 0 WHERE question_id = ?',
            [answer.question_id]
        );

        // Accept this answer
        await db.query(
            'UPDATE answers SET is_accepted = 1 WHERE id = ?',
            [id]
        );

        // Notify answer author that their answer was accepted
        await createNotification({
            userId: answer.user_id,
            actorId: req.user.userId,
            questionId: answer.question_id,
            answerId: parseInt(id),
            type: 'accepted'
        });

        res.json({ message: 'Answer marked as approved successfully' });
    } catch (error) {
        console.error('Accept answer error:', error);
        res.status(500).json({ error: 'Failed to accept answer' });
    }
});

module.exports = router;
