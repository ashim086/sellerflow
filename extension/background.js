const API_URL = "http://localhost:8080";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SAVE_LEAD") {
    chrome.storage.local.get(["jwt"], (result) => {
      if (!result.jwt) {
        sendResponse({ success: false, error: "Not logged in" });
        return;
      }

      fetch(`${API_URL}/api/leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${result.jwt}`,
        },
        body: JSON.stringify(message.payload),
      })
        .then((res) => res.json())
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    });

    return true; // keep message channel open for async response
  }
});
