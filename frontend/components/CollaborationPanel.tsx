"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Comment = {
  id: string;
  body: string;
  created_at: string;
  users?: { name?: string; email?: string };
};

export function CollaborationPanel({ taskId }: { taskId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setComments(await api<Comment[]>(`/api/tasks/${taskId}/comments`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load comments");
    }
  }

  useEffect(() => { load(); }, [taskId]);

  async function addComment() {
    if (!body.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const comment = await api<Comment>(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: body.trim() }),
      });
      setComments(current => [...current, comment]);
      setBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post comment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="collab-section">
      <div className="timeline-heading">
        <div><span className="eyebrow">COLLABORATION</span><h3>Comments</h3></div>
        <span>{comments.length} comment{comments.length === 1 ? "" : "s"}</span>
      </div>
      <div className="comment-list">
        {comments.length === 0 ? (
          <div className="empty-small">No comments yet.</div>
        ) : comments.map(comment => (
          <div className="comment" key={comment.id}>
            <div className="avatar small">
              {(comment.users?.name || comment.users?.email || "?")[0].toUpperCase()}
            </div>
            <div>
              <div className="comment-meta">
                <strong>{comment.users?.name || comment.users?.email || "Team member"}</strong>
                <span>{new Date(comment.created_at).toLocaleString()}</span>
              </div>
              <p>{comment.body}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="comment-compose">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write an update, question, or handoff..."
          maxLength={2000}
          aria-label="Comment"
        />
        {error && <div className="inline-error">{error}</div>}
        <button className="primary-button compact" onClick={addComment} disabled={!body.trim() || saving}>
          {saving ? "Posting..." : "Post comment"}
        </button>
      </div>
    </section>
  );
}
