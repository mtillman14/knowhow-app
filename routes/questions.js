const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireTeamMember, optionalAuth } = require('../middleware/auth');

// Get all questions for a team
router.get('/', authenticateToken, async (req, res) => {
    try {
        const {
            teamId,
            sort = 'active',
            filter,
            tag,
            search,
            page = 1,
            limit = 20
        } = req.query;

        if (!teamId) {
            return res.status(400).json({ error: 'teamId is required' });
        }

        // Build query
        let query = `
            SELECT q.*,
                   u.first_name, u.last_name, u.avatar_url,
                   GROUP_CONCAT(DISTINCT t.name) as tags
            FROM questions q
            JOIN users u ON q.user_id = u.id
            LEFT JOIN question_tags qt ON q.id = qt.question_id
            LEFT JOIN tags t ON qt.tag_id = t.id
            WHERE q.team_id = ?
        `;

        const params = [teamId];

        // Filter by tag
        if (tag) {
            query += ` AND EXISTS (
                SELECT 1 FROM question_tags qt2
                JOIN tags t2 ON qt2.tag_id = t2.id
                WHERE qt2.question_id = q.id AND t2.name = ?
            )`;
            params.push(tag);
        }

        // Search
        if (search) {
            query += ` AND (q.title LIKE ? OR q.body LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        // Filter
        if (filter === 'no-answers') {
            query += ` AND q.answer_count = 0`;
        } else if (filter === 'unanswered') {
            query += ` AND NOT EXISTS (
                SELECT 1 FROM answers a WHERE a.question_id = q.id AND a.is_accepted = 1
            )`;
        }

        query += ` GROUP BY q.id`;

        // Sort
        switch (sort) {
            case 'newest':
                query += ` ORDER BY q.created_at DESC`;
                break;
            case 'active':
                query += ` ORDER BY q.last_activity_at DESC`;
                break;
            case 'score':
                query += ` ORDER BY q.score DESC, q.created_at DESC`;
                break;
            case 'frequent':
                query += ` ORDER BY q.view_count DESC`;
                break;
            default:
                query += ` ORDER BY q.last_activity_at DESC`;
        }

        // Pagination
        const offset = (page - 1) * limit;
        query += ` LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const [questions] = await db.query(query, params);

        // Get total count
        let countQuery = `SELECT COUNT(DISTINCT q.id) as total FROM questions q WHERE q.team_id = ?`;
        const countParams = [teamId];

        if (tag) {
            countQuery += ` AND EXISTS (
                SELECT 1 FROM question_tags qt
                JOIN tags t ON qt.tag_id = t.id
                WHERE qt.question_id = q.id AND t.name = ?
            )`;
            countParams.push(tag);
        }

        if (search) {
            countQuery += ` AND (q.title LIKE ? OR q.body LIKE ?)`;
            countParams.push(`%${search}%`, `%${search}%`);
        }

        if (filter === 'no-answers') {
            countQuery += ` AND q.answer_count = 0`;
        } else if (filter === 'unanswered') {
            countQuery += ` AND NOT EXISTS (SELECT 1 FROM answers a WHERE a.question_id = q.id AND a.is_accepted = 1)`;
        }

        const [countResult] = await db.query(countQuery, countParams);

        res.json({
            questions,
            total: countResult[0].total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(countResult[0].total / limit)
        });
    } catch (error) {
        console.error('Get questions error:', error);
        res.status(500).json({ error: 'Failed to get questions' });
    }
});

// Get single question by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const [questions] = await db.query(
            `SELECT q.*,
                    u.id as user_id, u.first_name, u.last_name, u.avatar_url, u.bio
             FROM questions q
             JOIN users u ON q.user_id = u.id
             WHERE q.id = ?`,
            [id]
        );

        if (questions.length === 0) {
            return res.status(404).json({ error: 'Question not found' });
        }

        const question = questions[0];

        // Get tags
        const [tags] = await db.query(
            `SELECT t.* FROM tags t
             JOIN question_tags qt ON t.id = qt.tag_id
             WHERE qt.question_id = ?`,
            [id]
        );

        question.tags = tags;

        // Increment view count
        await db.query(
            'UPDATE questions SET view_count = view_count + 1 WHERE id = ?',
            [id]
        );

        // Get user's vote if authenticated
        if (req.user) {
            const [votes] = await db.query(
                'SELECT vote_type FROM votes WHERE votable_type = ? AND votable_id = ? AND user_id = ?',
                ['question', id, req.user.userId]
            );
            question.userVote = votes.length > 0 ? votes[0].vote_type : null;
        }

        res.json(question);
    } catch (error) {
        console.error('Get question error:', error);
        res.status(500).json({ error: 'Failed to get question' });
    }
});

// Create new question
router.post('/',
    authenticateToken,
    [
        body('teamId').isInt(),
        body('title').trim().notEmpty().isLength({ max: 500 }),
        body('body').trim().notEmpty(),
        body('tags').isArray({ min: 1, max: 5 })
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { teamId, title, body, tags } = req.body;

            // Verify user is team member
            const [membership] = await db.query(
                'SELECT * FROM team_members WHERE user_id = ? AND team_id = ?',
                [req.user.userId, teamId]
            );

            if (membership.length === 0) {
                return res.status(403).json({ error: 'Not a member of this team' });
            }

            // Create question
            const [result] = await db.query(
                'INSERT INTO questions (team_id, user_id, title, body) VALUES (?, ?, ?, ?)',
                [teamId, req.user.userId, title, body]
            );

            const questionId = result.insertId;

            // Add tags
            for (const tagName of tags) {
                // Get or create tag
                let [existingTags] = await db.query(
                    'SELECT id FROM tags WHERE team_id = ? AND name = ?',
                    [teamId, tagName.toLowerCase()]
                );

                let tagId;
                if (existingTags.length === 0) {
                    const [tagResult] = await db.query(
                        'INSERT INTO tags (team_id, name) VALUES (?, ?)',
                        [teamId, tagName.toLowerCase()]
                    );
                    tagId = tagResult.insertId;
                } else {
                    tagId = existingTags[0].id;
                }

                // Link tag to question
                await db.query(
                    'INSERT INTO question_tags (question_id, tag_id) VALUES (?, ?)',
                    [questionId, tagId]
                );

                // Update tag count
                await db.query(
                    'UPDATE tags SET question_count = question_count + 1 WHERE id = ?',
                    [tagId]
                );
            }

            res.status(201).json({
                message: 'Question created successfully',
                questionId
            });
        } catch (error) {
            console.error('Create question error:', error);
            res.status(500).json({ error: 'Failed to create question' });
        }
    }
);

// Update question
router.put('/:id',
    authenticateToken,
    [
        body('title').optional().trim().notEmpty().isLength({ max: 500 }),
        body('body').optional().trim().notEmpty(),
        body('tags').optional().isString()
    ],
    async (req, res) => {
        try {
            const { id } = req.params;
            const { title, body, tags } = req.body;

            // Check if user owns the question
            const [questions] = await db.query(
                'SELECT user_id, team_id FROM questions WHERE id = ?',
                [id]
            );

            if (questions.length === 0) {
                return res.status(404).json({ error: 'Question not found' });
            }

            if (questions[0].user_id !== req.user.userId) {
                return res.status(403).json({ error: 'Not authorized to edit this question' });
            }

            const teamId = questions[0].team_id;

            // Update question
            const updates = [];
            const params = [];

            if (title) {
                updates.push('title = ?');
                params.push(title);
            }
            if (body) {
                updates.push('body = ?');
                params.push(body);
            }

            if (updates.length === 0 && !tags) {
                return res.status(400).json({ error: 'No updates provided' });
            }

            if (updates.length > 0) {
                params.push(id);
                await db.query(
                    `UPDATE questions SET ${updates.join(', ')}, last_activity_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    params
                );
            }

            // Update tags if provided
            if (tags !== undefined) {
                // Parse tags (comma-separated string)
                const tagArray = tags.split(',')
                    .map(t => t.trim())
                    .filter(t => t.length > 0)
                    .slice(0, 5); // Max 5 tags

                // Get current tags to update counts
                const [currentTags] = await db.query(
                    `SELECT tag_id FROM question_tags WHERE question_id = ?`,
                    [id]
                );

                // Decrement counts for old tags
                for (const currentTag of currentTags) {
                    await db.query(
                        'UPDATE tags SET question_count = GREATEST(0, question_count - 1) WHERE id = ?',
                        [currentTag.tag_id]
                    );
                }

                // Remove old tags
                await db.query('DELETE FROM question_tags WHERE question_id = ?', [id]);

                // Add new tags
                for (const tagName of tagArray) {
                    // Get or create tag
                    let [existingTags] = await db.query(
                        'SELECT id FROM tags WHERE team_id = ? AND name = ?',
                        [teamId, tagName.toLowerCase()]
                    );

                    let tagId;
                    if (existingTags.length === 0) {
                        const [tagResult] = await db.query(
                            'INSERT INTO tags (team_id, name) VALUES (?, ?)',
                            [teamId, tagName.toLowerCase()]
                        );
                        tagId = tagResult.insertId;
                    } else {
                        tagId = existingTags[0].id;
                    }

                    // Link tag to question
                    await db.query(
                        'INSERT INTO question_tags (question_id, tag_id) VALUES (?, ?)',
                        [id, tagId]
                    );

                    // Update tag count
                    await db.query(
                        'UPDATE tags SET question_count = question_count + 1 WHERE id = ?',
                        [tagId]
                    );
                }
            }

            res.json({ message: 'Question updated successfully' });
        } catch (error) {
            console.error('Update question error:', error);
            res.status(500).json({ error: 'Failed to update question' });
        }
    }
);

// Delete question
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if user owns the question or is team admin
        const [questions] = await db.query(
            'SELECT q.user_id, q.team_id FROM questions q WHERE q.id = ?',
            [id]
        );

        if (questions.length === 0) {
            return res.status(404).json({ error: 'Question not found' });
        }

        const question = questions[0];

        // Check if user owns it or is admin
        const [membership] = await db.query(
            'SELECT role FROM team_members WHERE user_id = ? AND team_id = ?',
            [req.user.userId, question.team_id]
        );

        if (question.user_id !== req.user.userId && (!membership.length || membership[0].role !== 'admin')) {
            return res.status(403).json({ error: 'Not authorized to delete this question' });
        }

        // Delete question (cascades to answers, comments, votes, etc.)
        await db.query('DELETE FROM questions WHERE id = ?', [id]);

        res.json({ message: 'Question deleted successfully' });
    } catch (error) {
        console.error('Delete question error:', error);
        res.status(500).json({ error: 'Failed to delete question' });
    }
});

module.exports = router;
