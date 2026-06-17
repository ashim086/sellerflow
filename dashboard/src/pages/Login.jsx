import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config.js";

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #f0f0ff 0%, #fdf2f8 100%)",
    padding: "16px",
  },
  card: {
    background: "#fff",
    borderRadius: "16px",
    padding: "36px 32px",
    width: "100%",
    maxWidth: "380px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
  },
  logo: {
    textAlign: "center",
    marginBottom: "28px",
  },
  logoTitle: { fontSize: "26px", fontWeight: "800", color: "#6366f1", letterSpacing: "-0.5px" },
  logoSub: { fontSize: "13px", color: "#888", marginTop: "4px" },
  label: { display: "block", fontSize: "13px", fontWeight: "600", color: "#555", marginBottom: "6px" },
  input: {
    width: "100%",
    padding: "11px 14px",
    border: "1.5px solid #e5e7eb",
    borderRadius: "10px",
    fontSize: "14px",
    outline: "none",
    marginBottom: "14px",
    transition: "border-color 0.2s",
  },
  btn: {
    width: "100%",
    padding: "12px",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "white",
    border: "none",
    borderRadius: "10px",
    fontSize: "15px",
    fontWeight: "700",
    marginTop: "4px",
  },
  error: { color: "#dc2626", fontSize: "13px", marginTop: "10px", textAlign: "center" },
  register: { textAlign: "center", marginTop: "14px", fontSize: "13px", color: "#888" },
  registerLink: { color: "#6366f1", fontWeight: "600", cursor: "pointer", background: "none", border: "none", fontSize: "13px" },
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("login"); // "login" | "register"
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");

      localStorage.setItem("sf_token", data.token);
      localStorage.setItem("sf_email", data.email);
      navigate("/inbox");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <div style={styles.logoTitle}>SellerFlow</div>
          <div style={styles.logoSub}>Instagram & WhatsApp CRM</div>
        </div>
        <form onSubmit={handleSubmit}>
          <label style={styles.label}>Email</label>
          <input
            style={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
          <label style={styles.label}>Password</label>
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Login" : "Create Account"}
          </button>
          {error && <p style={styles.error}>{error}</p>}
        </form>
        <div style={styles.register}>
          {mode === "login" ? "No account? " : "Have an account? "}
          <button style={styles.registerLink} onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
            {mode === "login" ? "Register" : "Login"}
          </button>
        </div>
      </div>
    </div>
  );
}
