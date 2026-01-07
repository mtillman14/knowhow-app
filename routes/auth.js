const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');

// Register new user
router.post('/register',
    [
        body('email').isEmail().normalizeEmail(),
        body('password').isLength({ min: 6 }),
        body('firstName').trim().notEmpty(),
        body('lastName').trim().notEmpty()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, password, firstName, lastName, workType, role } = req.body;

            // Check if user already exists
            const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
            if (existing.length > 0) {
                return res.status(400).json({ error: 'Email already registered' });
            }

            // Hash password
            const passwordHash = await bcrypt.hash(password, 10);

            // Create user
            const [result] = await db.query(
                'INSERT INTO users (email, password_hash, first_name, last_name, work_type, role) VALUES (?, ?, ?, ?, ?, ?)',
                [email, passwordHash, firstName, lastName, workType, role]
            );

            // Generate JWT token
            const token = jwt.sign(
                { userId: result.insertId, email },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            res.cookie('token', token, {
                httpOnly: true,
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });

            res.status(201).json({
                message: 'User created successfully',
                userId: result.insertId,
                token
            });
        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ error: 'Registration failed' });
        }
    }
);

// Login
router.post('/login',
    [
        body('email').isEmail().normalizeEmail(),
        body('password').notEmpty()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, password } = req.body;

            // Find user
            const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
            if (users.length === 0) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }

            const user = users[0];

            // Verify password
            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }

            // Generate JWT token
            const token = jwt.sign(
                { userId: user.id, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            res.cookie('token', token, {
                httpOnly: true,
                maxAge: 7 * 24 * 60 * 60 * 1000
            });

            res.json({
                message: 'Login successful',
                userId: user.id,
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.first_name,
                    lastName: user.last_name
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ error: 'Login failed' });
        }
    }
);

// Logout
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
});

// Get current user
router.get('/me', async (req, res) => {
    try {
        const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const [users] = await db.query(
            'SELECT id, email, first_name, last_name, work_type, role, avatar_url, bio, location, created_at FROM users WHERE id = ?',
            [decoded.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get user's teams
        const [teams] = await db.query(
            `SELECT t.*, tm.role as user_role
             FROM teams t
             JOIN team_members tm ON t.id = tm.team_id
             WHERE tm.user_id = ?
             ORDER BY tm.joined_at DESC`,
            [decoded.userId]
        );

        res.json({
            user: users[0],
            teams
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user info' });
    }
});

module.exports = router;
