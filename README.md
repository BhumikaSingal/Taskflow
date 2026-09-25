# TaskFlow

A simple task-management application built with:

- **Frontend:** Next.js + TypeScript
- **Backend:** Flask + Python
- **Database:** Supabase PostgreSQL
- **Authentication:** Google OAuth 2.0
- **Email:** Gmail API
- **Deployment:** Vercel (frontend) + Railway/Render (backend) + Supabase (database)

## Architecture

```text
┌──────────────────────┐
│      Next.js UI      │
│   TypeScript/React   │
└──────────┬───────────┘
           │ HTTPS / JSON
           ▼
┌──────────────────────┐
│      Flask API       │
│  Auth / Tasks / ACL  │
└───────┬───────┬──────┘
        │       │
        │       └──────────────┐
        ▼                      ▼
┌───────────────┐      ┌─────────────────┐
│    Supabase   │      │   Gmail API     │
│ PostgreSQL DB │      │ Task email send │
└───────────────┘      └─────────────────┘

Google OAuth:
Browser → Flask /auth/google → Google → Flask callback → session cookie
```

### Request flow

1. User clicks **Continue with Google**.
2. Flask redirects to Google OAuth.
3. Google returns an authorization code to Flask.
4. Flask exchanges the code, validates the ID token, and upserts the user in Supabase.
5. Flask sets a signed HTTP-only session cookie.
6. Next.js calls the Flask API with `credentials: "include"`.
7. Task creation/completion is persisted in Supabase.
8. Flask sends notification emails through Gmail API.

## Data model

- `users`: application users mapped to Google account IDs.
- `tasks`: task title, description, creator, assignee, status, timestamps.
- `task_events`: audit trail for creation/completion notifications.

See `backend/migrations/001_initial.sql`.

## Local development

### 1. Supabase

Create a Supabase project and run:

```text
backend/migrations/001_initial.sql
```

in the Supabase SQL editor.

### 2. Google OAuth

In Google Cloud Console:

- Create an OAuth 2.0 Web application client.
- Add the local redirect URI:
  `http://localhost:5000/auth/google/callback`
- Add the production redirect URI:
  `https://YOUR_BACKEND_DOMAIN/auth/google/callback`
- Configure the OAuth consent screen.
- The app requests `openid`, `email`, and `profile` for login.
- Gmail sending uses a separate refresh token belonging to the configured sender account and the `https://www.googleapis.com/auth/gmail.send` scope.

### 3. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
flask --app app run --debug --port 5000
```

### 4. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Gmail sender setup

The app intentionally separates **Google login** from **Gmail sending**.

Use a dedicated Gmail/Google Workspace sender account for `GMAIL_SENDER_EMAIL`. Generate a refresh token for that account with the Gmail send scope and put the token in `GMAIL_REFRESH_TOKEN`.

This avoids storing every user's Gmail credentials just to send task notifications.

## Environment variables

See:

- `backend/.env.example`
- `frontend/.env.example`

Never commit real secrets.

## Production deployment

### Backend: Railway or Render

Set the backend environment variables from `backend/.env.example`.

Set:

- `FRONTEND_URL` to the Vercel URL.
- `GOOGLE_REDIRECT_URI` to the production backend callback.
- `SESSION_COOKIE_SECURE=true`.

Start command:

```bash
gunicorn app:app
```

The included `backend/Procfile` is also suitable for platforms that detect Procfiles.

### Frontend: Vercel

Set:

```text
NEXT_PUBLIC_API_URL=https://YOUR_BACKEND_DOMAIN
```

Then deploy the `frontend` directory.

### Supabase

Run the SQL migration and use the Supabase project URL/service role key in the backend.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/auth/google` | Start Google OAuth |
| GET | `/auth/google/callback` | OAuth callback |
| POST | `/auth/logout` | Log out |
| GET | `/api/me` | Current user |
| GET | `/api/users` | Users available for assignment |
| GET | `/api/tasks` | Current user's tasks |
| POST | `/api/tasks` | Create a task |
| PATCH | `/api/tasks/<id>` | Update status/assignment |
| DELETE | `/api/tasks/<id>` | Delete a task |

## Security notes

- The backend uses HTTP-only signed session cookies.
- CSRF protection is implemented with an OAuth state value plus SameSite cookie settings.
- Supabase service-role credentials are backend-only.
- Task mutations verify the authenticated user.
- Email failures are logged and do not roll back successful task persistence.
- In production, use HTTPS and restrict CORS to the deployed frontend.

## Commit history

This deliverable is a clean starter repository. Git history is not created by the file generator because commit identity and repository ownership belong to the person deploying it. Suggested commits:

```text
feat: scaffold full-stack task manager
feat: add Google OAuth authentication
feat: add Supabase task persistence
feat: add Gmail task notifications
feat: add Next.js task dashboard
docs: add architecture and deployment guide
```

## License

MIT

## Phase 2: Task workflow

Run `backend/migrations/002_task_workflow.sql` in Supabase SQL Editor after the initial migration. It adds workflow statuses, priority, due dates, updated timestamps, event types, indexes, and the task activity endpoint used by the dashboard detail drawer.


## Phase 3: Collaboration
- Task comments with authors and timestamps
- In-app notification inbox
- Read/unread notification state
- Collaboration events in task history
- `task_comments` and `notifications` migrations


## Phase 4-9 completion notes

### Phase 4: Comments
- Task-level threaded discussion UI in the task drawer.
- Comment author, timestamp, validation, and audit events.
- Comments notify the other task participant.

### Phase 5: Notifications
- In-app notification center with unread badge.
- Mark-one-read and mark-all-read actions.
- Assignment, completion/status, priority, due-date, and comment notifications.
- Gmail email notifications remain server-side only.

### Phase 6: Dashboard analytics
- `/api/analytics` endpoint.
- Completion rate, open/overdue counts, status distribution, priority mix, and assignee workload.
- Responsive analytics panel in the dashboard.

### Phase 7: Tests, security, cleanup
- CSRF protection for API state-changing requests.
- Production cookie settings, security headers, request-size limit, strict CORS.
- Backend smoke/security tests and frontend TypeScript lint command.
- Fixed the Phase 3 `users.full_name` mismatch and added event metadata support.

### Phase 8: GitHub + deployment
The repository includes `.github/workflows/ci.yml`. Push the repository to GitHub, then connect:
- `frontend/` to Vercel.
- `backend/` to Railway or Render.
- Supabase as the PostgreSQL database.

Run migrations in order:
1. `001_initial.sql`
2. `002_task_workflow.sql`
3. `003_collaboration.sql`
4. `004_phase4_6.sql`

### Phase 9: README + portfolio presentation
See `docs/PORTFOLIO.md` for a concise project story, architecture summary, feature list, and screenshot checklist. Real screenshots should be captured from the running application rather than fabricated by the documentation, because apparently even portfolio projects have to remain attached to reality.
