const jwt = require('jsonwebtoken');

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid or expired token.' });
    }
};

// Middleware to check if user is team admin
const requireTeamAdmin = async (req, res, next) => {
    try {
        const db = require('../config/database');
        const teamId = req.params.teamId || req.body.teamId;

        const [membership] = await db.query(
            'SELECT role FROM team_members WHERE user_id = ? AND team_id = ?',
            [req.user.userId, teamId]
        );

        if (!membership.length || membership[0].role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required.' });
        }

        next();
    } catch (error) {
        return res.status(500).json({ error: 'Authorization check failed.' });
    }
};

// Middleware to check if user is team member
const requireTeamMember = async (req, res, next) => {
    try {
        const db = require('../config/database');
        const teamId = req.params.teamId || req.body.teamId || req.query.teamId;

        const [membership] = await db.query(
            'SELECT * FROM team_members WHERE user_id = ? AND team_id = ?',
            [req.user.userId, teamId]
        );

        if (!membership.length) {
            return res.status(403).json({ error: 'Team membership required.' });
        }

        req.teamMembership = membership[0];
        next();
    } catch (error) {
        return res.status(500).json({ error: 'Authorization check failed.' });
    }
};

// Optional authentication (for public routes that can use auth if available)
const optionalAuth = (req, res, next) => {
    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;
        } catch (error) {
            // Invalid token, but that's okay for optional auth
        }
    }

    next();
};

module.exports = {
    authenticateToken,
    requireTeamAdmin,
    requireTeamMember,
    optionalAuth
};
