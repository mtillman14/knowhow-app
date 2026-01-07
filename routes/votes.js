const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Vote on question or answer
router.post('/',
    authenticateToken,
    [
        body('votableType').isIn(['question', 'answer']),
        body('votableId').isInt(),
        body('voteType').isIn(['up', 'down'])
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { votableType, votableId, voteType } = req.body;
            const userId = req.user.userId;

            // Check if user already voted
            const [existingVote] = await db.query(
                'SELECT * FROM votes WHERE votable_type = ? AND votable_id = ? AND user_id = ?',
                [votableType, votableId, userId]
            );

            if (existingVote.length > 0) {
                // User already voted
                if (existingVote[0].vote_type === voteType) {
                    // Same vote - remove it (toggle off)
                    await db.query(
                        'DELETE FROM votes WHERE votable_type = ? AND votable_id = ? AND user_id = ?',
                        [votableType, votableId, userId]
                    );

                    // Update score
                    const scoreChange = voteType === 'up' ? -1 : 1;
                    await db.query(
                        `UPDATE ${votableType}s SET score = score + ? WHERE id = ?`,
                        [scoreChange, votableId]
                    );

                    return res.json({
                        message: 'Vote removed',
                        action: 'removed',
                        voteType: null
                    });
                } else {
                    // Different vote - update it
                    await db.query(
                        'UPDATE votes SET vote_type = ? WHERE votable_type = ? AND votable_id = ? AND user_id = ?',
                        [voteType, votableType, votableId, userId]
                    );

                    // Update score (change is +2 or -2)
                    const scoreChange = voteType === 'up' ? 2 : -2;
                    await db.query(
                        `UPDATE ${votableType}s SET score = score + ? WHERE id = ?`,
                        [scoreChange, votableId]
                    );

                    return res.json({
                        message: 'Vote updated',
                        action: 'updated',
                        voteType
                    });
                }
            } else {
                // New vote
                await db.query(
                    'INSERT INTO votes (votable_type, votable_id, user_id, vote_type) VALUES (?, ?, ?, ?)',
                    [votableType, votableId, userId, voteType]
                );

                // Update score
                const scoreChange = voteType === 'up' ? 1 : -1;
                await db.query(
                    `UPDATE ${votableType}s SET score = score + ? WHERE id = ?`,
                    [scoreChange, votableId]
                );

                // Update question last activity
                if (votableType === 'question') {
                    await db.query(
                        'UPDATE questions SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?',
                        [votableId]
                    );
                } else {
                    const [answers] = await db.query('SELECT question_id FROM answers WHERE id = ?', [votableId]);
                    if (answers.length > 0) {
                        await db.query(
                            'UPDATE questions SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?',
                            [answers[0].question_id]
                        );
                    }
                }

                return res.status(201).json({
                    message: 'Vote added',
                    action: 'added',
                    voteType
                });
            }
        } catch (error) {
            console.error('Vote error:', error);
            res.status(500).json({ error: 'Failed to process vote' });
        }
    }
);

// Get user's vote for a specific item
router.get('/',
    authenticateToken,
    async (req, res) => {
        try {
            const { votableType, votableId } = req.query;

            if (!votableType || !votableId) {
                return res.status(400).json({ error: 'votableType and votableId required' });
            }

            const [votes] = await db.query(
                'SELECT vote_type FROM votes WHERE votable_type = ? AND votable_id = ? AND user_id = ?',
                [votableType, votableId, req.user.userId]
            );

            res.json({
                voteType: votes.length > 0 ? votes[0].vote_type : null
            });
        } catch (error) {
            console.error('Get vote error:', error);
            res.status(500).json({ error: 'Failed to get vote' });
        }
    }
);

module.exports = router;
