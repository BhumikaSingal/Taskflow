"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Analytics = {
  total: number;
  open: number;
  completed: number;
  overdue: number;
  completion_rate: number;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  workload: { id: string; name: string; open_tasks: number }[];
};

const statusLabels: Record<string, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  completed: "Completed",
};

export function AnalyticsPanel() {
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    api<Analytics>("/api/analytics").then(setData).catch(() => setData(null));
  }, []);

  if (!data) return <section className="panel analytics-panel"><div className="empty-small">Analytics unavailable.</div></section>;

  const maxStatus = Math.max(1, ...Object.values(data.by_status));

  return (
    <section className="panel analytics-panel" id="analytics">
      <div className="panel-header">
        <div><span className="eyebrow">ANALYTICS</span><h2>Workspace analytics</h2><p>Current workload across the tasks you can access.</p></div>
      </div>
      <div className="analytics-grid">
        <div className="metric-card"><span>Completion rate</span><strong>{data.completion_rate}%</strong><small>{data.completed} of {data.total} tasks</small></div>
        <div className="metric-card"><span>Open work</span><strong>{data.open}</strong><small>{data.overdue} overdue</small></div>
        <div className="chart-card">
          <div className="chart-title">By status</div>
          <div className="bar-list">
            {Object.entries(data.by_status).map(([key, value]) => (
              <div className="bar-row" key={key}>
                <span>{statusLabels[key]}</span><div className="bar-track"><i style={{ width: `${(value / maxStatus) * 100}%` }} /></div><b>{value}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="chart-card">
          <div className="chart-title">Priority mix</div>
          <div className="priority-grid">
            {Object.entries(data.by_priority).map(([key, value]) => <div key={key}><span className={`priority-pill ${key}`}>{key}</span><strong>{value}</strong></div>)}
          </div>
        </div>
      </div>
      <div className="workload-list">
        <div className="chart-title">Open tasks by assignee</div>
        {data.workload.length === 0 ? <div className="empty-small">No assigned work yet.</div> :
          data.workload.map(person => <div className="workload-row" key={person.id}><span>{person.name}</span><b>{person.open_tasks}</b></div>)}
      </div>
    </section>
  );
}
