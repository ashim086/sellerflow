import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import LeadCard from "../components/LeadCard.jsx";
import OrderForm from "../components/OrderForm.jsx";
import { API_URL } from "../config.js";
const FILTERS = ["all", "new", "contacted", "converted", "lost"];

export default function Inbox() {
  const [leads, setLeads] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [orderModal, setOrderModal] = useState(null);
  const [igStatus, setIgStatus] = useState(null);
  const [fbStatus, setFbStatus] = useState(null);
  const [igBanner, setIgBanner] = useState(null);
  const [fbBanner, setFbBanner] = useState(null);
  const [fbConversations, setFbConversations] = useState([]);
  const [fbConvLoading, setFbConvLoading] = useState(false);
  const [selectedConv, setSelectedConv] = useState(null);
  const [convMessages, setConvMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [fbPosts, setFbPosts] = useState([]);
  const [fbPostsLoading, setFbPostsLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);
  const navigate = useNavigate();
  const token = localStorage.getItem("sf_token");
  const email = localStorage.getItem("sf_email");

  const fbTabs = fbStatus ? ["facebook", "comments"] : [];
  const tabs = [...FILTERS, ...fbTabs];

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/leads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { logout(); return; }
      const data = await res.json();
      setLeads(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchLeads();
    const interval = setInterval(fetchLeads, 30000);
    return () => clearInterval(interval);
  }, [fetchLeads]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const igParam = params.get("instagram");
    if (igParam === "connected") {
      setIgBanner({ type: "success", text: "Instagram connected successfully!" });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (igParam === "error") {
      setIgBanner({ type: "error", text: params.get("message") || "Failed to connect Instagram" });
      window.history.replaceState({}, "", window.location.pathname);
    }
    const fbParam = params.get("facebook");
    if (fbParam === "connected") {
      setFbBanner({ type: "success", text: "Facebook Page connected successfully!" });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (fbParam === "error") {
      setFbBanner({ type: "error", text: params.get("message") || "Failed to connect Facebook Page" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/auth/instagram/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) setIgStatus(data);
      })
      .catch(() => {});
    fetch(`${API_URL}/api/auth/facebook/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) setFbStatus(data);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (filter !== "facebook" || !token) return;
    setFbConvLoading(true);
    fetch(`${API_URL}/api/auth/facebook/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setFbConversations(data.data || []))
      .catch(() => {})
      .finally(() => setFbConvLoading(false));
  }, [filter, token]);

  useEffect(() => {
    if (filter !== "comments" || !token) return;
    setFbPostsLoading(true);
    fetch(`${API_URL}/api/auth/facebook/posts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setFbPosts(data.data || []))
      .catch(() => {})
      .finally(() => setFbPostsLoading(false));
  }, [filter, token]);

  async function openConversation(convId) {
    setSelectedConv(convId);
    setMsgLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/facebook/conversations/${convId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setConvMessages(data.data || []);
    } catch {
      setConvMessages([]);
    } finally {
      setMsgLoading(false);
    }
  }

  async function submitReply(commentId) {
    if (!replyText.trim()) return;
    setReplyLoading(true);
    try {
      await fetch(`${API_URL}/api/auth/facebook/comments/${commentId}/reply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyText.trim() }),
      });
      setReplyText("");
      setReplyingTo(null);
      // Refresh posts to show the reply
      const res = await fetch(`${API_URL}/api/auth/facebook/posts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setFbPosts(data.data || []);
    } catch {
    } finally {
      setReplyLoading(false);
    }
  }

  async function deleteComment(commentId) {
    try {
      await fetch(`${API_URL}/api/auth/facebook/comments/${commentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await fetch(`${API_URL}/api/auth/facebook/posts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setFbPosts(data.data || []);
    } catch {}
  }

  async function connectInstagram() {
    try {
      const res = await fetch(`${API_URL}/api/auth/instagram/url`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { logout(); return; }
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setIgBanner({ type: "error", text: "Failed to start Instagram connection" });
    }
  }

  async function connectFacebook() {
    try {
      const res = await fetch(`${API_URL}/api/auth/facebook/url`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { logout(); return; }
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setFbBanner({ type: "error", text: "Failed to start Facebook connection" });
    }
  }

  async function disconnectFacebook() {
    if (!confirm("Disconnect Facebook Page?")) return;
    try {
      const res = await fetch(`${API_URL}/api/auth/facebook/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setFbStatus(null);
        setFbConversations([]);
        setFbPosts([]);
        setSelectedConv(null);
        if (filter === "facebook" || filter === "comments") setFilter("all");
      }
    } catch {}
  }

  function logout() {
    localStorage.removeItem("sf_token");
    localStorage.removeItem("sf_email");
    navigate("/login");
  }

  function handleUpdate(updated) {
    setLeads((prev) => prev.map((l) => (l._id === updated._id ? updated : l)));
  }

  const filtered = filter === "all" ? leads : leads.filter((l) => l.status === filter);

  const headerStyle = {
    background: "#fff",
    borderBottom: "1px solid #f0f0f0",
    padding: "14px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    position: "sticky",
    top: 0,
    zIndex: 100,
  };

  const tabStyle = (active) => ({
    padding: "7px 14px",
    borderRadius: "20px",
    border: "none",
    background: active ? "#6366f1" : "#f3f4f6",
    color: active ? "#fff" : "#555",
    fontSize: "13px",
    fontWeight: "600",
    whiteSpace: "nowrap",
    cursor: "pointer",
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa" }}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <span style={{ fontWeight: "800", fontSize: "18px", color: "#6366f1" }}>SellerFlow</span>
          <span style={{ fontSize: "12px", color: "#aaa", marginLeft: "8px" }}>{email}</span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {igStatus ? (
            <span style={{ fontSize: "12px", color: "#059669", fontWeight: "600" }}>
              IG: {igStatus.instagramUsername}
            </span>
          ) : (
            <button onClick={connectInstagram} style={{ ...tabStyle(false), background: "#f0fdf4", color: "#16a34a", fontSize: "12px" }}>
              + IG
            </button>
          )}
          {fbStatus ? (
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "#2563eb", fontWeight: "600" }}>
              FB: {fbStatus.pageName}
              <button onClick={disconnectFacebook} style={{ border: "none", background: "none", cursor: "pointer", color: "#dc2626", fontWeight: "bold", fontSize: "14px", padding: "0 2px" }} title="Disconnect Facebook Page">×</button>
            </span>
          ) : (
            <button onClick={connectFacebook} style={{ ...tabStyle(false), background: "#eff6ff", color: "#2563eb", fontSize: "12px" }}>
              + FB Page
            </button>
          )}
          <button
            onClick={() => navigate("/orders")}
            style={{ ...tabStyle(false), background: "#eff6ff", color: "#3b82f6" }}
          >
            Orders
          </button>
          <button onClick={logout} style={{ ...tabStyle(false), background: "#fee2e2", color: "#dc2626" }}>
            Logout
          </button>
        </div>
      </div>

      {igBanner && (
        <div
          style={{
            padding: "10px 16px",
            fontSize: "13px",
            fontWeight: "600",
            background: igBanner.type === "success" ? "#f0fdf4" : "#fef2f2",
            color: igBanner.type === "success" ? "#059669" : "#dc2626",
            borderBottom: `1px solid ${igBanner.type === "success" ? "#bbf7d0" : "#fecaca"}`,
          }}
        >
          {igBanner.text}
          <button onClick={() => setIgBanner(null)} style={{ float: "right", border: "none", background: "none", cursor: "pointer", fontWeight: "bold", color: "inherit" }}>×</button>
        </div>
      )}

      {fbBanner && (
        <div
          style={{
            padding: "10px 16px",
            fontSize: "13px",
            fontWeight: "600",
            background: fbBanner.type === "success" ? "#eff6ff" : "#fef2f2",
            color: fbBanner.type === "success" ? "#2563eb" : "#dc2626",
            borderBottom: `1px solid ${fbBanner.type === "success" ? "#93c5fd" : "#fecaca"}`,
          }}
        >
          {fbBanner.text}
          <button onClick={() => setFbBanner(null)} style={{ float: "right", border: "none", background: "none", cursor: "pointer", fontWeight: "bold", color: "inherit" }}>×</button>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "8px", padding: "14px 16px", overflowX: "auto", background: "#fff", borderBottom: "1px solid #f0f0f0" }}>
        {tabs.map((f) => (
          <button key={f} style={tabStyle(filter === f)} onClick={() => { setFilter(f); setSelectedConv(null); }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== "all" && f !== "facebook" && f !== "comments" && (
              <span style={{ marginLeft: "4px", opacity: 0.7 }}>({leads.filter((l) => l.status === f).length})</span>
            )}
            {f === "all" && <span style={{ marginLeft: "4px", opacity: 0.7 }}>({leads.length})</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "16px", maxWidth: "640px", margin: "0 auto" }}>
        {filter === "facebook" ? (
          selectedConv ? (
            <div>
              <button onClick={() => setSelectedConv(null)} style={{ ...tabStyle(false), marginBottom: "12px", background: "#f3f4f6" }}>← Back</button>
              {msgLoading ? (
                <p style={{ textAlign: "center", color: "#aaa" }}>Loading messages...</p>
              ) : convMessages.length === 0 ? (
                <p style={{ textAlign: "center", color: "#aaa" }}>No messages</p>
              ) : (
                convMessages.map((msg) => (
                  <div key={msg.id} style={{ padding: "12px", marginBottom: "8px", borderRadius: "8px", background: msg.from?.id === fbStatus?.pageId ? "#2563eb" : "#fff", color: msg.from?.id === fbStatus?.pageId ? "#fff" : "#333", border: "1px solid #e5e7eb", fontSize: "14px" }}>
                    <div style={{ fontWeight: "600", fontSize: "12px", marginBottom: "4px" }}>{msg.from?.name || "Unknown"}</div>
                    <div>{msg.message}</div>
                    <div style={{ fontSize: "11px", opacity: 0.7, marginTop: "4px" }}>{msg.created_time ? new Date(msg.created_time).toLocaleString() : ""}</div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div>
              {fbConvLoading ? (
                <p style={{ textAlign: "center", color: "#aaa", marginTop: "40px" }}>Loading conversations...</p>
              ) : fbConversations.length === 0 ? (
                <div style={{ textAlign: "center", marginTop: "60px" }}><p style={{ fontSize: "40px" }}>💬</p><p style={{ color: "#aaa", marginTop: "12px" }}>No Facebook conversations yet.</p></div>
              ) : (
                fbConversations.map((conv) => (
                  <div key={conv.id} onClick={() => openConversation(conv.id)} style={{ padding: "14px", marginBottom: "8px", borderRadius: "8px", background: "#fff", border: "1px solid #e5e7eb", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: "600", fontSize: "14px", color: "#333" }}>{conv.senders?.data?.[0]?.name || conv.id}</div>
                      <div style={{ fontSize: "12px", color: "#999", marginTop: "2px" }}>{conv.message_count || 0} messages</div>
                    </div>
                    <div style={{ fontSize: "11px", color: "#aaa" }}>{conv.updated_time ? new Date(conv.updated_time).toLocaleDateString() : ""}</div>
                  </div>
                ))
              )}
            </div>
          )
        ) : filter === "comments" ? (
          <div>
            {fbPostsLoading ? (
              <p style={{ textAlign: "center", color: "#aaa", marginTop: "40px" }}>Loading posts...</p>
            ) : fbPosts.length === 0 ? (
              <div style={{ textAlign: "center", marginTop: "60px" }}><p style={{ fontSize: "40px" }}>📝</p><p style={{ color: "#aaa", marginTop: "12px" }}>No posts with comments yet.</p></div>
            ) : (
              fbPosts.map((post) => (
                <div key={post.id} style={{ marginBottom: "16px", background: "#fff", borderRadius: "8px", border: "1px solid #e5e7eb", padding: "14px" }}>
                  <div style={{ fontWeight: "600", fontSize: "14px", marginBottom: "8px" }}>{post.message || "(no text)"}</div>
                  <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "12px" }}>{post.created_time ? new Date(post.created_time).toLocaleString() : ""}</div>
                  {post.comments?.data?.length > 0 ? (
                    post.comments.data.map((c) => (
                      <div key={c.id} style={{ padding: "10px", marginBottom: "8px", background: "#f8f9fa", borderRadius: "6px", border: "1px solid #e5e7eb" }}>
                        <div style={{ fontWeight: "600", fontSize: "12px", color: "#555", marginBottom: "2px" }}>{c.from?.name || "Unknown"}</div>
                        <div style={{ fontSize: "13px" }}>{c.message}</div>
                        <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>{c.created_time ? new Date(c.created_time).toLocaleString() : ""}</div>
                        <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                          {replyingTo === c.id ? (
                            <div style={{ display: "flex", gap: "6px", width: "100%" }}>
                              <input
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                placeholder="Type reply..."
                                style={{ flex: 1, padding: "6px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "12px" }}
                                autoFocus
                              />
                              <button onClick={() => submitReply(c.id)} disabled={replyLoading} style={{ padding: "6px 12px", borderRadius: "6px", border: "none", background: "#2563eb", color: "#fff", fontSize: "12px", cursor: "pointer" }}>
                                {replyLoading ? "..." : "Send"}
                              </button>
                              <button onClick={() => { setReplyingTo(null); setReplyText(""); }} style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #d1d5db", background: "#fff", fontSize: "12px", cursor: "pointer" }}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button onClick={() => setReplyingTo(c.id)} style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #2563eb", background: "#fff", color: "#2563eb", fontSize: "11px", cursor: "pointer" }}>Reply</button>
                              <button onClick={() => deleteComment(c.id)} style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #dc2626", background: "#fff", color: "#dc2626", fontSize: "11px", cursor: "pointer" }}>Delete</button>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  ) : post.comments?.error ? (
                    <p style={{ fontSize: "12px", color: "#d97706" }}>{post.comments.error}</p>
                  ) : (
                    <p style={{ fontSize: "12px", color: "#aaa" }}>No comments on this post.</p>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <>
            {loading ? (
              <p style={{ textAlign: "center", color: "#aaa", marginTop: "40px" }}>Loading leads...</p>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", marginTop: "60px" }}>
                <p style={{ fontSize: "40px" }}>📭</p>
                <p style={{ color: "#aaa", marginTop: "12px" }}>
                  {filter === "all" ? "No leads yet. Use the extension to save your first lead!" : `No ${filter} leads.`}
                </p>
              </div>
            ) : (
              filtered.map((lead) => (
                <LeadCard key={lead._id} lead={lead} token={token} onUpdate={handleUpdate} onCreateOrder={(l) => setOrderModal(l)} />
              ))
            )}
          </>
        )}
      </div>

      {orderModal && (
        <OrderForm leads={leads} token={token} prefillLeadId={orderModal._id} onClose={() => setOrderModal(null)} onCreated={() => {}} />
      )}
    </div>
  );
}
