const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const initializeDatabase = require('./config/init-db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Import routes
const authRoutes = require('./routes/auth');
const teamRoutes = require('./routes/teams');
const questionRoutes = require('./routes/questions');
const answerRoutes = require('./routes/answers');
const commentRoutes = require('./routes/comments');
const voteRoutes = require('./routes/votes');
const tagRoutes = require('./routes/tags');
const userRoutes = require('./routes/users');

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/answers', answerRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/votes', voteRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/users', userRoutes);

// Serve frontend pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/create-team', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'create-team.html'));
});

app.get('/team/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'team.html'));
});

app.get('/team/:slug/questions', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'questions.html'));
});

app.get('/team/:slug/questions/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'question-detail.html'));
});

app.get('/team/:slug/ask', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'ask-question.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
async function startServer() {
    try {
        // Initialize database
        console.log('Initializing database...');
        await initializeDatabase();

        // Start server
        app.listen(PORT, () => {
            console.log(`✓ Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
