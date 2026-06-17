import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import OrderForm from "../components/OrderForm.jsx";
import { API_URL } from "../config.js";

const STATUS_STYLES = {
  pending: { bg: "#fffbeb", text: "#b45309", label: "Pending" },
  confirmed: { bg: "#eff6ff", text: "#1d4ed8", label: "Confirmed" },
  delivered: { bg: "#f0fdf4", text: "#15803d", label: "Delivered" },
  cancelled: { bg: "#f3f4f6", text: "#6b7280", label: "Cancelled" },
};

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const navigate = useNavigate();
  const token = localStorage.getItem("sf_token");

  async function fetchAll() {
    try {
      const [ordersRes, leadsRes] = await Promise.all([
        fetch(`${API_URL}/api/orders`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/leads`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (ordersRes.status === 401) { logout(); return; }
      const [ordersData, leadsData] = await Promise.all([ordersRes.json(), leadsRes.json()]);
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setLeads(Array.isArray(leadsData) ? leadsData : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  function logout() {
    localStorage.removeItem("sf_token");
    localStorage.removeItem("sf_email");
    navigate("/login");
  }

  async function updateStatus(orderId, status) {
    const res = await fetch(`${API_URL}/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setOrders((prev) => prev.map((o) => (o._id === updated._id ? updated : o)));
    }
  }

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

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa" }}>
      <div style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={() => navigate("/inbox")}
            style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#6366f1" }}
          >
            ←
          </button>
          <span style={{ fontWeight: "800", fontSize: "18px", color: "#1a1a1a" }}>Orders</span>
        </div>
        <button
          onClick={() => setShowNewOrder(true)}
          style={{
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            padding: "9px 16px",
            fontSize: "13px",
            fontWeight: "700",
          }}
        >
          + New Order
        </button>
      </div>

      <div style={{ padding: "16px", maxWidth: "640px", margin: "0 auto" }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "#aaa", marginTop: "40px" }}>Loading orders...</p>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: "center", marginTop: "60px" }}>
            <p style={{ fontSize: "40px" }}>📦</p>
            <p style={{ color: "#aaa", marginTop: "12px" }}>No orders yet. Create one from a lead card.</p>
          </div>
        ) : (
          orders.map((order) => {
            const stat = STATUS_STYLES[order.status] || STATUS_STYLES.pending;
            const customerName = order.leadId?.username || "Unknown";
            const platform = order.leadId?.platform || "";

            return (
              <div
                key={order._id}
                style={{
                  background: "#fff",
                  borderRadius: "12px",
                  border: "1.5px solid #f0f0f0",
                  padding: "16px",
                  marginBottom: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: "700", fontSize: "15px" }}>{customerName}</div>
                    <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
                      {platform && (
                        <span
                          style={{
                            background: platform === "instagram"
                              ? "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)"
                              : "#25d366",
                            color: "#fff",
                            borderRadius: "4px",
                            padding: "1px 6px",
                            fontSize: "10px",
                            fontWeight: "700",
                            marginRight: "6px",
                          }}
                        >
                          {platform === "instagram" ? "IG" : "WA"}
                        </span>
                      )}
                      {new Date(order.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div
                    style={{
                      background: stat.bg,
                      color: stat.text,
                      borderRadius: "20px",
                      padding: "3px 10px",
                      fontSize: "11px",
                      fontWeight: "700",
                    }}
                  >
                    {stat.label}
                  </div>
                </div>

                <div
                  style={{
                    background: "#f8f9fa",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    marginTop: "12px",
                    fontSize: "13px",
                  }}
                >
                  <div style={{ fontWeight: "600" }}>{order.productName}</div>
                  <div style={{ color: "#666", marginTop: "2px" }}>
                    Qty: {order.quantity} · NPR {order.price.toLocaleString()}
                  </div>
                  {order.deliveryAddress && (
                    <div style={{ color: "#888", marginTop: "2px", fontSize: "12px" }}>
                      📍 {order.deliveryAddress}
                    </div>
                  )}
                  {order.notes && (
                    <div style={{ color: "#888", marginTop: "2px", fontSize: "12px" }}>
                      📝 {order.notes}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: "12px" }}>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#555", display: "block", marginBottom: "4px" }}>
                    Update Status
                  </label>
                  <select
                    value={order.status}
                    onChange={(e) => updateStatus(order._id, e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1.5px solid #e5e7eb",
                      borderRadius: "8px",
                      fontSize: "13px",
                      background: "#fff",
                    }}
                  >
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showNewOrder && (
        <OrderForm
          leads={leads}
          token={token}
          prefillLeadId={null}
          onClose={() => setShowNewOrder(false)}
          onCreated={(order) => setOrders((prev) => [order, ...prev])}
        />
      )}
    </div>
  );
}
