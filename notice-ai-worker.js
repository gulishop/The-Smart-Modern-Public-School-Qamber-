// ===================================================================
// Cloudflare Worker: Claude API Proxy for Notice Board AI feature
// ===================================================================
// Ye worker aapki website aur Anthropic API ke beech ek "bridge" hai.
// Aapki API key sirf yahan (Cloudflare ke server par) mehfooz rehti hai,
// browser tak kabhi nahi jaati.
//
// SETUP (ek dafa karna hai):
// 1) https://dash.cloudflare.com par free account banayein.
// 2) Left menu me "Workers & Pages" -> "Create" -> "Create Worker".
// 3) Koi bhi naam de dein (e.g. "notice-ai-proxy") -> Deploy.
// 4) "Edit Code" par click karein, jo bhi default code hai wo poora
//    mita kar, ye poori file paste kar dein -> Save & Deploy.
// 5) Worker ke "Settings" -> "Variables and Secrets" me jayein.
//    "Add" karein: Name = ANTHROPIC_API_KEY, Value = apni Claude API key,
//    Type = Secret -> Save. (Ye encrypted rehti hai, kabhi dikhti nahi)
// 6) ALLOWED_ORIGIN neeche apni asal site ke URL se replace karein
//    (e.g. "https://yourusername.github.io"), taake sirf aapki site
//    is worker ko istemal kar sake.
// 7) Deploy hone ke baad aapko ek URL milega jaisa:
//    https://notice-ai-proxy.yourname.workers.dev
//    Ye URL index.html me WORKER_URL variable me daalna hai.
// ===================================================================

const ALLOWED_ORIGIN = "https://yourusername.github.io"; // <-- apni site ka URL yahan daalein

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (origin !== ALLOWED_ORIGIN) {
      return new Response(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...headers },
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...headers },
      });
    }

    try {
      const incomingBody = await request.json();

      // Safety: force a fixed, cheap model + token cap so the key
      // can't be abused for expensive requests even if someone
      // finds the worker URL.
      const safeBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: incomingBody.system || "",
        messages: incomingBody.messages || [],
      };

      const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(safeBody),
      });

      const data = await anthropicResp.text();
      return new Response(data, {
        status: anthropicResp.status,
        headers: { "Content-Type": "application/json", ...headers },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...headers },
      });
    }
  },
};
