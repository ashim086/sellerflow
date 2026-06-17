// WhatsApp Web content script

const BUTTON_ID = "sellerflow-wa-btn";
const PICKER_ID = "sellerflow-picker";

const KEYWORDS = [
  "stock", "price", "order", "buy", "cost", "available", "deliver",
  "kati", "paisa", "rs", "rupee", "dinu", "chahiyo", "kinnu",
  "maal", "rate", "discount", "offer", "deal",
];

function showToast(message, isError = false) {
  const existing = document.getElementById("sellerflow-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "sellerflow-toast";
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    background: ${isError ? "#ef4444" : "#25d366"}; color: white;
    padding: 10px 20px; border-radius: 20px; font-size: 14px; font-weight: 600;
    z-index: 9999999; box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: opacity 0.3s;
  `;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); }, 2500);
}

function getContactName() {
  const selectors = [
    '[data-testid="conversation-info-header-chat-title"]',
    'header span[title]',
    '#main header span[dir="auto"]',
    'div[role="banner"] span[dir="auto"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim()) return el.textContent.trim();
  }
  return "Unknown Contact";
}

function getMessagesList() {
  // Try strategies in order — WhatsApp obfuscates class names so we cast a wide net
  const strategies = [
    () => document.querySelectorAll('#main .copyable-text'),
    () => document.querySelectorAll('#main [data-testid="msg-container"]'),
    () => document.querySelectorAll('#main span.selectable-text'),
  ];

  let items = [];
  for (const fn of strategies) {
    const els = Array.from(fn());
    if (els.length === 0) continue;

    items = els.map(el => {
      // Try to find the text span inside, fall back to full element text
      const textEl = el.querySelector('span[dir="ltr"], span[dir="auto"], span.selectable-text');
      const text = (textEl || el).textContent.trim();

      // Heuristic: outgoing messages are right-aligned or inside .message-out
      const isMe = el.closest('[class*="message-out"]') !== null ||
        el.closest('[data-testid="msg-container"]')?.closest('[class*="out"]') !== null;

      return { text, isMe };
    })
    .filter(({ text }) =>
      text.length > 1 &&
      text.length < 600 &&
      !text.match(/^\d{1,2}:\d{2}$/) &&
      !text.match(/^https?:\/\//)
    );

    if (items.length > 0) break;
  }

  // Deduplicate consecutive same texts
  const deduped = [];
  for (const item of items) {
    if (deduped.length === 0 || deduped[deduped.length - 1].text !== item.text) {
      deduped.push(item);
    }
  }
  return deduped.slice(-12); // last 12 messages
}

function hasKeywords(messages) {
  return messages.some(({ text }) => {
    const lower = text.toLowerCase();
    return KEYWORDS.some(kw => lower.includes(kw));
  });
}

function closePicker() {
  const el = document.getElementById(PICKER_ID);
  if (el) el.remove();
}

function openPicker(username, onSave) {
  closePicker();
  const messages = getMessagesList();

  const overlay = document.createElement("div");
  overlay.id = PICKER_ID;
  overlay.style.cssText = `
    position: fixed; bottom: 70px; right: 16px; width: 340px;
    background: #fff; border-radius: 16px; z-index: 9999998;
    box-shadow: 0 8px 32px rgba(0,0,0,0.22); overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  // Header
  const header = document.createElement("div");
  header.style.cssText = `
    background: #25d366; color: white; padding: 12px 16px;
    display: flex; justify-content: space-between; align-items: center;
  `;
  header.innerHTML = `
    <div>
      <div style="font-weight:700;font-size:14px;">💾 Save Lead</div>
      <div style="font-size:11px;opacity:0.85;">${username} · tap the message to save as note</div>
    </div>
    <button id="sellerflow-picker-close" style="
      background:rgba(255,255,255,0.2);border:none;color:white;
      border-radius:50%;width:26px;height:26px;cursor:pointer;font-size:14px;
      display:flex;align-items:center;justify-content:center;flex-shrink:0;
    ">✕</button>
  `;
  overlay.appendChild(header);

  // Message list
  const list = document.createElement("div");
  list.style.cssText = `max-height: 260px; overflow-y: auto; padding: 8px;`;

  if (messages.length === 0) {
    list.innerHTML = `<p style="text-align:center;color:#aaa;font-size:13px;padding:20px;">
      No messages found in this chat.</p>`;
  }

  let selectedText = null;

  messages.forEach(({ text, isMe }) => {
    const row = document.createElement("div");
    row.style.cssText = `
      padding: 8px 10px; border-radius: 10px; margin-bottom: 4px; cursor: pointer;
      background: ${isMe ? "#f0fdf4" : "#f8f9fa"};
      border: 2px solid transparent; transition: border 0.15s, background 0.15s;
      font-size: 13px; color: #222; line-height: 1.4;
      display: flex; gap: 8px; align-items: flex-start;
    `;

    const bubble = document.createElement("div");
    bubble.style.cssText = `flex:1; word-break: break-word;`;
    bubble.textContent = text;

    const label = document.createElement("div");
    label.style.cssText = `
      font-size: 10px; font-weight: 700; flex-shrink: 0; margin-top: 2px;
      color: ${isMe ? "#15803d" : "#6b7280"};
    `;
    label.textContent = isMe ? "You" : "Them";

    row.appendChild(label);
    row.appendChild(bubble);

    // Keyword highlight
    if (KEYWORDS.some(kw => text.toLowerCase().includes(kw))) {
      row.style.borderColor = "#fed7aa";
      row.style.background = "#fff7ed";
      const dot = document.createElement("span");
      dot.style.cssText = `
        font-size:9px;background:#f97316;color:white;
        border-radius:8px;padding:1px 5px;flex-shrink:0;margin-top:3px;
      `;
      dot.textContent = "order";
      row.appendChild(dot);
    }

    row.addEventListener("click", () => {
      // Deselect all
      list.querySelectorAll("[data-msg-row]").forEach(r => {
        r.style.borderColor = r.dataset.kwBorder || "transparent";
        r.style.background = r.dataset.origBg;
      });
      // Select this
      row.style.borderColor = "#25d366";
      row.style.background = "#dcfce7";
      selectedText = text;
      saveBtn.disabled = false;
      saveBtn.style.opacity = "1";
    });

    row.dataset.msgRow = "1";
    row.dataset.origBg = row.style.background;
    row.dataset.kwBorder = row.style.borderColor;
    list.appendChild(row);
  });

  overlay.appendChild(list);

  // Footer buttons
  const footer = document.createElement("div");
  footer.style.cssText = `
    padding: 10px 12px; border-top: 1px solid #f0f0f0;
    display: flex; gap: 8px;
  `;

  const skipBtn = document.createElement("button");
  skipBtn.textContent = "Save without note";
  skipBtn.style.cssText = `
    flex:1; padding:8px; border:1.5px solid #e5e7eb; border-radius:8px;
    background:#fff; color:#555; font-size:12px; font-weight:600; cursor:pointer;
  `;
  skipBtn.addEventListener("click", () => { closePicker(); onSave(null); });

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save Lead";
  saveBtn.disabled = true;
  saveBtn.style.cssText = `
    flex:1; padding:8px; border:none; border-radius:8px;
    background:#25d366; color:#fff; font-size:12px; font-weight:700;
    cursor:pointer; opacity:0.45; transition:opacity 0.2s;
  `;
  saveBtn.addEventListener("click", () => { closePicker(); onSave(selectedText); });

  footer.appendChild(skipBtn);
  footer.appendChild(saveBtn);
  overlay.appendChild(footer);

  document.body.appendChild(overlay);

  document.getElementById("sellerflow-picker-close").addEventListener("click", closePicker);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener("click", function outsideClick(e) {
      if (!overlay.contains(e.target) && e.target.id !== BUTTON_ID) {
        closePicker();
        document.removeEventListener("click", outsideClick);
      }
    });
  }, 100);
}

function saveLead(username, note) {
  const btn = document.getElementById(BUTTON_ID);
  if (btn) { btn.textContent = "Saving..."; btn.disabled = true; }

  chrome.runtime.sendMessage(
    {
      type: "SAVE_LEAD",
      payload: {
        platform: "whatsapp",
        username,
        lastMessage: note || "",
        note: note || null,
        profileUrl: null,
        timestamp: new Date().toISOString(),
      },
    },
    (response) => {
      if (btn) { btn.textContent = "💾 Save Lead"; btn.disabled = false; }
      if (response && response.success) {
        showToast(note ? "Lead saved with message!" : "Lead saved!");
      } else {
        const errMsg = response && response.error === "Not logged in"
          ? "Login via SellerFlow extension first"
          : "Failed to save lead";
        showToast(errMsg, true);
      }
    }
  );
}

function createSaveButton(fixed = false) {
  const btn = document.createElement("button");
  btn.id = BUTTON_ID;
  btn.textContent = "💾 Save Lead";
  btn.style.cssText = fixed
    ? `position:fixed;top:12px;right:80px;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,0.2);
       background:#25d366;color:white;border:none;border-radius:20px;padding:6px 16px;
       font-size:13px;font-weight:600;cursor:pointer;transition:background 0.3s,opacity 0.2s;white-space:nowrap;`
    : `background:#25d366;color:white;border:none;border-radius:20px;padding:6px 16px;
       font-size:13px;font-weight:600;cursor:pointer;margin-right:8px;
       transition:background 0.3s,opacity 0.2s;white-space:nowrap;flex-shrink:0;`;

  btn.addEventListener("mouseenter", () => (btn.style.opacity = "0.85"));
  btn.addEventListener("mouseleave", () => (btn.style.opacity = "1"));

  // Turn orange if buyer keywords detected
  setTimeout(() => {
    const msgs = getMessagesList();
    if (hasKeywords(msgs)) {
      btn.style.background = "#f97316";
      btn.title = "Potential buyer detected!";
    }
  }, 800);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const username = getContactName();

    // If picker already open, close it
    if (document.getElementById(PICKER_ID)) { closePicker(); return; }

    openPicker(username, (selectedNote) => {
      saveLead(username, selectedNote);
    });
  });

  return btn;
}

function injectButton() {
  if (document.getElementById(BUTTON_ID)) return;

  const menuAnchorSelectors = [
    '[data-testid="menu"]',
    '[data-testid="conversation-header-more-options-button"]',
    '[data-icon="menu"]',
    '#main header [aria-label]',
  ];
  for (const sel of menuAnchorSelectors) {
    const anchor = document.querySelector(sel);
    if (anchor) {
      let target = anchor;
      while (target.parentElement && target.parentElement.tagName !== "HEADER" &&
             !target.parentElement.id && target.parentElement !== document.body) {
        const ps = window.getComputedStyle(target.parentElement);
        if (ps.display === "flex" && target.parentElement.children.length > 1) break;
        target = target.parentElement;
      }
      target.parentElement.insertBefore(createSaveButton(false), target);
      return;
    }
  }

  document.body.appendChild(createSaveButton(true));
}

function removeButton() {
  const btn = document.getElementById(BUTTON_ID);
  if (btn) btn.remove();
  closePicker();
}

let lastPath = "";

function isInConversation() {
  return !!(
    document.querySelector('[data-testid="conversation-info-header-chat-title"]') ||
    document.querySelector('#main header') ||
    document.querySelector('[data-testid="conversation-header"]')
  );
}

function tryInject() {
  if (isInConversation()) { injectButton(); return true; }
  removeButton();
  return false;
}

const observer = new MutationObserver(() => {
  const currentPath = window.location.pathname + window.location.hash;
  if (currentPath !== lastPath) { lastPath = currentPath; removeButton(); }
  tryInject();
});

observer.observe(document.body, { childList: true, subtree: true });
tryInject();
