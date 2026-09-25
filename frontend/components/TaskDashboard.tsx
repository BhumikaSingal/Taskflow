"use client";

import { CollaborationPanel } from "./CollaborationPanel";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { NotificationCenter } from "./NotificationCenter";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, googleLoginUrl } from "../lib/api";

type User = { id: string; name: string; email: string; avatar_url?: string | null };
type Status = "backlog" | "todo" | "in_progress" | "in_review" | "completed";
type Priority = "low" | "medium" | "high" | "urgent";
type Task = {
  id: string; title: string; description: string; status: Status; priority: Priority;
  due_date?: string | null; created_at: string; updated_at?: string; completed_at?: string | null;
  assigned_to?: string | null; creator?: User; assignee?: User;
};
type Event = { id: string; event_type: string; created_at: string; actor?: User };

type IconName = "grid" | "check" | "users" | "activity" | "search" | "plus" | "bell" | "logout" | "arrow" | "calendar" | "clock" | "flag" | "x" | "chevron";
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-6"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    calendar: <><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    flag: <><path d="M5 21V4"/><path d="M5 4c5-3 9 3 14 0v10c-5 3-9-3-14 0"/></>,
    x: <><path d="m6 6 12 12M18 6 6 18"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function initials(user?: User | null) { return user?.name ? user.name.split(" ").map(p => p[0]).join("").slice(0,2).toUpperCase() : "?"; }
function formatDate(value?: string | null) { if (!value) return "No due date"; return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value + (value.length === 10 ? "T00:00:00" : ""))); }
function isOverdue(task: Task) { return !!task.due_date && task.status !== "completed" && new Date(task.due_date + "T23:59:59") < new Date(); }
function statusLabel(status: Status) { return ({ backlog: "Backlog", todo: "To do", in_progress: "In progress", in_review: "In review", completed: "Completed" })[status]; }
function eventLabel(event: Event) { return ({ created: "created this task", assigned: "assigned this task", unassigned: "removed the assignee", completed: "completed this task", reopened: "reopened this task", status_changed: "changed the status", priority_changed: "changed the priority", due_date_changed: "changed the due date" }[event.event_type] || "updated this task"); }

export default function TaskDashboard() {
  const [me, setMe] = useState<User | null>(null), [users, setUsers] = useState<User[]>([]), [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState(""), [description, setDescription] = useState(""), [assignedTo, setAssignedTo] = useState(""), [priority, setPriority] = useState<Priority>("medium"), [dueDate, setDueDate] = useState("");
  const [query, setQuery] = useState(""), [filter, setFilter] = useState<"all" | Status>("all"), [error, setError] = useState(""), [loading, setLoading] = useState(true), [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null), [events, setEvents] = useState<Event[]>([]), [saving, setSaving] = useState(false), [showNotifications, setShowNotifications] = useState(false), [unreadNotifications, setUnreadNotifications] = useState(0);

  async function load() {
    try { const current = await api<User>("/api/me"); setMe(current); const [taskData, userData, notificationData] = await Promise.all([api<Task[]>("/api/tasks"), api<User[]>("/api/users"), api<{ notifications: { read_at?: string | null }[] }>("/api/notifications")]); setTasks(taskData); setUsers(userData); setUnreadNotifications(notificationData.notifications.filter(n => !n.read_at).length); }
    catch { setMe(null); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function createTask(e: FormEvent) {
    e.preventDefault(); setError(""); setCreating(true);
    try { await api("/api/tasks", { method: "POST", body: JSON.stringify({ title, description, assigned_to: assignedTo || null, priority, due_date: dueDate || null }) }); setTitle(""); setDescription(""); setAssignedTo(""); setPriority("medium"); setDueDate(""); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not create task"); } finally { setCreating(false); }
  }
  async function updateTask(task: Task, updates: Record<string, unknown>) {
    setSaving(true); setError("");
    try { const updated = await api<Task>(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(updates) }); setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...updated, creator: t.creator, assignee: users.find(u => u.id === updated.assigned_to) || t.assignee } : t)); setSelected(prev => prev?.id === task.id ? { ...prev, ...updated, creator: prev.creator, assignee: users.find(u => u.id === updated.assigned_to) || prev.assignee } : prev); await load(); if (selected?.id === task.id) loadEvents(task.id); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update task"); } finally { setSaving(false); }
  }
  async function loadEvents(id: string) { try { setEvents(await api<Event[]>(`/api/tasks/${id}/events`)); } catch { setEvents([]); } }
  async function openTask(task: Task) { setSelected(task); await loadEvents(task.id); }
  async function logout() { await api("/auth/logout", { method: "POST" }); setMe(null); setTasks([]); }

  const filteredTasks = useMemo(() => tasks.filter(task => {
    const matchesFilter = filter === "all" || task.status === filter;
    const text = `${task.title} ${task.description} ${task.assignee?.name || ""}`.toLowerCase();
    return matchesFilter && text.includes(query.toLowerCase());
  }), [tasks, filter, query]);
  const completed = tasks.filter(t => t.status === "completed").length, open = tasks.filter(t => t.status !== "completed").length;
  const assignedToMe = tasks.filter(t => t.assigned_to === me?.id && t.status !== "completed").length;
  const overdue = tasks.filter(isOverdue).length;

  if (loading) return <main className="app-shell"><div className="loading-screen"><div className="spinner"/><p>Loading your workspace...</p></div></main>;
  if (!me) return <main className="login-page"><div className="login-orb orb-one"/><div className="login-orb orb-two"/><section className="login-panel"><div className="brand-mark">T</div><span className="eyebrow">TEAM WORKSPACE</span><h1>Work gets done<br/><span>when it gets organized.</span></h1><p>Plan tasks, keep your team aligned, and see progress without turning work into another full-time job.</p><a className="google-button" href={googleLoginUrl()}><span className="google-g">G</span> Continue with Google <Icon name="arrow" size={16}/></a><small>Secure sign-in powered by Google OAuth</small></section></main>;

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark small">T</div><span>TaskFlow</span></div><nav className="nav"><a className="nav-item active" href="#dashboard"><Icon name="grid"/> Dashboard</a><a className="nav-item" href="#tasks"><Icon name="check"/> My Tasks <b>{assignedToMe}</b></a><a className="nav-item" href="#team"><Icon name="users"/> Team</a><a className="nav-item" href="#activity"><Icon name="activity"/> Activity</a><a className="nav-item" href="#analytics"><Icon name="activity"/> Analytics</a></nav><div className="sidebar-bottom"><div className="profile-card"><div className="avatar">{initials(me)}</div><div className="profile-copy"><strong>{me.name}</strong><span>{me.email}</span></div><button className="icon-button" title="Log out" onClick={logout}><Icon name="logout" size={16}/></button></div></div></aside>
    <section className="workspace" id="dashboard"><header className="topbar"><div className="mobile-brand"><div className="brand-mark small">T</div><strong>TaskFlow</strong></div><div className="search-wrap"><Icon name="search" size={17}/><input aria-label="Search tasks" placeholder="Search tasks..." value={query} onChange={e => setQuery(e.target.value)}/></div><button className="notification-button" title="Notifications" aria-label="Notifications" onClick={() => setShowNotifications(v => !v)}><Icon name="bell"/>{unreadNotifications > 0 && <span>{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>}</button>{showNotifications && <NotificationCenter onClose={() => { setShowNotifications(false); load().catch(() => {}); }} />}</header>
      <div className="content"><div className="hero-row"><div><span className="eyebrow">YOUR WORKSPACE</span><h1>Good morning, {me.name.split(" ")[0]}.</h1><p>Plan, prioritize and move work forward.</p></div><a href="#create-task" className="primary-button"><Icon name="plus" size={17}/> New task</a></div>
        <section className="stats-grid"><article className="stat-card"><span className="stat-icon purple"><Icon name="grid"/></span><div><small>Total tasks</small><strong>{tasks.length}</strong><span>Across your workspace</span></div></article><article className="stat-card"><span className="stat-icon amber"><Icon name="clock"/></span><div><small>Open</small><strong>{open}</strong><span>Still moving</span></div></article><article className="stat-card"><span className="stat-icon green"><Icon name="check"/></span><div><small>Completed</small><strong>{completed}</strong><span>Shipped</span></div></article><article className="stat-card"><span className="stat-icon red"><Icon name="flag"/></span><div><small>Overdue</small><strong>{overdue}</strong><span>Need attention</span></div></article></section>
        {error && <div className="error-banner">{error}</div>}
        <div className="dashboard-grid"><section className="panel task-panel" id="tasks"><div className="panel-header"><div><h2>Tasks</h2><p>Click a task to inspect and update it.</p></div><div className="filter-tabs">{(["all","backlog","todo","in_progress","in_review","completed"] as const).map(item => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All" : statusLabel(item)}</button>)}</div></div>
          {filteredTasks.length === 0 ? <div className="empty-state"><div className="empty-icon"><Icon name="check"/></div><h3>No tasks found</h3><p>Try another filter or create something new.</p><a href="#create-task" className="text-link">Create a task <Icon name="arrow" size={13}/></a></div> : <div className="task-list">{filteredTasks.map(task => <article className={`task-row ${task.status === "completed" ? "completed" : ""}`} key={task.id} onClick={() => openTask(task)}><button className={`check-button ${task.status === "completed" ? "checked" : ""}`} onClick={e => { e.stopPropagation(); updateTask(task, { status: task.status === "completed" ? "todo" : "completed" }); }}>{task.status === "completed" && <Icon name="check" size={13}/>}</button><div className="task-main"><div className="task-title-line"><h3>{task.title}</h3><span className={`status-pill ${task.status}`}>{statusLabel(task.status)}</span><span className={`priority-pill ${task.priority}`}>{task.priority}</span></div>{task.description && <p>{task.description}</p>}<div className="task-meta"><span className={isOverdue(task) ? "overdue" : ""}><Icon name="calendar" size={12}/> {task.due_date ? (isOverdue(task) ? "Overdue · " : "Due · ") + formatDate(task.due_date) : "No due date"}</span>{task.assignee && <><i/><span className="mini-avatar">{initials(task.assignee)}</span><span>{task.assignee.name}</span></>}</div></div><span className="open-task"><Icon name="arrow" size={14}/></span></article>)}</div>}
        </section>
        <section className="panel create-panel" id="create-task"><div className="create-header"><span className="create-icon"><Icon name="plus"/></span><div><h2>Create a task</h2><p>Give the work a clear owner and finish line.</p></div></div><form onSubmit={createTask}><label>Task title<input required maxLength={200} placeholder="e.g. Review landing page" value={title} onChange={e => setTitle(e.target.value)}/></label><label>Description<span className="optional">Optional</span><textarea placeholder="Add context for whoever picks this up..." value={description} onChange={e => setDescription(e.target.value)}/></label><div className="form-two"><label>Priority<select value={priority} onChange={e => setPriority(e.target.value as Priority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label>Due date<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></label></div><label>Assign to<select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}><option value="">Nobody yet</option>{users.map(user => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label><button className="primary-button full" disabled={creating}><Icon name="plus" size={17}/> {creating ? "Creating..." : "Create task"}</button></form></section></div>
        <AnalyticsPanel />
        <section className="bottom-grid" id="team"><div className="panel team-panel"><div className="panel-header"><div><h2>Team</h2><p>People in your workspace.</p></div></div><div className="team-list">{users.slice(0,6).map(user => <div className="team-member" key={user.id}><div className="avatar">{initials(user)}</div><div><strong>{user.name}</strong><span>{user.email}</span></div><span className="member-count">{tasks.filter(t => t.assigned_to === user.id && t.status !== "completed").length} open</span></div>)}</div></div><div className="panel activity-preview" id="activity"><div className="panel-header"><div><h2>Workspace pulse</h2><p>A quick read on what needs attention.</p></div></div><div className="activity-item"><span className="activity-dot red-dot"/><div><strong>{overdue ? `${overdue} overdue task${overdue === 1 ? "" : "s"}` : "No overdue tasks"}</strong><span>{overdue ? "Review dates and unblock the team." : "The calendar is behaving itself."}</span></div></div><div className="activity-item"><span className="activity-dot green-dot"/><div><strong>{completed ? `${completed} completed task${completed === 1 ? "" : "s"}` : "No completed tasks yet"}</strong><span>Every finished task counts.</span></div></div></div></section>
      </div></section>

    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><aside className="task-drawer" onClick={e => e.stopPropagation()}><div className="drawer-header"><div><span className="eyebrow">TASK DETAILS</span><h2>{selected.title}</h2></div><button className="icon-button close-button" onClick={() => setSelected(null)}><Icon name="x"/></button></div><div className="drawer-body"><div className="detail-grid"><div><span>Status</span><select value={selected.status} disabled={saving || false} onChange={e => updateTask(selected, { status: e.target.value })}>{(["backlog","todo","in_progress","in_review","completed"] as Status[]).map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></div><div><span>Priority</span><select value={selected.priority} disabled={saving || selected.creator?.id !== me.id} onChange={e => updateTask(selected, { priority: e.target.value })}>{(["low","medium","high","urgent"] as Priority[]).map(p => <option key={p} value={p}>{p[0].toUpperCase()+p.slice(1)}</option>)}</select></div><div><span>Due date</span><input type="date" value={selected.due_date || ""} disabled={saving || selected.creator?.id !== me.id} onChange={e => updateTask(selected, { due_date: e.target.value || null })}/></div><div><span>Assignee</span><select value={selected.assigned_to || ""} disabled={saving || selected.creator?.id !== me.id} onChange={e => updateTask(selected, { assigned_to: e.target.value || null })}><option value="">Unassigned</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div></div><div className="description-block"><span>Description</span><p>{selected.description || "No description provided."}</p></div><CollaborationPanel taskId={selected.id} /><div className="timeline"><div className="timeline-heading"><div><span className="eyebrow">HISTORY</span><h3>Activity</h3></div><span>{events.length} events</span></div>{events.length === 0 ? <p className="muted">No activity yet.</p> : events.map(event => <div className="timeline-item" key={event.id}><div className="timeline-line"><span/></div><div><strong>{event.actor?.name || "Someone"} {eventLabel(event)}</strong><span>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}</span></div></div>)}</div></div></aside></div>}
  </main>;
}
