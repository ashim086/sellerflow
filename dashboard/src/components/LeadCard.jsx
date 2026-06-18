import { useState } from "react";
import { API_URL } from "../config.js";

const BUYER_KEYWORDS = ["stock", "price", "order", "buy", "cost", "available", "deliver",
  "kati", "paisa", "rs", "rupee", "dinu", "chahiyo", "kinnu", "maal", "rate", "discount", "offer"];

function detectKeywords(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return BUYER_KEYWORDS.filter(kw => lower.includes(kw));
}

const STATUS_COLORS = {
  new: { bg: "#eff6ff", text: "#1d4ed8", label: "New" },
  contacted: { bg: "#fffbeb", text: "#b45309", label: "Contacted" },
  converted: { bg: "#f0fdf4", text: "#15803d", label: "Converted" },
  lost: { bg: "#f3f4f6", text: "#6b7280", label: "Lost" },
};

const PLATFORM_STYLES = {
  instagram: { bg: "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)", color: "#fff", label: "Instagram" },
  whatsapp: { bg: "#25d366", color: "#fff", label: "WhatsApp" },
  facebook: { bg: "#1877f2", color: "#fff", label: "Facebook" },
};

function confidenceColor(score) {
  if (score >= 0.7) return "#16a34a";
  if (score >= 0.4) return "#d97706";
  return "#dc2626";
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function LeadCard({ lead, token, onUpdate, onCreateOrder }) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(lead.status);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const plat = PLATFORM_STYLES[lead.platform] || PLATFORM_STYLES.instagram;
  const stat = STATUS_COLORS[status] || STATUS_COLORS.new;

  async function updateStatus(newStatus) {
    setStatus(newStatus);
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/leads/${lead._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      const updated = await res.json();
      onUpdate(updated);
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/leads/${lead._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note }),
      });
      const updated = await res.json();
      onUpdate(updated);
      setNote("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "12px",
        border: "1.5px solid #f0f0f0",
        marginBottom: "10px",
        overflow: "hidden",
        boxShadow: expanded ? "0 2px 12px rgba(0,0,0,0.07)" : "none",
        transition: "box-shadow 0.2s",
      }}
    >
      {/* Card header (always visible) */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: "12px" }}
      >
        {/* Platform badge */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0 }}>
          <div
            style={{
              background: plat.bg,
              color: plat.color,
              borderRadius: "6px",
              padding: "3px 8px",
              fontSize: "11px",
              fontWeight: "700",
              whiteSpace: "nowrap",
            }}
          >
            {plat.label}
          </div>
          {lead.aiExtracted?.processedAt && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{
                background: "#f0f9ff",
                color: "#0369a1",
                borderRadius: "5px",
                padding: "1px 6px",
                fontSize: "10px",
                fontWeight: "700",
                border: "1px solid #bae6fd",
              }}>AI</span>
              <span style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: confidenceColor(lead.aiExtracted.confidence || 0),
                display: "inline-block",
                flexShrink: 0,
              }} title={`Confidence: ${Math.round((lead.aiExtracted.confidence || 0) * 100)}%`} />
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: "700", fontSize: "14px" }}>{lead.username}</span>
            <span style={{ fontSize: "11px", color: "#aaa", flexShrink: 0, marginLeft: "8px" }}>
              {timeAgo(lead.savedAt)}
            </span>
          </div>
          <p
            style={{
              fontSize: "13px",
              color: "#666",
              marginTop: "3px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {lead.lastMessage || "No message"}
          </p>
          {detectKeywords(lead.lastMessage).length > 0 && (
            <div style={{ display: "flex", gap: "4px", marginTop: "4px", flexWrap: "wrap" }}>
              {detectKeywords(lead.lastMessage).slice(0, 3).map(kw => (
                <span key={kw} style={{
                  background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa",
                  borderRadius: "10px", padding: "1px 7px", fontSize: "10px", fontWeight: "700",
                }}>
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Status badge */}
        <div
          style={{
            background: stat.bg,
            color: stat.text,
            borderRadius: "20px",
            padding: "3px 10px",
            fontSize: "11px",
            fontWeight: "700",
            flexShrink: 0,
          }}
        >
          {stat.label}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ borderTop: "1px solid #f0f0f0", padding: "16px" }}>
          {lead.profileUrl && (
            <p style={{ fontSize: "12px", color: "#6366f1", marginBottom: "12px", wordBreak: "break-all" }}>
              <a href={lead.profileUrl} target="_blank" rel="noopener noreferrer">
                {lead.profileUrl}
              </a>
            </p>
          )}

          {/* AI Extraction */}
          {lead.aiExtracted?.processedAt && (
            <div style={{
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: "8px",
              padding: "10px 12px",
              marginBottom: "14px",
              fontSize: "12px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontWeight: "700", color: "#0369a1" }}>AI Extracted</span>
                <span style={{ color: confidenceColor(lead.aiExtracted.confidence || 0), fontWeight: "600" }}>
                  {Math.round((lead.aiExtracted.confidence || 0) * 100)}% confidence
                </span>
              </div>
              {lead.aiExtracted.customerName && (
                <div style={{ marginBottom: "4px" }}>
                  <span style={{ color: "#555", fontWeight: "600" }}>Name: </span>
                  <span style={{ color: "#222" }}>{lead.aiExtracted.customerName}</span>
                </div>
              )}
              {lead.aiExtracted.products?.length > 0 && (
                <div style={{ marginBottom: "4px" }}>
                  <span style={{ color: "#555", fontWeight: "600" }}>Products: </span>
                  <span style={{ color: "#222" }}>
                    {lead.aiExtracted.products.map(p => `${p.name}${p.qty ? ` ×${p.qty}` : ""}`).join(", ")}
                  </span>
                </div>
              )}
              {lead.aiExtracted.deliveryAddress && (
                <div style={{ marginBottom: "4px" }}>
                  <span style={{ color: "#555", fontWeight: "600" }}>Address: </span>
                  <span style={{ color: "#222" }}>{lead.aiExtracted.deliveryAddress}</span>
                </div>
              )}
              {lead.aiExtracted.preferredTime && (
                <div style={{ marginBottom: "4px" }}>
                  <span style={{ color: "#555", fontWeight: "600" }}>Time: </span>
                  <span style={{ color: "#222" }}>{lead.aiExtracted.preferredTime}</span>
                </div>
              )}
              {lead.aiExtracted.notes && (
                <div>
                  <span style={{ color: "#555", fontWeight: "600" }}>Notes: </span>
                  <span style={{ color: "#222" }}>{lead.aiExtracted.notes}</span>
                </div>
              )}
            </div>
          )}

          {/* Status selector */}
          <label style={{ fontSize: "12px", fontWeight: "600", color: "#555" }}>Status</label>
          <select
            value={status}
            onChange={(e) => updateStatus(e.target.value)}
            disabled={saving}
            style={{
              display: "block",
              width: "100%",
              marginTop: "4px",
              marginBottom: "14px",
              padding: "9px 12px",
              border: "1.5px solid #e5e7eb",
              borderRadius: "8px",
              fontSize: "13px",
              background: "#fff",
            }}
          >
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="converted">Converted</option>
            <option value="lost">Lost</option>
          </select>

          {/* Notes */}
          {lead.notes && lead.notes.length > 0 && (
            <div style={{ marginBottom: "10px" }}>
              <p style={{ fontSize: "12px", fontWeight: "600", color: "#555", marginBottom: "6px" }}>Notes</p>
              {lead.notes.map((n, i) => (
                <div
                  key={i}
                  style={{
                    background: "#fafafa",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    padding: "8px 10px",
                    fontSize: "13px",
                    marginBottom: "4px",
                    color: "#444",
                  }}
                >
                  {n}
                </div>
              ))}
            </div>
          )}

          <label style={{ fontSize: "12px", fontWeight: "600", color: "#555" }}>Add note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Write a note..."
            rows={2}
            style={{
              display: "block",
              width: "100%",
              marginTop: "4px",
              marginBottom: "8px",
              padding: "9px 12px",
              border: "1.5px solid #e5e7eb",
              borderRadius: "8px",
              fontSize: "13px",
              resize: "vertical",
            }}
          />

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={addNote}
              disabled={saving || !note.trim()}
              style={{
                flex: 1,
                padding: "9px",
                background: "#6366f1",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "600",
              }}
            >
              Save Note
            </button>
            <button
              onClick={() => onCreateOrder(lead)}
              style={{
                flex: 1,
                padding: "9px",
                background: "#f0fdf4",
                color: "#15803d",
                border: "1.5px solid #bbf7d0",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "600",
              }}
            >
              Create Order
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
