const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const path = require("path");
require("dotenv").config();

const initializeDatabase = require("./config/init-db");
const db = require("./config/database");

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers (all except HSTS which forces HTTPS)
app.use(
  helmet({
    hsts: false,
  }),
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Import routes
const authRoutes = require("./routes/auth");
const teamRoutes = require("./routes/teams");
const questionRoutes = require("./routes/questions");
const answerRoutes = require("./routes/answers");
const commentRoutes = require("./routes/comments");
const voteRoutes = require("./routes/votes");
const tagRoutes = require("./routes/tags");
const userRoutes = require("./routes/users");
const bookmarkRoutes = require("./routes/bookmarks");
const adminRoutes = require("./routes/admin");
const notificationRoutes = require("./routes/notifications");

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/answers", answerRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/votes", voteRoutes);
app.use("/api/tags", tagRoutes);
app.use("/api/users", userRoutes);
app.use("/api/bookmarks", bookmarkRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);

// Health check endpoint (for container orchestration / load balancers)
app.get("/health", async (req, res) => {
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: "connected",
  };

  try {
    await db.query("SELECT 1");
    res.json(health);
  } catch (error) {
    health.status = "unhealthy";
    health.database = "disconnected";
    res.status(503).json(health);
  }
});

// Serve frontend pages
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/create-team", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "create-team.html"));
});

app.get("/team/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "team.html"));
});

app.get("/team/:slug/questions", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "questions.html"));
});

app.get("/team/:slug/questions/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "question-detail.html"));
});

app.get("/team/:slug/ask", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "ask-question.html"));
});

app.get("/team/:slug/users/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "user-profile.html"));
});

app.get("/team/:slug/members", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "members.html"));
});

app.get("/team/:slug/bookmarks", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "bookmarks.html"));
});

app.get("/team/:slug/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/team/:slug/notifications", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "notifications.html"));
});

app.get("/invite/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "invite.html"));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database
    // console.log('Initializing database...');
    await initializeDatabase();

    // Start server
    app.listen(PORT, () => {
      // console.log(`✓ Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
