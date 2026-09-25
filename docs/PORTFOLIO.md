# TaskFlow portfolio presentation

## One-line project description

TaskFlow is a full-stack collaborative task manager with Google OAuth, Supabase persistence, workflow states, comments, notifications, Gmail delivery, analytics, and production deployment support.

## What this project demonstrates

- **Frontend:** Next.js, React, TypeScript, responsive dashboard UI.
- **Backend:** Flask REST API with authenticated task authorization.
- **Database:** Supabase PostgreSQL with migrations, indexes, constraints, and audit events.
- **Authentication:** Google OAuth with signed HTTP-only sessions.
- **Security:** CSRF protection, strict CORS, secure production cookies, security headers, request limits, server-only service credentials.
- **Collaboration:** comments and task activity history.
- **Notifications:** in-app unread inbox plus optional Gmail delivery.
- **Analytics:** completion rate, status/priority distribution, overdue work, and assignee workload.
- **CI/CD:** GitHub Actions checks backend tests and frontend TypeScript/build.

## Suggested portfolio screenshots

Capture these from the deployed app:

1. **Dashboard overview**: task list, KPI cards, and create-task form.
2. **Task drawer**: status/priority/due date controls, activity history, and comments.
3. **Notifications**: unread notification badge and notification center.
4. **Analytics**: completion rate, status bars, priority mix, and workload.
5. **Responsive view**: mobile dashboard showing the compact layout.

Do not include email addresses, OAuth client IDs, tokens, service-role keys, or other secrets in screenshots.

## Portfolio talking points

### Problem
Small teams need a lightweight way to assign work, track progress, discuss tasks, and understand workload without maintaining several disconnected tools.

### Technical solution
A Next.js client communicates with a Flask API. Flask owns authentication, authorization, task mutations, notifications, and external Gmail integration. Supabase stores users, tasks, events, comments, and notifications.

### Architecture
```text
Next.js / TypeScript
        |
        | HTTPS + JSON + session cookie
        v
Flask API
  |       |       |
  v       v       v
Supabase Google  Gmail API
  DB      OAuth    Email
```

### Security decisions
- Browser never receives the Supabase service-role key.
- State-changing API requests require a CSRF token.
- Production sessions use secure, HTTP-only, SameSite=None cookies for cross-origin frontend/backend deployments.
- CORS is restricted to the configured frontend origin.
- Task mutations enforce creator/assignee authorization on the server.

## Demo flow

1. Sign in with Google.
2. Create a task with priority and due date.
3. Assign it to another workspace user.
4. Open the task drawer and add a comment.
5. Change the status and inspect the activity history.
6. Open notifications and mark items read.
7. Review the analytics panel.
8. Show the deployed frontend and backend health endpoint.
