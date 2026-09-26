import base64
import logging
import os
import secrets
from datetime import date, datetime, timezone
from email.message import EmailMessage
from functools import wraps

from authlib.integrations.flask_client import OAuth
from dotenv import load_dotenv
from flask import Flask, jsonify, make_response, redirect, request, session
from flask_cors import CORS
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from supabase import create_client

load_dotenv(override=False)
logging.basicConfig(level=logging.INFO)

logging.basicConfig(level=logging.INFO)

oauth = OAuth()
supabase = None
CSRF_COOKIE = "taskflow_csrf"
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _create_notification(db, user_id, task_id, ntype, title, body):
    db.table("notifications").insert({
        "user_id": user_id,
        "task_id": task_id,
        "type": ntype,
        "title": title,
        "body": body,
    }).execute()


def _log_event(db, task_id, actor_id, event_type, metadata=None):
    db.table("task_events").insert({
        "task_id": task_id,
        "actor_id": actor_id,
        "event_type": event_type,
        "metadata": metadata or {},
    }).execute()


def create_app():
    global supabase

    app = Flask(__name__)
    production = os.environ.get("FLASK_ENV", "development").lower() == "production"
    secure_cookies = os.environ.get("SESSION_COOKIE_SECURE", str(production)).lower() == "true"

    secret_key = os.environ.get("SECRET_KEY")
    if production and (not secret_key or len(secret_key) < 32):
        raise RuntimeError("SECRET_KEY must be at least 32 characters in production")

    app.config.update(
        SECRET_KEY=secret_key or "dev-only-change-me",
        MAX_CONTENT_LENGTH=1 * 1024 * 1024,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SECURE=secure_cookies,
        SESSION_COOKIE_SAMESITE="None" if secure_cookies else "Lax",
    )

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    CORS(app, origins=[frontend_url], supports_credentials=True)

    supabase = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    oauth.init_app(app)
    oauth.register(
        name="google",
        client_id=os.environ["GOOGLE_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )

    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    def current_user():
        user_id = session.get("user_id")
        if not user_id:
            return None
        result = supabase.table("users").select("*").eq("id", user_id).maybe_single().execute()
        return result.data

    def login_required(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = current_user()
            if not user:
                return jsonify({"error": "Authentication required"}), 401
            return fn(user, *args, **kwargs)
        return wrapper

    def csrf_valid():
        if request.method not in MUTATING_METHODS or not request.path.startswith("/api/"):
            return True
        expected = request.cookies.get(CSRF_COOKIE)
        provided = request.headers.get("X-CSRF-Token")
        return bool(expected and provided and secrets.compare_digest(expected, provided))

    @app.before_request
    def protect_state_changes():
        if not csrf_valid():
            return jsonify({"error": "Invalid CSRF token"}), 403

    @app.get("/health")
    def health():
        return jsonify({"status": "ok"})

    @app.get("/api/csrf")
    def csrf_token():
        token = secrets.token_urlsafe(32)
        response = make_response(jsonify({"csrf_token": token}))
        response.set_cookie(
            CSRF_COOKIE,
            token,
            httponly=False,
            secure=secure_cookies,
            samesite="None" if secure_cookies else "Lax",
            max_age=3600,
        )
        return response

    @app.get("/auth/google")
    def google_login():
        return oauth.google.authorize_redirect(os.environ["GOOGLE_REDIRECT_URI"])

    @app.get("/auth/google/callback")
    def google_callback():
        token = oauth.google.authorize_access_token()
        userinfo = token.get("userinfo") or oauth.google.userinfo()
        if not userinfo.get("email_verified", False):
            return jsonify({"error": "Google account email is not verified"}), 400

        payload = {
            "google_sub": userinfo["sub"],
            "email": userinfo["email"].lower(),
            "name": userinfo.get("name") or userinfo["email"].split("@")[0],
            "avatar_url": userinfo.get("picture"),
        }
        existing = supabase.table("users").select("id").eq(
            "google_sub", payload["google_sub"]
        ).execute()
        if existing.data:
            user_id = existing.data[0]["id"]
            supabase.table("users").update(payload).eq("id", user_id).execute()
        else:
            created = supabase.table("users").insert(payload).execute()
            user_id = created.data[0]["id"]

        session.clear()
        session["user_id"] = user_id
        return redirect(frontend_url)

    @app.post("/auth/logout")
    def logout():
        session.clear()
        return jsonify({"ok": True})

    @app.get("/api/me")
    @login_required
    def me(user):
        return jsonify(user)

    @app.get("/api/users")
    @login_required
    def users(user):
        result = supabase.table("users").select(
            "id,name,email,avatar_url"
        ).neq("id", user["id"]).order("name").execute()
        return jsonify(result.data or [])

    def send_email(to_email, subject, body):
        sender = os.environ.get("GMAIL_SENDER_EMAIL")
        refresh_token = os.environ.get("GMAIL_REFRESH_TOKEN")
        if not sender or not refresh_token:
            logging.warning("Gmail is not configured; skipping email to %s", to_email)
            return

        creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=os.environ["GOOGLE_CLIENT_ID"],
            client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
            scopes=["https://www.googleapis.com/auth/gmail.send"],
        )
        service = build("gmail", "v1", credentials=creds, cache_discovery=False)
        msg = EmailMessage()
        msg["To"] = to_email
        msg["From"] = sender
        msg["Subject"] = subject
        msg.set_content(body)
        encoded = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        service.users().messages().send(userId="me", body={"raw": encoded}).execute()

    def notify_email(to_email, subject, body):
        if not to_email:
            return
        try:
            send_email(to_email, subject, body)
        except Exception:
            logging.exception("Failed to send Gmail notification")

    def get_task(task_id):
        return supabase.table("tasks").select("*").eq("id", task_id).maybe_single().execute().data

    def can_access(user, task):
        return bool(task and user["id"] in {task["created_by"], task.get("assigned_to")})

    def task_participants(task):
        return {uid for uid in (task.get("created_by"), task.get("assigned_to")) if uid}

    def user_email(user_id):
        row = supabase.table("users").select("email,name").eq("id", user_id).maybe_single().execute().data
        return row or {}

    @app.get("/api/tasks")
    @login_required
    def list_tasks(user):
        result = supabase.table("tasks").select(
            "*, creator:users!tasks_created_by_fkey(id,name,email,avatar_url), "
            "assignee:users!tasks_assigned_to_fkey(id,name,email,avatar_url)"
        ).or_(
            f"created_by.eq.{user['id']},assigned_to.eq.{user['id']}"
        ).order("created_at", desc=True).execute()
        return jsonify(result.data or [])

    @app.post("/api/tasks")
    @login_required
    def create_task(user):
        data = request.get_json(silent=True) or {}
        title = (data.get("title") or "").strip()
        description = (data.get("description") or "").strip()
        assigned_to = data.get("assigned_to") or None
        if not title or len(title) > 200:
            return jsonify({"error": "Title must be between 1 and 200 characters"}), 400
        if len(description) > 10000:
            return jsonify({"error": "Description is too long"}), 400

        target = None
        if assigned_to:
            target = supabase.table("users").select("id,email,name").eq(
                "id", assigned_to
            ).maybe_single().execute().data
            if not target:
                return jsonify({"error": "Assignee not found"}), 400

        priority = data.get("priority", "medium")
        if priority not in ("low", "medium", "high", "urgent"):
            return jsonify({"error": "Invalid priority"}), 400
        due_date = data.get("due_date") or None
        if due_date:
            try:
                date.fromisoformat(due_date)
            except ValueError:
                return jsonify({"error": "Invalid due date"}), 400

        inserted = supabase.table("tasks").insert({
            "title": title,
            "description": description,
            "created_by": user["id"],
            "assigned_to": assigned_to,
            "priority": priority,
            "due_date": due_date,
        }).execute()
        task = inserted.data[0]
        _log_event(supabase, task["id"], user["id"], "created")
        if assigned_to:
            _log_event(supabase, task["id"], user["id"], "assigned", {"assignee_id": assigned_to})
            _create_notification(
                supabase, assigned_to, task["id"], "task_assigned",
                "New task assigned",
                f'{user["name"]} assigned "{task["title"]}" to you.',
            )
            notify_email(
                target["email"],
                f'New task assigned: {task["title"]}',
                f'You have been assigned "{task["title"]}".\n\n{task["description"]}',
            )
        return jsonify(task), 201

    @app.patch("/api/tasks/<task_id>")
    @login_required
    def update_task(user, task_id):
        task = get_task(task_id)
        if not can_access(user, task):
            return jsonify({"error": "Not authorized"}), 403

        data = request.get_json(silent=True) or {}
        updates = {}
        events = []
        old_assignee = task.get("assigned_to")

        if "title" in data and user["id"] == task["created_by"]:
            title = (data["title"] or "").strip()
            if not title or len(title) > 200:
                return jsonify({"error": "Title must be between 1 and 200 characters"}), 400
            updates["title"] = title

        if "description" in data and user["id"] == task["created_by"]:
            description = (data["description"] or "").strip()
            if len(description) > 10000:
                return jsonify({"error": "Description is too long"}), 400
            updates["description"] = description

        if "assigned_to" in data and user["id"] == task["created_by"]:
            new_assignee = data["assigned_to"] or None
            if new_assignee:
                target = supabase.table("users").select("id,email,name").eq(
                    "id", new_assignee
                ).maybe_single().execute().data
                if not target:
                    return jsonify({"error": "Assignee not found"}), 400
            updates["assigned_to"] = new_assignee

        if "priority" in data and user["id"] == task["created_by"]:
            if data["priority"] not in ("low", "medium", "high", "urgent"):
                return jsonify({"error": "Invalid priority"}), 400
            updates["priority"] = data["priority"]

        if "due_date" in data and user["id"] == task["created_by"]:
            due_date = data["due_date"] or None
            if due_date:
                try:
                    date.fromisoformat(due_date)
                except ValueError:
                    return jsonify({"error": "Invalid due date"}), 400
            updates["due_date"] = due_date

        if "status" in data:
            allowed = ("backlog", "todo", "in_progress", "in_review", "completed")
            if data["status"] not in allowed:
                return jsonify({"error": "Invalid status"}), 400
            if data["status"] != task["status"]:
                updates["status"] = data["status"]
                updates["completed_at"] = (
                    datetime.now(timezone.utc).isoformat()
                    if data["status"] == "completed" else None
                )
                events.append(
                    "completed" if data["status"] == "completed"
                    else ("reopened" if task["status"] == "completed" else "status_changed")
                )

        if updates.get("priority") != task.get("priority") and "priority" in updates:
            events.append("priority_changed")
        if updates.get("due_date") != task.get("due_date") and "due_date" in updates:
            events.append("due_date_changed")
        if "assigned_to" in updates and updates["assigned_to"] != old_assignee:
            events.append("assigned" if updates["assigned_to"] else "unassigned")

        if not updates:
            return jsonify(task)

        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = supabase.table("tasks").update(updates).eq("id", task_id).execute().data[0]

        for event_type in events:
            metadata = {}
            if event_type == "assigned":
                metadata["assignee_id"] = result.get("assigned_to")
            _log_event(supabase, task_id, user["id"], event_type, metadata)

        recipients = task_participants(result) - {user["id"]}
        if result.get("assigned_to") and result["assigned_to"] != old_assignee:
            recipients.discard(result["assigned_to"])
        for recipient in recipients:
            if events:
                for event_type in events:
                    labels = {
                        "completed": "Task completed",
                        "reopened": "Task reopened",
                        "status_changed": "Task status changed",
                        "priority_changed": "Task priority changed",
                        "due_date_changed": "Task due date changed",
                        "assigned": "Task assigned",
                        "unassigned": "Task unassigned",
                    }
                    notification_type = {
                        "completed": "task_completed",
                        "assigned": "task_assigned",
                        "status_changed": "status_changed",
                        "priority_changed": "priority_changed",
                        "due_date_changed": "due_date_changed",
                    }.get(event_type, "status_changed")
                    _create_notification(
                        supabase, recipient, task_id, notification_type,
                        labels.get(event_type, "Task updated"),
                        f'"{result.get("title", "Task")}" was {labels.get(event_type, "updated").lower()}.',
                    )

        if result.get("assigned_to") and result["assigned_to"] != old_assignee:
            assignee = user_email(result["assigned_to"])
            if assignee:
                _create_notification(
                    supabase, result["assigned_to"], task_id, "task_assigned",
                    "New task assigned",
                    f'{user["name"]} assigned "{result["title"]}" to you.',
                )
                notify_email(
                    assignee.get("email"),
                    f'New task assigned: {result["title"]}',
                    f'You have been assigned "{result["title"]}".\n\n{result.get("description", "")}',
                )

        if "completed" in events and old_assignee and old_assignee != user["id"]:
            recipient = user_email(old_assignee)
            notify_email(
                recipient.get("email"),
                f'Task completed: {result["title"]}',
                f'"{result["title"]}" has been completed.',
            )

        return jsonify(result)

    @app.get("/api/tasks/<task_id>/events")
    @login_required
    def task_events(user, task_id):
        task = get_task(task_id)
        if not can_access(user, task):
            return jsonify({"error": "Not authorized"}), 403
        result = supabase.table("task_events").select(
            "id,event_type,metadata,created_at,actor:users!task_events_actor_id_fkey(id,name,email,avatar_url)"
        ).eq("task_id", task_id).order("created_at", desc=True).execute()
        return jsonify(result.data or [])

    @app.delete("/api/tasks/<task_id>")
    @login_required
    def delete_task(user, task_id):
        task = get_task(task_id)
        if not task:
            return jsonify({"error": "Task not found"}), 404
        if task["created_by"] != user["id"]:
            return jsonify({"error": "Only the creator can delete a task"}), 403
        supabase.table("tasks").delete().eq("id", task_id).execute()
        return jsonify({"ok": True})

    @app.get("/api/tasks/<task_id>/comments")
    @login_required
    def get_comments(user, task_id):
        task = get_task(task_id)
        if not can_access(user, task):
            return jsonify({"error": "Forbidden"}), 403
        rows = supabase.table("task_comments").select(
            "id,task_id,user_id,body,created_at,updated_at,users(id,name,email,avatar_url)"
        ).eq("task_id", task_id).order("created_at", desc=False).execute()
        return jsonify(rows.data or [])

    @app.post("/api/tasks/<task_id>/comments")
    @login_required
    def add_comment(user, task_id):
        data = request.get_json(silent=True) or {}
        body = (data.get("body") or "").strip()
        if not body or len(body) > 2000:
            return jsonify({"error": "Comment must be between 1 and 2000 characters"}), 400

        task = get_task(task_id)
        if not can_access(user, task):
            return jsonify({"error": "Forbidden"}), 403

        row = supabase.table("task_comments").insert({
            "task_id": task_id,
            "user_id": user["id"],
            "body": body,
        }).select(
            "id,task_id,user_id,body,created_at,updated_at,users(id,name,email,avatar_url)"
        ).single().execute().data

        _log_event(supabase, task_id, user["id"], "comment_added", {"comment_id": row["id"]})

        recipient_ids = task_participants(task) - {user["id"]}
        for recipient in recipient_ids:
            _create_notification(
                supabase, recipient, task_id, "comment_added",
                "New comment on your task",
                f'{user["name"]} commented on "{task["title"]}".',
            )
        return jsonify(row), 201

    @app.get("/api/notifications")
    @login_required
    def get_notifications(user):
        rows = supabase.table("notifications").select("*").eq(
            "user_id", user["id"]
        ).order("created_at", desc=True).limit(50).execute().data or []
        return jsonify({
            "notifications": rows,
            "unread_count": sum(1 for row in rows if not row.get("read_at")),
        })

    @app.patch("/api/notifications/<notification_id>/read")
    @login_required
    def mark_notification_read(user, notification_id):
        row = supabase.table("notifications").select("id").eq(
            "id", notification_id
        ).eq("user_id", user["id"]).maybe_single().execute().data
        if not row:
            return jsonify({"error": "Notification not found"}), 404
        supabase.table("notifications").update({
            "read_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", notification_id).eq("user_id", user["id"]).execute()
        return jsonify({"ok": True})

    @app.post("/api/notifications/read-all")
    @login_required
    def mark_all_notifications_read(user):
        supabase.table("notifications").update({
            "read_at": datetime.now(timezone.utc).isoformat()
        }).eq("user_id", user["id"]).is_("read_at", "null").execute()
        return jsonify({"ok": True})

    @app.get("/api/analytics")
    @login_required
    def analytics(user):
        result = supabase.table("tasks").select(
            "id,title,status,priority,due_date,assigned_to,created_by,created_at,completed_at"
        ).or_(f"created_by.eq.{user['id']},assigned_to.eq.{user['id']}").execute()
        tasks = result.data or []
        total = len(tasks)
        completed = sum(t["status"] == "completed" for t in tasks)
        open_count = total - completed
        today = date.today().isoformat()
        overdue = sum(
            bool(t.get("due_date")) and t["due_date"] < today and t["status"] != "completed"
            for t in tasks
        )

        by_status = {key: 0 for key in ("backlog", "todo", "in_progress", "in_review", "completed")}
        by_priority = {key: 0 for key in ("low", "medium", "high", "urgent")}
        workload = {}
        for task in tasks:
            by_status[task["status"]] = by_status.get(task["status"], 0) + 1
            by_priority[task["priority"]] = by_priority.get(task["priority"], 0) + 1
            if task.get("assigned_to"):
                workload[task["assigned_to"]] = workload.get(task["assigned_to"], 0) + 1

        user_ids = list(workload)
        if user_ids:
            team = supabase.table("users").select("id,name,email").in_("id", user_ids).execute().data or []
            team_by_id = {u["id"]: u for u in team}
            workload_rows = [
                {**team_by_id.get(uid, {"id": uid, "name": "Unknown"}), "open_tasks": count}
                for uid, count in workload.items()
            ]
        else:
            workload_rows = []

        return jsonify({
            "total": total,
            "open": open_count,
            "completed": completed,
            "overdue": overdue,
            "completion_rate": round((completed / total) * 100, 1) if total else 0,
            "by_status": by_status,
            "by_priority": by_priority,
            "workload": sorted(workload_rows, key=lambda x: x["open_tasks"], reverse=True),
        })

    return app


app = create_app()
