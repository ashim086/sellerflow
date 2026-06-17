const API_URL = "http://localhost:8080";
const DASHBOARD_URL = "http://localhost:5173";

const loginView = document.getElementById("login-view");
const connectedView = document.getElementById("connected-view");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const dashboardBtn = document.getElementById("dashboard-btn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginError = document.getElementById("login-error");
const userEmailDisplay = document.getElementById("user-email-display");

function showError(msg) {
  loginError.textContent = msg;
  loginError.style.display = "block";
}

function clearError() {
  loginError.style.display = "none";
}

function showConnected(email) {
  userEmailDisplay.textContent = `Connected as ${email}`;
  loginView.style.display = "none";
  connectedView.style.display = "block";
}

function showLogin() {
  loginView.style.display = "block";
  connectedView.style.display = "none";
}

// Check if already logged in on popup open
chrome.storage.local.get(["jwt", "userEmail"], (result) => {
  if (result.jwt && result.userEmail) {
    showConnected(result.userEmail);
  }
});

loginBtn.addEventListener("click", async () => {
  clearError();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showError("Please enter email and password.");
    return;
  }

  loginBtn.textContent = "Logging in...";
  loginBtn.disabled = true;

  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error || "Login failed.");
      return;
    }

    chrome.storage.local.set({ jwt: data.token, userEmail: data.email }, () => {
      showConnected(data.email);
    });
  } catch (err) {
    showError("Cannot reach server. Is the backend running?");
  } finally {
    loginBtn.textContent = "Login";
    loginBtn.disabled = false;
  }
});

// Allow Enter key to submit
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loginBtn.click();
});

logoutBtn.addEventListener("click", () => {
  chrome.storage.local.remove(["jwt", "userEmail"], () => {
    emailInput.value = "";
    passwordInput.value = "";
    showLogin();
  });
});

dashboardBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: DASHBOARD_URL });
});
