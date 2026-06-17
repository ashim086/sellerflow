// Instagram DM content script

const BUTTON_ID = "sellerflow-ig-btn";
const PICKER_ID = "sellerflow-ig-picker";

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
    background: ${isError ? "#ef4444" : "#8b5cf6"}; color: white;
    padding: 10px 20px; border-radius: 20px; font-size: 14px; font-weight: 600;
    z-index: 9999999; box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: opacity 0.3s;
  `;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); }, 2500);
}

function getConversationHeader() {
  // The action buttons (audio/video call, info) only exist in the active conversation header
  // — NOT in the sidebar — so they're the most reliable anchor
  const actionSelectors = [
    '[aria-label="Audio call"]',
    '[aria-label="Start an audio call"]',
    '[aria-label="Video call"]',
    '[aria-label="Start a video call"]',
    '[aria-label="View profile"]',
    '[aria-label="Info"]',
  ];
  for (const sel of actionSelectors) {
    const btn = document.querySelector(sel);
    if (!btn) continue;
    // Walk up until we find a container wide enough to be the full header bar
    let el = btn.parentElement;
    for (let i = 0; i < 10; i++) {
      if (!el) break;
      if (el.offsetWidth > 400) return el;
      el = el.parentElement;
    }
  }
  return null;
}

function getUsername() {
  const header = getConversationHeader();

  // 1. Profile link inside the conversation header — most specific
  if (header) {
    const links = Array.from(header.querySelectorAll('a[href^="/"]'));
    for (const a of links) {
      const href = a.getAttribute("href") || "";
      const match = href.match(/^\/([^/?#]+)\/?$/);
      const skip = ["direct", "stories", "explore", "reels", "accounts", "p", "reel"];
      if (match && !skip.includes(match[1])) return match[1];
    }

    // 2. Username text (shown smaller, below display name) in the header
    const spans = Array.from(header.querySelectorAll('span, div'))
      .filter(el => {
        const t = el.textContent.trim();
        // Username: no spaces, no special chars except _ and .
        return t && /^[a-zA-Z0-9._]{2,30}$/.test(t) && !el.querySelector("*");
      });
    if (spans.length > 0) return spans[0].textContent.trim();
  }

  // 3. Fallback: display name from header (any text near the action buttons)
  if (header) {
    const anyText = header.querySelector('span[dir="auto"], div[dir="auto"]');
    if (anyText) return anyText.textContent.trim();
  }

  // 4. Last resort: thread ID from URL
  const match = window.location.pathname.match(/\/direct\/t\/(\d+)/);
  return match ? `ig_${match[1]}` : "unknown_user";
}

function findMessagesContainer() {
  // Anchor: the message input box — messages pane is its scrollable ancestor
  const input = document.querySelector(
    '[aria-label="Message"], [placeholder="Message..."], div[contenteditable="true"][role="textbox"]'
  );
  if (input) {
    let el = input.parentElement;
    for (let i = 0; i < 12; i++) {
      if (!el) break;
      if (el.scrollHeight > el.clientHeight + 100 && el.clientHeight > 200) return el;
      el = el.parentElement;
    }
  }
  // Fallback: largest scrollable div on the page
  const allDivs = Array.from(document.querySelectorAll("div"));
  return allDivs
    .filter(d => d.scrollHeight > d.clientHeight + 100 && d.clientHeight > 200)
    .sort((a, b) => b.clientHeight - a.clientHeight)[0] || document.body;
}

function getMessagesList() {
  const container = findMessagesContainer();

  // Grab all dir="auto" spans and divs — Instagram puts all user text in these
  const textEls = Array.from(
    container.querySelectorAll('span[dir="auto"], div[dir="auto"]')
  );

  const items = textEls
    .map(el => {
      const text = el.textContent.trim();
      if (!text || text.length < 2 || text.length > 600) return null;
      // Skip timestamps and date separators
      if (text.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Today|Yesterday)/i)) return null;
      if (text.match(/^\d{1,2}:\d{2}\s*(AM|PM)?$/i)) return null;
      // Skip elements that contain child interactive nodes (nav, buttons etc.)
      if (el.querySelector("a, button, input, svg")) return null;
      // Skip if inside the message input itself
      if (el.closest('[contenteditable="true"]')) return null;
      // Skip very short system-like strings
      if (text.length < 2) return null;

      // Sent vs received: walk up and check for flex-end alignment
      let isMe = false;
      let parent = el.parentElement;
      for (let i = 0; i < 10; i++) {
        if (!parent || parent === container) break;
        const jc = window.getComputedStyle(parent).justifyContent;
        if (jc === "flex-end" || jc === "right" || jc === "end") { isMe = true; break; }
        parent = parent.parentElement;
      }

      return { text, isMe };
    })
    .filter(Boolean);

  // Deduplicate consecutive same texts
  const deduped = [];
  for (const item of items) {
    if (deduped.length === 0 || deduped[deduped.length - 1].text !== item.text) {
      deduped.push(item);
    }
  }
  return deduped.slice(-12);
}

function hasKeywords(messages) {
  return messages.some(({ text }) => KEYWORDS.some(kw => text.toLowerCase().includes(kw)));
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
    background: linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045);
    color: white; padding: 12px 16px;
    display: flex; justify-content: space-between; align-items: center;
  `;
  header.innerHTML = `
    <div>
      <div style="font-weight:700;font-size:14px;">💾 Save Lead</div>
      <div style="font-size:11px;opacity:0.85;">${username} · tap the message to save as note</div>
    </div>
    <button id="sellerflow-ig-picker-close" style="
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
    const kwMatch = KEYWORDS.some(kw => text.toLowerCase().includes(kw));
    const origBg = kwMatch ? "#fff7ed" : (isMe ? "#f5f3ff" : "#f8f9fa");
    const origBorder = kwMatch ? "#fed7aa" : "transparent";

    row.style.cssText = `
      padding: 8px 10px; border-radius: 10px; margin-bottom: 4px; cursor: pointer;
      background: ${origBg}; border: 2px solid ${origBorder};
      transition: border 0.15s, background 0.15s;
      font-size: 13px; color: #222; line-height: 1.4;
      display: flex; gap: 8px; align-items: flex-start;
    `;

    const label = document.createElement("div");
    label.style.cssText = `font-size:10px;font-weight:700;flex-shrink:0;margin-top:2px;color:${isMe ? "#7c3aed" : "#6b7280"};`;
    label.textContent = isMe ? "You" : "Them";

    const bubble = document.createElement("div");
    bubble.style.cssText = `flex:1;word-break:break-word;`;
    bubble.textContent = text;

    row.appendChild(label);
    row.appendChild(bubble);

    if (kwMatch) {
      const dot = document.createElement("span");
      dot.style.cssText = `font-size:9px;background:#f97316;color:white;border-radius:8px;padding:1px 5px;flex-shrink:0;margin-top:3px;`;
      dot.textContent = "order";
      row.appendChild(dot);
    }

    row.dataset.msgRow = "1";
    row.dataset.origBg = origBg;
    row.dataset.origBorder = origBorder;

    row.addEventListener("click", () => {
      list.querySelectorAll("[data-msg-row]").forEach(r => {
        r.style.borderColor = r.dataset.origBorder;
        r.style.background = r.dataset.origBg;
      });
      row.style.borderColor = "#8b5cf6";
      row.style.background = "#f5f3ff";
      selectedText = text;
      saveBtn.disabled = false;
      saveBtn.style.opacity = "1";
    });

    list.appendChild(row);
  });

  overlay.appendChild(list);

  // Footer
  const footer = document.createElement("div");
  footer.style.cssText = `padding:10px 12px;border-top:1px solid #f0f0f0;display:flex;gap:8px;`;

  const skipBtn = document.createElement("button");
  skipBtn.textContent = "Save without note";
  skipBtn.style.cssText = `flex:1;padding:8px;border:1.5px solid #e5e7eb;border-radius:8px;background:#fff;color:#555;font-size:12px;font-weight:600;cursor:pointer;`;
  skipBtn.addEventListener("click", () => { closePicker(); onSave(null); });

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save Lead";
  saveBtn.disabled = true;
  saveBtn.style.cssText = `flex:1;padding:8px;border:none;border-radius:8px;background:linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045);color:#fff;font-size:12px;font-weight:700;cursor:pointer;opacity:0.45;transition:opacity 0.2s;`;
  saveBtn.addEventListener("click", () => { closePicker(); onSave(selectedText); });

  footer.appendChild(skipBtn);
  footer.appendChild(saveBtn);
  overlay.appendChild(footer);
  document.body.appendChild(overlay);

  document.getElementById("sellerflow-ig-picker-close").addEventListener("click", closePicker);

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
        platform: "instagram",
        username,
        lastMessage: note || "",
        note: note || null,
        profileUrl: window.location.href,
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

function createBtn() {
  const btn = document.createElement("button");
  btn.id = BUTTON_ID;
  btn.textContent = "💾 Save Lead";

  btn.addEventListener("mouseenter", () => (btn.style.opacity = "0.85"));
  btn.addEventListener("mouseleave", () => (btn.style.opacity = "1"));

  setTimeout(() => {
    const msgs = getMessagesList();
    if (hasKeywords(msgs)) {
      btn.style.background = "#f97316";
      btn.title = "Potential buyer detected!";
    }
  }, 800);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (document.getElementById(PICKER_ID)) { closePicker(); return; }
    const username = getUsername();
    openPicker(username, (selectedNote) => saveLead(username, selectedNote));
  });

  return btn;
}

function injectButton() {
  if (document.getElementById(BUTTON_ID)) return;

  // Try to inject inline — find the first action icon button in the DM header
  // Instagram places audio/video call + info buttons on the right of the header
  const actionBtnSelectors = [
    '[aria-label="Audio call"]',
    '[aria-label="Start an audio call"]',
    '[aria-label="Video call"]',
    '[aria-label="Start a video call"]',
    '[aria-label="View profile"]',
    '[aria-label="More options"]',
    '[aria-label="Info"]',
  ];

  for (const sel of actionBtnSelectors) {
    const anchor = document.querySelector(sel);
    if (!anchor) continue;

    // Walk up to the flex container that holds all the action icons
    let target = anchor;
    for (let i = 0; i < 5; i++) {
      if (!target.parentElement) break;
      const ps = window.getComputedStyle(target.parentElement);
      if (ps.display === "flex" && target.parentElement.children.length >= 2) break;
      target = target.parentElement;
    }

    const btn = createBtn();
    btn.style.cssText = `
      background: linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045);
      color: white; border: none; border-radius: 20px; padding: 6px 14px;
      font-size: 13px; font-weight: 600; cursor: pointer; margin-right: 8px;
      transition: opacity 0.2s; white-space: nowrap; flex-shrink: 0;
    `;
    target.parentElement.insertBefore(btn, target);
    return;
  }

  // Fallback: fixed — far enough left to clear Instagram's 3 icon buttons (~150px)
  const btn = createBtn();
  btn.style.cssText = `
    position: fixed; top: 12px; right: 160px; z-index: 99999;
    background: linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045);
    color: white; border: none; border-radius: 20px; padding: 6px 16px;
    font-size: 13px; font-weight: 600; cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    transition: opacity 0.2s; white-space: nowrap;
  `;
  document.body.appendChild(btn);
}

function removeButton() {
  const btn = document.getElementById(BUTTON_ID);
  if (btn) btn.remove();
  closePicker();
}

function isInDM() {
  return window.location.pathname.includes("/direct/t/");
}

let lastPath = "";

const observer = new MutationObserver(() => {
  const currentPath = window.location.pathname;
  if (currentPath !== lastPath) {
    lastPath = currentPath;
    removeButton();
  }
  if (isInDM()) {
    injectButton();
  } else {
    removeButton();
  }
});

observer.observe(document.body, { childList: true, subtree: true });
if (isInDM()) injectButton();
