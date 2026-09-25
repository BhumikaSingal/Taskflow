"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Notification = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read_at?: string | null;
  task_id?: string | null;
};

export function NotificationCenter({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await api<{ notifications: Notification[] }>("/api/notifications");
      setItems(data.notifications);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function markRead(id: string) {
    await api(`/api/notifications/${id}/read`, { method: "PATCH" });
    setItems(current => current.map(item =>
      item.id === id ? { ...item, read_at: new Date().toISOString() } : item
    ));
  }

  async function readAll() {
    await api("/api/notifications/read-all", { method: "POST" });
    setItems(current => current.map(item => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
  }

  return (
    <div className="notification-popover" role="dialog" aria-label="Notifications">
      <div className="notification-popover-head">
        <div><span className="eyebrow">INBOX</span><h3>Notifications</h3></div>
        <div className="notification-actions">
          <button className="text-button" onClick={readAll}>Mark all read</button>
          <button className="icon-button" onClick={onClose} aria-label="Close notifications">×</button>
        </div>
      </div>
      {loading ? <div className="empty-small">Loading notifications...</div> :
        items.length === 0 ? <div className="empty-small">You're all caught up.</div> :
        <div className="notification-list">
          {items.map(item => (
            <button
              className={`notification ${item.read_at ? "" : "unread"}`}
              key={item.id}
              onClick={() => !item.read_at && markRead(item.id)}
            >
              <span className="notification-dot" />
              <span>
                <strong>{item.title}</strong>
                <small>{item.body}</small>
                <time>{new Date(item.created_at).toLocaleString()}</time>
              </span>
            </button>
          ))}
        </div>
      }
    </div>
  );
}
