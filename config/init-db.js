const mysql = require('mysql2/promise');
require('dotenv').config();

async function initializeDatabase() {
    let connection;

    try {
        // Connect without selecting a database
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            port: process.env.DB_PORT || 3306
        });

        console.log('Connected to MySQL server');

        // Create database if it doesn't exist
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'stack_internal'}`);
        console.log(`✓ Database '${process.env.DB_NAME || 'stack_internal'}' ready`);

        // Use the database
        await connection.query(`USE ${process.env.DB_NAME || 'stack_internal'}`);

        // Create tables
        const tables = [
            // Users table
            `CREATE TABLE IF NOT EXISTS users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                first_name VARCHAR(100),
                last_name VARCHAR(100),
                work_type VARCHAR(100),
                role VARCHAR(100),
                avatar_url VARCHAR(500),
                bio TEXT,
                location VARCHAR(200),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_email (email)
            )`,

            // Teams table
            `CREATE TABLE IF NOT EXISTS teams (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(255) NOT NULL,
                slug VARCHAR(255) UNIQUE NOT NULL,
                company_name VARCHAR(255),
                company_size VARCHAR(50),
                primary_goal VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_slug (slug)
            )`,

            // Team members junction table
            `CREATE TABLE IF NOT EXISTS team_members (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                team_id INT NOT NULL,
                role ENUM('admin', 'member') DEFAULT 'member',
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
                UNIQUE KEY unique_membership (user_id, team_id),
                INDEX idx_user_team (user_id, team_id)
            )`,

            // Questions table
            `CREATE TABLE IF NOT EXISTS questions (
                id INT PRIMARY KEY AUTO_INCREMENT,
                team_id INT NOT NULL,
                user_id INT NOT NULL,
                title VARCHAR(500) NOT NULL,
                body TEXT NOT NULL,
                view_count INT DEFAULT 0,
                score INT DEFAULT 0,
                answer_count INT DEFAULT 0,
                is_closed BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_team (team_id),
                INDEX idx_user (user_id),
                INDEX idx_created (created_at),
                INDEX idx_activity (last_activity_at),
                INDEX idx_score (score),
                FULLTEXT idx_search (title, body)
            )`,

            // Answers table
            `CREATE TABLE IF NOT EXISTS answers (
                id INT PRIMARY KEY AUTO_INCREMENT,
                question_id INT NOT NULL,
                user_id INT NOT NULL,
                body TEXT NOT NULL,
                score INT DEFAULT 0,
                is_accepted BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_question (question_id),
                INDEX idx_user (user_id),
                INDEX idx_accepted (is_accepted)
            )`,

            // Comments table (for both questions and answers)
            `CREATE TABLE IF NOT EXISTS comments (
                id INT PRIMARY KEY AUTO_INCREMENT,
                parent_type ENUM('question', 'answer') NOT NULL,
                parent_id INT NOT NULL,
                user_id INT NOT NULL,
                body TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_parent (parent_type, parent_id),
                INDEX idx_user (user_id)
            )`,

            // Votes table (for questions and answers)
            `CREATE TABLE IF NOT EXISTS votes (
                id INT PRIMARY KEY AUTO_INCREMENT,
                votable_type ENUM('question', 'answer') NOT NULL,
                votable_id INT NOT NULL,
                user_id INT NOT NULL,
                vote_type ENUM('up', 'down') NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_vote (votable_type, votable_id, user_id),
                INDEX idx_votable (votable_type, votable_id)
            )`,

            // Tags table
            `CREATE TABLE IF NOT EXISTS tags (
                id INT PRIMARY KEY AUTO_INCREMENT,
                team_id INT NOT NULL,
                name VARCHAR(50) NOT NULL,
                description TEXT,
                question_count INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
                UNIQUE KEY unique_team_tag (team_id, name),
                INDEX idx_team (team_id),
                INDEX idx_name (name)
            )`,

            // Question-Tag junction table
            `CREATE TABLE IF NOT EXISTS question_tags (
                question_id INT NOT NULL,
                tag_id INT NOT NULL,
                FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (question_id, tag_id),
                INDEX idx_tag (tag_id)
            )`,

            // Notifications table (for "Ask team members" feature)
            `CREATE TABLE IF NOT EXISTS notifications (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                question_id INT,
                answer_id INT,
                type ENUM('mention', 'answer', 'comment', 'upvote') NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
                FOREIGN KEY (answer_id) REFERENCES answers(id) ON DELETE CASCADE,
                INDEX idx_user_read (user_id, is_read),
                INDEX idx_created (created_at)
            )`,

            // Bookmarks/Saved questions
            `CREATE TABLE IF NOT EXISTS bookmarks (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                question_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
                UNIQUE KEY unique_bookmark (user_id, question_id),
                INDEX idx_user (user_id)
            )`
        ];

        for (const tableSQL of tables) {
            await connection.query(tableSQL);
        }

        console.log('✓ All database tables created successfully');

        await connection.end();
        return true;
    } catch (error) {
        console.error('Database initialization error:', error);
        if (connection) {
            await connection.end();
        }
        throw error;
    }
}

module.exports = initializeDatabase;
