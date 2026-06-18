const https = require("https");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "meta-llama/llama-3.1-8b-instruct";

const BASE_SYSTEM_PROMPT = `You are a sales order extraction assistant for a local business.
Your job is to extract order information from customer messages, comments, and DMs.

Rules:
- Any mention of a product, item, food, or quantity is an ORDER — extract it with high confidence (0.7-1.0)
- Examples of orders: "1 burger", "two shirts and a pant", "hotdog and nan", "one chocolate"
- If someone mentions ANY product name or quantity, set confidence >= 0.7
- Extract customerName from the sender name if provided in the message context
- Never invent prices or availability
- Only set autoReply to false if the message is completely unrelated to products or ordering
- For comments and short messages, be aggressive about extraction — assume purchase intent

Respond with valid JSON only — no markdown, no extra text:
{
  "reply": "friendly confirmation response, or null if unclear",
  "autoReply": true,
  "lead": {
    "customerName": null,
    "products": [{"name": "product name", "qty": 1}],
    "deliveryAddress": null,
    "preferredTime": null,
    "notes": null,
    "confidence": 0.0
  }
}`;

async function classifyAndReply(messages, extraPrompt = "") {
  const systemContent = extraPrompt
    ? `${BASE_SYSTEM_PROMPT}\n\nBusiness context: ${extraPrompt}`
    : BASE_SYSTEM_PROMPT;

  const payload = JSON.stringify({
    model: MODEL,
    messages: [{ role: "system", content: systemContent }, ...messages],
    temperature: 0.3,
    max_tokens: 512,
  });

  return new Promise((resolve, reject) => {
    const url = new URL(OPENROUTER_URL);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://sellerflow.app",
          "X-Title": "SellerFlow",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(parsed.error.message || "OpenRouter error"));
              return;
            }
            const content = parsed.choices?.[0]?.message?.content || "";
            try {
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (!jsonMatch) throw new Error("No JSON in response");
              resolve(JSON.parse(jsonMatch[0]));
            } catch {
              resolve({
                reply: null,
                autoReply: false,
                lead: { customerName: null, products: [], deliveryAddress: null, preferredTime: null, notes: null, confidence: 0 },
              });
            }
          } catch {
            reject(new Error("Failed to parse OpenRouter response"));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

module.exports = { classifyAndReply };
