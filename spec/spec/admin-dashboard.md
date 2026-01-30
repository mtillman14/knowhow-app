# Admin Dashboard Implementation Plan

## Overview
Implement an admin dashboard for team management with user roles, member management, and invite functionality.

## Current State
- User roles **already exist**: `team_members.role` ENUM('admin', 'member')
- Team creators are **already set as admins** in `/workspace/routes/teams.js`
- `requireTeamAdmin` middleware exists in `/workspace/middleware/auth.js`

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `public/admin.html` | Admin dashboard page UI |
| `routes/admin.js` | Admin API endpoints |

### Modified Files
| File | Changes |
|------|---------|
| `server.js` | Mount admin routes, serve admin.html |
| `public/css/style.css` | Admin-specific styles (tables, modals, badges) |
| `schema.sql` | Add `team_invites` table |
| `config/init-db.js` | Add team_invites table creation |
| `public/questions.html` | Add Admin nav tab (visible to admins only) |
| `public/members.html` | Add Admin nav tab |
| `public/bookmarks.html` | Add Admin nav tab |
| `public/question-detail.html` | Add Admin nav tab |
| `public/ask-question.html` | Add Admin nav tab |
| `public/user-profile.html` | Add Admin nav tab |

---

## Phase 1: Frontend UI (Placeholder Backend)

### 1.1 Database Schema - Add `team_invites` table
```sql
CREATE TABLE team_invites (
    id INT PRIMARY KEY AUTO_INCREMENT,
    team_id INT NOT NULL,
    email VARCHAR(255) NOT NULL,
    invited_by INT NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    status ENUM('pending', 'accepted', 'expired', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL 7 DAY),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_token (token),
    INDEX idx_team_status (team_id, status)
);
```

### 1.2 Admin Dashboard Page (`public/admin.html`)
- Header (same pattern as other pages)
- Navigation tabs (Questions, Members, Bookmarks, **Admin**)
- Stats cards: Total Members, Admins, Pending Invites
- Tabs: Members | Pending Invites
- Members table: User, Email, Role, Joined, Actions
- Invites table: Email, Invited By, Sent, Expires, Actions
- Modals: Invite Member, Confirm Remove, Confirm Role Change

### 1.3 CSS Additions (`public/css/style.css`)
- `.admin-header`, `.admin-stats`, `.stat-card`
- `.admin-tabs`, `.admin-tab`
- `.admin-table` (styled table)
- `.role-badge`, `.role-admin`, `.role-member`
- `.btn-small`, `.btn-secondary`, `.btn-danger`
- Modal styles: `.modal-overlay`, `.modal`, `.modal-header`, `.modal-body`, `.modal-footer`

### 1.4 Server Changes (`server.js`)
- Add route: `GET /team/:slug/admin` → serve `admin.html`

### 1.5 Navigation Updates (all pages)
- Add hidden Admin tab: `<a href="#" id="nav-admin" class="nav-tab" style="display: none;">Admin</a>`
- In `setupNavigation()`: show tab only if user role is 'admin'

---

## Phase 2: Backend Implementation

### 2.1 Invite System: Shareable Link
- Admin enters email, system generates token-based invite link
- Admin copies link and shares it manually (no email service needed)
- Invitee clicks link, logs in/registers, and joins team

### 2.2 API Endpoints (`routes/admin.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/:teamId/members` | List all members with stats |
| PUT | `/api/admin/:teamId/members/:memberId/role` | Update role (admin/member) |
| DELETE | `/api/admin/:teamId/members/:memberId` | Remove member from team |
| GET | `/api/admin/:teamId/invites` | List pending invites |
| POST | `/api/admin/:teamId/invites` | Create invite → returns shareable link |
| DELETE | `/api/admin/:teamId/invites/:inviteId` | Cancel invite |

### 2.3 Accept Invite Endpoint (add to `routes/teams.js`)
- `POST /api/teams/invites/accept` - Accept invite with token

### 2.4 Business Rules
- Admins cannot demote themselves
- Team must always have at least one admin
- Cannot remove self from team
- Invites expire after 7 days
- User email must match invite email to accept

---

## Implementation Steps

### Step 1: Schema & Server Setup
1. Add `team_invites` table to `schema.sql` and `config/init-db.js`
2. Add admin page route to `server.js`

### Step 2: Create Admin Page UI
1. Create `public/admin.html` with full structure
2. Add placeholder JS that calls API endpoints (will fail gracefully)

### Step 3: Add CSS Styles
1. Add admin styles to `public/css/style.css`

### Step 4: Update Navigation
1. Add Admin tab to all pages (hidden by default, shown for admins)

### Step 5: Create Backend Routes
1. Create `routes/admin.js` with all endpoints
2. Mount in `server.js`
3. Add accept invite endpoint to `routes/teams.js`

### Step 6: Connect Frontend to Backend
1. Update admin.html JS to use correct team ID
2. Test all functionality end-to-end

---

## Verification Plan
1. Create a team (verify creator becomes admin)
2. Navigate to `/team/{slug}/admin` as admin
3. Verify non-admins are redirected
4. Test invite flow: create → view pending → cancel
5. Test member management: promote → demote → remove
6. Verify at least one admin rule is enforced
