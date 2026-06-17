import { API_URL } from "../config.js";

export default function OrderForm({ leads, token, prefillLeadId, onClose, onCreated }) {
  async function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      leadId: fd.get("leadId"),
      productName: fd.get("productName"),
      quantity: Number(fd.get("quantity")),
      price: Number(fd.get("price")),
      deliveryAddress: fd.get("deliveryAddress"),
      notes: fd.get("notes"),
    };

    const res = await fetch(`${API_URL}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const order = await res.json();
      onCreated(order);
      onClose();
    }
  }

  const overlayStyle = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000, padding: "16px",
  };
  const modalStyle = {
    background: "#fff", borderRadius: "16px", padding: "24px",
    width: "100%", maxWidth: "440px", maxHeight: "90vh", overflowY: "auto",
  };
  const labelStyle = { display: "block", fontSize: "12px", fontWeight: "600", color: "#555", marginBottom: "5px" };
  const inputStyle = {
    width: "100%", padding: "9px 12px", border: "1.5px solid #e5e7eb",
    borderRadius: "8px", fontSize: "13px", marginBottom: "12px",
  };

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: "700" }}>New Order</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "20px", color: "#aaa" }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>Customer</label>
          <select name="leadId" defaultValue={prefillLeadId || ""} required style={inputStyle}>
            <option value="" disabled>Select customer...</option>
            {leads.map((l) => (
              <option key={l._id} value={l._id}>
                {l.username} ({l.platform})
              </option>
            ))}
          </select>

          <label style={labelStyle}>Product Name</label>
          <input name="productName" placeholder="e.g. Pashmina Shawl" required style={inputStyle} />

          <div style={{ display: "flex", gap: "10px" }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Quantity</label>
              <input name="quantity" type="number" min="1" defaultValue="1" required style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Price (NPR)</label>
              <input name="price" type="number" min="0" step="0.01" placeholder="0" required style={inputStyle} />
            </div>
          </div>

          <label style={labelStyle}>Delivery Address</label>
          <input name="deliveryAddress" placeholder="Kathmandu, Nepal" style={inputStyle} />

          <label style={labelStyle}>Notes</label>
          <textarea
            name="notes"
            placeholder="Special instructions..."
            rows={2}
            style={{ ...inputStyle, resize: "vertical" }}
          />

          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: "11px", background: "#f3f4f6",
                color: "#374151", border: "none", borderRadius: "8px",
                fontSize: "14px", fontWeight: "600",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                flex: 1, padding: "11px",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                color: "#fff", border: "none", borderRadius: "8px",
                fontSize: "14px", fontWeight: "600",
              }}
            >
              Create Order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
