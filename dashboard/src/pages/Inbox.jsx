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
  const [fbDmText, setFbDmText] = useState("");
  const [fbDmLoading, setFbDmLoading] = useState(false);
  const [fbDmRecipient, setFbDmRecipient] = useState(null);
  const [igConversations, setIgConversations] = useState([]);
  const [igConvLoading, setIgConvLoading] = useState(false);
  const [selectedIgConv, setSelectedIgConv] = useState(null);
  const [selectedIgConvRecipient, setSelectedIgConvRecipient] = useState(null);
  const [igConvMessages, setIgConvMessages] = useState([]);
  const [igMsgLoading, setIgMsgLoading] = useState(false);
  const [sendMsgText, setSendMsgText] = useState("");
  const [sendMsgLoading, setSendMsgLoading] = useState(false);
  const [waStatus, setWaStatus] = useState(null);
  const [waBanner, setWaBanner] = useState(null);
  const [waConversations, setWaConversations] = useState([]);
  const [waConvLoading, setWaConvLoading] = useState(false);
  const [selectedWaConv, setSelectedWaConv] = useState(null);
  const [waConvMessages, setWaConvMessages] = useState([]);
  const [waMsgLoading, setWaMsgLoading] = useState(false);
  const [waSendText, setWaSendText] = useState("");
  const [waSendLoading, setWaSendLoading] = useState(false);
  const [igPosts, setIgPosts] = useState([]);
  const [igPostsLoading, setIgPostsLoading] = useState(false);
  const [igCommentReplyingTo, setIgCommentReplyingTo] = useState(null);
  const [igCommentReplyText, setIgCommentReplyText] = useState("");
  const [igCommentReplyLoading, setIgCommentReplyLoading] = useState(false);
  const navigate = useNavigate();
  const token = localStorage.getItem("sf_token");
  const email = localStorage.getItem("sf_email");

  const igTabs = igStatus?.instagramId ? ["instagram", "ig-comments"] : [];
  const fbTabs = fbStatus ? ["facebook", "comments"] : [];
  const waTabs = waStatus ? ["whatsapp"] : [];
  const tabs = [...FILTERS, ...igTabs, ...fbTabs, ...waTabs];

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
    const waParam = params.get("whatsapp");
    if (waParam === "connected") {
      setWaBanner({ type: "success", text: "WhatsApp connected successfully!" });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (waParam === "error") {
      setWaBanner({ type: "error", text: params.get("message") || "Failed to connect WhatsApp" });
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
    fetch(`${API_URL}/api/auth/whatsapp/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) setWaStatus(data);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (filter !== "instagram" || !token) return;
    setIgConvLoading(true);
    fetch(`${API_URL}/api/auth/instagram/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setIgConversations(data.data || []))
      .catch(() => setIgConversations([]))
      .finally(() => setIgConvLoading(false));
  }, [filter, token]);

  useEffect(() => {
    if (filter !== "ig-comments" || !token) return;
    setIgPostsLoading(true);
    fetch(`${API_URL}/api/auth/instagram/posts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(async (data) => {
        const posts = data.data || [];
        await Promise.allSettled(posts.map(async (post) => {
          try {
            const r = await fetch(`${API_URL}/api/auth/instagram/posts/${post.id}/comments`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const c = await r.json();
            post.comments = c;
          } catch {
            post.comments = { data: [] };
          }
        }));
        setIgPosts(posts);
      })
      .catch(() => setIgPosts([]))
      .finally(() => setIgPostsLoading(false));
  }, [filter, token]);

  useEffect(() => {
    if (filter !== "whatsapp" || !token) return;
    setWaConvLoading(true);
    fetch(`${API_URL}/api/auth/whatsapp/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setWaConversations(data.data || []))
      .catch(() => setWaConversations([]))
      .finally(() => setWaConvLoading(false));
  }, [filter, token]);

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
    setFbDmRecipient(null);
    setMsgLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/facebook/conversations/${convId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const msgs = data.data || [];
      setConvMessages(msgs);
      // Extract recipient: first message NOT from our page
      const customerMsg = msgs.find((m) => m.from?.id && m.from.id !== fbStatus?.pageId);
      if (customerMsg) setFbDmRecipient(customerMsg.from.id);
    } catch {
      setConvMessages([]);
    } finally {
      setMsgLoading(false);
    }
  }

  async function sendFbDm(convId) {
    if (!fbDmText.trim() || !fbDmRecipient) return;
    setFbDmLoading(true);
    try {
      await fetch(`${API_URL}/api/auth/facebook/conversations/${convId}/reply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: fbDmText.trim(), recipientId: fbDmRecipient }),
      });
      setFbDmText("");
      const res = await fetch(`${API_URL}/api/auth/facebook/conversations/${convId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setConvMessages(data.data || []);
    } catch {
    } finally {
      setFbDmLoading(false);
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

  async function openIgConversation(convId) {
    setSelectedIgConv(convId);
    setSelectedIgConvRecipient(null);
    setIgMsgLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/instagram/conversations/${convId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const msgs = data.data || [];
      setIgConvMessages(msgs);
      // Derive recipientId from the messages — find the first message NOT sent by our IG account
      // This gives us the customer's IGSID (not a PSID from the participants list)
      const customerMsg = msgs.find((m) => m.from?.id && m.from.id !== igStatus?.instagramId);
      if (customerMsg) setSelectedIgConvRecipient(customerMsg.from.id);
    } catch {
      setIgConvMessages([]);
    } finally {
      setIgMsgLoading(false);
    }
  }

  async function sendIgMessage(convId) {
    if (!sendMsgText.trim()) return;
    setSendMsgLoading(true);
    try {
      await fetch(`${API_URL}/api/auth/instagram/conversations/${convId}/reply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: sendMsgText.trim(), recipientId: selectedIgConvRecipient }),
      });
      setSendMsgText("");
      const res = await fetch(`${API_URL}/api/auth/instagram/conversations/${convId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setIgConvMessages(data.data || []);
    } catch {
    } finally {
      setSendMsgLoading(false);
    }
  }

  async function submitIgCommentReply(commentId) {
    if (!igCommentReplyText.trim()) return;
    setIgCommentReplyLoading(true);
    try {
      await fetch(`${API_URL}/api/auth/instagram/comments/${commentId}/reply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: igCommentReplyText.trim() }),
      });
      setIgCommentReplyText("");
      setIgCommentReplyingTo(null);
      // Refresh posts
      const r = await fetch(`${API_URL}/api/auth/instagram/posts`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      const posts = data.data || [];
      await Promise.allSettled(posts.map(async (post) => {
        try {
          const rc = await fetch(`${API_URL}/api/auth/instagram/posts/${post.id}/comments`, { headers: { Authorization: `Bearer ${token}` } });
          post.comments = await rc.json();
        } catch { post.comments = { data: [] }; }
      }));
      setIgPosts(posts);
    } catch {
    } finally {
      setIgCommentReplyLoading(false);
    }
  }

  async function deleteIgComment(commentId) {
    try {
      await fetch(`${API_URL}/api/auth/instagram/comments/${commentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const r = await fetch(`${API_URL}/api/auth/instagram/posts`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      const posts = data.data || [];
      await Promise.allSettled(posts.map(async (post) => {
        try {
          const rc = await fetch(`${API_URL}/api/auth/instagram/posts/${post.id}/comments`, { headers: { Authorization: `Bearer ${token}` } });
          post.comments = await rc.json();
        } catch { post.comments = { data: [] }; }
      }));
      setIgPosts(posts);
    } catch {}
  }

  async function disconnectInstagram() {
    if (!confirm("Disconnect Instagram?")) return;
    try {
      const res = await fetch(`${API_URL}/api/auth/instagram/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setIgStatus(null);
        setIgConversations([]);
        setSelectedIgConv(null); setSelectedIgConvRecipient(null);
        if (filter === "instagram") setFilter("all");
      }
    } catch {}
  }

  async function connectWhatsApp() {
    try {
      const res = await fetch(`${API_URL}/api/auth/whatsapp/url`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { logout(); return; }
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setWaBanner({ type: "error", text: "Failed to start WhatsApp connection" });
    }
  }

  async function openWaConversation(convId) {
    setSelectedWaConv(convId);
    setWaMsgLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/whatsapp/conversations/${convId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setWaConvMessages(data.data || []);
    } catch {
      setWaConvMessages([]);
    } finally {
      setWaMsgLoading(false);
    }
  }

  async function sendWaMessage(convId) {
    if (!waSendText.trim()) return;
    const conv = waConversations.find((c) => c._id === convId);
    if (!conv) return;
    setWaSendLoading(true);
    try {
      await fetch(`${API_URL}/api/auth/whatsapp/conversations/${convId}/reply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: waSendText.trim(), to: conv.contactPhone }),
      });
      setWaSendText("");
      const res = await fetch(`${API_URL}/api/auth/whatsapp/conversations/${convId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setWaConvMessages(data.data || []);
    } catch {
    } finally {
      setWaSendLoading(false);
    }
  }

  async function disconnectWhatsApp() {
    if (!confirm("Disconnect WhatsApp?")) return;
    try {
      const res = await fetch(`${API_URL}/api/auth/whatsapp/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setWaStatus(null);
        setWaConversations([]);
        setSelectedWaConv(null);
        if (filter === "whatsapp") setFilter("all");
      }
    } catch {}
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

  const [confidenceFilter, setConfidenceFilter] = useState("all");

  const statusFiltered = filter === "all" ? leads : leads.filter((l) => l.status === filter);
  const filtered = statusFiltered
    .filter((l) => {
      const c = l.aiExtracted?.confidence || 0;
      if (confidenceFilter === "high") return c >= 0.7;
      if (confidenceFilter === "medium") return c >= 0.4 && c < 0.7;
      if (confidenceFilter === "low") return l.aiExtracted?.processedAt && c < 0.4;
      if (confidenceFilter === "ai") return !!l.aiExtracted?.processedAt;
      return true;
    })
    .sort((a, b) => {
      if (confidenceFilter !== "all") {
        return (b.aiExtracted?.confidence || 0) - (a.aiExtracted?.confidence || 0);
      }
      return 0;
    });

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
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "#059669", fontWeight: "600" }}>
              IG: {igStatus.instagramUsername || igStatus.instagramId || "Connected"}
              <button onClick={disconnectInstagram} style={{ border: "none", background: "none", cursor: "pointer", color: "#dc2626", fontWeight: "bold", fontSize: "14px", padding: "0 2px" }} title="Disconnect Instagram">×</button>
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
          {waStatus ? (
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "#059669", fontWeight: "600" }}>
              WA: {waStatus.displayPhoneNumber || waStatus.phoneNumberId}
              <button onClick={disconnectWhatsApp} style={{ border: "none", background: "none", cursor: "pointer", color: "#dc2626", fontWeight: "bold", fontSize: "14px", padding: "0 2px" }} title="Disconnect WhatsApp">×</button>
            </span>
          ) : (
            <button onClick={connectWhatsApp} style={{ ...tabStyle(false), background: "#f0fdf4", color: "#059669", fontSize: "12px" }}>
              + WA
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

      {waBanner && (
        <div
          style={{
            padding: "10px 16px",
            fontSize: "13px",
            fontWeight: "600",
            background: waBanner.type === "success" ? "#f0fdf4" : "#fef2f2",
            color: waBanner.type === "success" ? "#059669" : "#dc2626",
            borderBottom: `1px solid ${waBanner.type === "success" ? "#bbf7d0" : "#fecaca"}`,
          }}
        >
          {waBanner.text}
          <button onClick={() => setWaBanner(null)} style={{ float: "right", border: "none", background: "none", cursor: "pointer", fontWeight: "bold", color: "inherit" }}>×</button>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "8px", padding: "14px 16px", overflowX: "auto", background: "#fff", borderBottom: "1px solid #f0f0f0" }}>
        {tabs.map((f) => (
          <button key={f} style={tabStyle(filter === f)} onClick={() => { setFilter(f); setSelectedConv(null); setSelectedIgConv(null); setSelectedWaConv(null); setIgCommentReplyingTo(null); }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== "all" && f !== "facebook" && f !== "instagram" && f !== "comments" && f !== "ig-comments" && (
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
              <button onClick={() => { setSelectedConv(null); setFbDmText(""); setFbDmRecipient(null); }} style={{ ...tabStyle(false), marginBottom: "12px", background: "#f3f4f6" }}>← Back</button>
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
              <div style={{ display: "flex", gap: "6px", marginTop: "12px" }}>
                <input
                  value={fbDmText}
                  onChange={(e) => setFbDmText(e.target.value)}
                  placeholder="Type a message..."
                  style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !fbDmLoading) sendFbDm(selectedConv); }}
                />
                <button onClick={() => sendFbDm(selectedConv)} disabled={fbDmLoading || !fbDmText.trim()} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "#2563eb", color: "#fff", fontSize: "13px", cursor: "pointer" }}>
                  {fbDmLoading ? "..." : "Send"}
                </button>
              </div>
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
        ) : filter === "instagram" ? (
          selectedIgConv ? (
            <div>
              <button onClick={() => { setSelectedIgConv(null); setSelectedIgConvRecipient(null); }} style={{ ...tabStyle(false), marginBottom: "12px", background: "#f3f4f6" }}>← Back</button>
              {igMsgLoading ? (
                <p style={{ textAlign: "center", color: "#aaa" }}>Loading messages...</p>
              ) : igConvMessages.length === 0 ? (
                <p style={{ textAlign: "center", color: "#aaa" }}>No messages</p>
              ) : (
                igConvMessages.map((msg) => (
                  <div key={msg.id} style={{ padding: "12px", marginBottom: "8px", borderRadius: "8px", background: msg.from?.id === igStatus?.instagramId ? "#e91e63" : "#fff", color: msg.from?.id === igStatus?.instagramId ? "#fff" : "#333", border: "1px solid #e5e7eb", fontSize: "14px" }}>
                    <div style={{ fontWeight: "600", fontSize: "12px", marginBottom: "4px" }}>@{msg.from?.username || msg.from?.name || "Unknown"}</div>
                    <div>{msg.message || msg.text || <span style={{ color: "#aaa", fontStyle: "italic" }}>Media message</span>}</div>
                    <div style={{ fontSize: "11px", opacity: 0.7, marginTop: "4px" }}>{msg.timestamp ? new Date(msg.timestamp * 1000).toLocaleString() : msg.created_time ? new Date(msg.created_time).toLocaleString() : ""}</div>
                  </div>
                ))
              )}
              <div style={{ display: "flex", gap: "6px", marginTop: "12px" }}>
                <input
                  value={sendMsgText}
                  onChange={(e) => setSendMsgText(e.target.value)}
                  placeholder="Type a message..."
                  style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !sendMsgLoading) sendIgMessage(selectedIgConv); }}
                />
                <button onClick={() => sendIgMessage(selectedIgConv)} disabled={sendMsgLoading || !sendMsgText.trim()} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "#e91e63", color: "#fff", fontSize: "13px", cursor: "pointer" }}>
                  {sendMsgLoading ? "..." : "Send"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              {igConvLoading ? (
                <p style={{ textAlign: "center", color: "#aaa", marginTop: "40px" }}>Loading conversations...</p>
              ) : igConversations.length === 0 ? (
                <div style={{ textAlign: "center", marginTop: "60px" }}><p style={{ fontSize: "40px" }}>📱</p><p style={{ color: "#aaa", marginTop: "12px" }}>No Instagram conversations yet.</p></div>
              ) : (
                igConversations.map((conv) => {
                  const otherParticipant = conv.participants?.data?.find(
                    (p) => p.id !== igStatus?.instagramId
                  ) || conv.participants?.data?.[0];
                  const lastMsg = conv.messages?.data?.[0];
                  const displayName = otherParticipant?.username || lastMsg?.from?.username || "Unknown";
                  return (
                    <div key={conv.id} onClick={() => openIgConversation(conv.id)} style={{ padding: "14px", marginBottom: "8px", borderRadius: "8px", background: "#fff", border: "1px solid #e5e7eb", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: "600", fontSize: "14px", color: "#333" }}>@{displayName}</div>
                        <div style={{ fontSize: "12px", color: "#999", marginTop: "2px", maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lastMsg?.message || "Tap to view"}</div>
                      </div>
                      <div style={{ fontSize: "11px", color: "#aaa" }}>{conv.updated_time ? new Date(conv.updated_time).toLocaleDateString() : ""}</div>
                    </div>
                  );
                })
              )}
            </div>
          )
        ) : filter === "whatsapp" ? (
          selectedWaConv ? (
            <div>
              <button onClick={() => setSelectedWaConv(null)} style={{ ...tabStyle(false), marginBottom: "12px", background: "#f3f4f6" }}>← Back</button>
              {waMsgLoading ? (
                <p style={{ textAlign: "center", color: "#aaa" }}>Loading messages...</p>
              ) : waConvMessages.length === 0 ? (
                <p style={{ textAlign: "center", color: "#aaa" }}>No messages</p>
              ) : (
                waConvMessages.map((msg) => (
                  <div key={msg._id} style={{ padding: "12px", marginBottom: "8px", borderRadius: "8px", background: msg.direction === "outbound" ? "#059669" : "#fff", color: msg.direction === "outbound" ? "#fff" : "#333", border: "1px solid #e5e7eb", fontSize: "14px" }}>
                    <div style={{ fontWeight: "600", fontSize: "12px", marginBottom: "4px" }}>{msg.direction === "outbound" ? "You" : "Contact"}</div>
                    <div>{msg.text}</div>
                    <div style={{ fontSize: "11px", opacity: 0.7, marginTop: "4px" }}>{msg.timestamp ? new Date(msg.timestamp).toLocaleString() : ""}</div>
                  </div>
                ))
              )}
              <div style={{ display: "flex", gap: "6px", marginTop: "12px" }}>
                <input
                  value={waSendText}
                  onChange={(e) => setWaSendText(e.target.value)}
                  placeholder="Type a message..."
                  style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !waSendLoading) sendWaMessage(selectedWaConv); }}
                />
                <button onClick={() => sendWaMessage(selectedWaConv)} disabled={waSendLoading || !waSendText.trim()} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "#059669", color: "#fff", fontSize: "13px", cursor: "pointer" }}>
                  {waSendLoading ? "..." : "Send"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              {waConvLoading ? (
                <p style={{ textAlign: "center", color: "#aaa", marginTop: "40px" }}>Loading conversations...</p>
              ) : waConversations.length === 0 ? (
                <div style={{ textAlign: "center", marginTop: "60px" }}><p style={{ fontSize: "40px" }}>💬</p><p style={{ color: "#aaa", marginTop: "12px" }}>No WhatsApp conversations yet. Inbound messages will appear via webhook.</p></div>
              ) : (
                waConversations.map((conv) => (
                  <div key={conv._id} onClick={() => openWaConversation(conv._id)} style={{ padding: "14px", marginBottom: "8px", borderRadius: "8px", background: "#fff", border: "1px solid #e5e7eb", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: "600", fontSize: "14px", color: "#333" }}>{conv.contactName || conv.contactPhone}</div>
                      <div style={{ fontSize: "12px", color: "#999", marginTop: "2px", maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.lastMessage || "Tap to view"}</div>
                    </div>
                    <div style={{ fontSize: "11px", color: "#aaa" }}>{conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleDateString() : ""}</div>
                  </div>
                ))
              )}
            </div>
          )
        ) : filter === "ig-comments" ? (
          <div>
            {igPostsLoading ? (
              <p style={{ textAlign: "center", color: "#aaa", marginTop: "40px" }}>Loading posts...</p>
            ) : igPosts.length === 0 ? (
              <div style={{ textAlign: "center", marginTop: "60px" }}><p style={{ fontSize: "40px" }}>📸</p><p style={{ color: "#aaa", marginTop: "12px" }}>No Instagram posts found.</p></div>
            ) : (
              igPosts.map((post) => (
                <div key={post.id} style={{ marginBottom: "16px", background: "#fff", borderRadius: "8px", border: "1px solid #e5e7eb", padding: "14px" }}>
                  <div style={{ fontWeight: "600", fontSize: "14px", marginBottom: "4px" }}>{post.caption || "(no caption)"}</div>
                  <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "12px" }}>
                    {post.media_type} · {post.timestamp ? new Date(post.timestamp).toLocaleString() : ""}
                  </div>
                  {post.comments?.data?.length > 0 ? (
                    post.comments.data.map((c) => (
                      <div key={c.id} style={{ padding: "10px", marginBottom: "8px", background: "#fdf2f8", borderRadius: "6px", border: "1px solid #fbcfe8" }}>
                        <div style={{ fontWeight: "600", fontSize: "12px", color: "#9d174d", marginBottom: "2px" }}>@{c.username || "unknown"}</div>
                        <div style={{ fontSize: "13px" }}>{c.text}</div>
                        <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>{c.timestamp ? new Date(c.timestamp).toLocaleString() : ""}</div>
                        {c.replies?.data?.length > 0 && (
                          <div style={{ marginTop: "6px", paddingLeft: "10px", borderLeft: "2px solid #fbcfe8" }}>
                            {c.replies.data.map((r) => (
                              <div key={r.id} style={{ fontSize: "12px", color: "#555", marginBottom: "4px" }}>
                                <span style={{ fontWeight: "600" }}>@{r.username}: </span>{r.text}
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                          {igCommentReplyingTo === c.id ? (
                            <div style={{ display: "flex", gap: "6px", width: "100%" }}>
                              <input
                                value={igCommentReplyText}
                                onChange={(e) => setIgCommentReplyText(e.target.value)}
                                placeholder="Type reply..."
                                style={{ flex: 1, padding: "6px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "12px" }}
                                autoFocus
                              />
                              <button onClick={() => submitIgCommentReply(c.id)} disabled={igCommentReplyLoading} style={{ padding: "6px 12px", borderRadius: "6px", border: "none", background: "#e91e63", color: "#fff", fontSize: "12px", cursor: "pointer" }}>
                                {igCommentReplyLoading ? "..." : "Send"}
                              </button>
                              <button onClick={() => { setIgCommentReplyingTo(null); setIgCommentReplyText(""); }} style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #d1d5db", background: "#fff", fontSize: "12px", cursor: "pointer" }}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button onClick={() => setIgCommentReplyingTo(c.id)} style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #e91e63", background: "#fff", color: "#e91e63", fontSize: "11px", cursor: "pointer" }}>Reply</button>
                              <button onClick={() => deleteIgComment(c.id)} style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #dc2626", background: "#fff", color: "#dc2626", fontSize: "11px", cursor: "pointer" }}>Delete</button>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: "12px", color: "#aaa" }}>No comments on this post.</p>
                  )}
                </div>
              ))
            )}
          </div>
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
            <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "#999", fontWeight: "600" }}>AI:</span>
              {[
                { key: "all", label: "All" },
                { key: "ai", label: "AI Processed" },
                { key: "high", label: "High", color: "#16a34a" },
                { key: "medium", label: "Medium", color: "#d97706" },
                { key: "low", label: "Low", color: "#dc2626" },
              ].map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => setConfidenceFilter(key)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "20px",
                    border: confidenceFilter === key ? "none" : "1px solid #e5e7eb",
                    background: confidenceFilter === key ? (color || "#6366f1") : "#fff",
                    color: confidenceFilter === key ? "#fff" : (color || "#555"),
                    fontSize: "11px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
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
