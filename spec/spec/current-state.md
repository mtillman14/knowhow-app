# KnowHow - Current State Summary

A self-hosted Stack Overflow for Teams clone.

## Tech Stack

- **Backend**: Node.js + Express.js 4.18.2
- **Database**: MySQL 2
- **Authentication**: JWT + bcrypt
- **Frontend**: HTML5 + Vanilla JavaScript + CSS3
- **Markdown**: marked + DOMPurify

## Project Structure

```
/workspace/
├── server.js                 # Express app entry point
├── schema.sql               # Database schema reference
├── config/
│   ├── database.js          # MySQL connection pool
│   └── init-db.js           # Database initialization
├── middleware/
│   └── auth.js              # JWT auth & authorization
├── routes/                  # API endpoints
│   ├── auth.js, teams.js, questions.js, answers.js
│   ├── comments.js, votes.js, users.js, tags.js
├── public/                  # Frontend static assets
│   ├── js/app.js           # Shared utilities
│   ├── css/style.css       # Styling
│   └── *.html              # Page templates
└── .devcontainer/          # Docker dev environment
```

## Database Schema

**10 tables:**

| Table           | Purpose                                             |
| --------------- | --------------------------------------------------- |
| `users`         | User accounts (email, password_hash, profile data)  |
| `teams`         | Team workspaces with slug, company info             |
| `team_members`  | User-team associations with roles (admin/member)    |
| `questions`     | Team-scoped questions with title, body, scores      |
| `answers`       | Answers with body, score, is_accepted flag          |
| `comments`      | Comments on questions or answers                    |
| `votes`         | Upvotes/downvotes on questions and answers          |
| `tags`          | Team-specific tags with question count              |
| `question_tags` | Links questions to tags (max 5)                     |
| `notifications` | Notification system (schema ready, not implemented) |
| `bookmarks`     | User-saved questions                                |

## Implemented Features

### Authentication & Users

- User registration/login with email/password
- JWT tokens in HTTP-only cookies (7-day expiry)
- User profile view and editing
- User search within teams

### Team Management

- Create teams with slug URL and company metadata
- Team members list with activity statistics
- Add members by email
- Role-based access control (admin/member)
- Team statistics (questions, members, tags)

### Questions

- Create with title, body, and 1-5 tags
- List with filtering: sort (newest/active/score/frequent), filter (no-answers/unanswered)
- Full-text search on title and body
- Tag filtering with pagination
- Edit (owner only)
- Delete (owner or admin)
- View count tracking

### Answers

- Create/edit/delete answers
- Mark as accepted (any team member)
- Sort by score, oldest, or newest
- Answer count tracking on questions

### Comments

- Add to questions or answers (max 600 chars)
- View in chronological order
- Delete (owner only)

### Voting

- Upvote/downvote questions and answers
- Toggle behavior (same vote removes, different vote switches)
- Score tracking

### Tags

- Team-specific with question count
- Search/autocomplete
- Sorted by popularity

### Bookmarks

- Toggle bookmark on questions
- View all bookmarked questions per team
- Remove bookmarks from list view

## API Endpoints

| Route            | Methods                                                        | Purpose         |
| ---------------- | -------------------------------------------------------------- | --------------- |
| `/api/auth`      | POST register/login/logout, GET /me                            | Authentication  |
| `/api/teams`     | POST /, GET /:slug, GET/POST /:slug/members                    | Team management |
| `/api/questions` | GET, POST, PUT /:id, DELETE /:id                               | Questions CRUD  |
| `/api/answers`   | GET /question/:id, POST, PUT/:id, DELETE/:id, POST /:id/accept | Answers CRUD    |
| `/api/comments`  | GET, POST, DELETE /:id                                         | Comments        |
| `/api/votes`     | GET, POST                                                      | Voting          |
| `/api/users`     | GET /:id, PUT /profile, GET /search                            | User profiles   |
| `/api/tags`      | GET, GET /search                                               | Tags            |
| `/api/bookmarks` | POST (toggle), GET (list), GET /check                          | Bookmarks       |

## Frontend Pages

| Page                   | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `index.html`           | Landing page, shows user's teams             |
| `create-team.html`     | Multi-step team creation wizard              |
| `questions.html`       | Team questions list with filters             |
| `ask-question.html`    | Create/edit questions with markdown          |
| `question-detail.html` | Question view with answers, comments, voting |
| `user-profile.html`    | User profile with activity                   |
| `members.html`         | Team members directory                       |
| `bookmarks.html`       | User's bookmarked questions                  |

## Authorization Model

- JWT middleware validates all protected routes
- Team membership required for all team-scoped actions
- Resource ownership checks for edit/delete operations
- Admin role required for certain destructive operations
- Complete team-level data isolation

## Not Yet Implemented

- Notifications system (database schema exists, no endpoints)
- Search history
- Password reset

## Other TODO
