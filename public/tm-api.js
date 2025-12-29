// tm-api.js — shared helpers (fixed API_BASE resolution to avoid /api/me 404)

export const API_BASE = (() => {
  const v = String(window.API_BASE || "").trim().replace(/\/$/, "");
  if (v) return v;

  // file:// dev
  if (location.protocol === "file:") return "http://localhost:3000";

  const host = location.hostname;
  const port = location.port || "";
  const isLocal = host === "localhost" || host === "127.0.0.1";

  // Common setup: frontend on :5500 (Live Server) + backend on :3000
  if (isLocal && port && port !== "3000") {
    return `${location.protocol}//${host}:3000`;
  }

  // Same-origin (production)
  return "";
})();

/* ---------- Generic helpers ---------- */

export async function apiGet(path, { credentials = "include" } = {}) {
  const url = API_BASE + path;
  try {
    const res = await fetch(url, { credentials });
    let data = null;
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, ...(data || {}) };
  } catch (err) {
    console.error("apiGet error:", err);
    return { ok: false, status: 0, error: "network_error" };
  }
}

export async function apiPost(path, payload = {}, { credentials = "include" } = {}) {
  const url = API_BASE + path;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials,
      body: JSON.stringify(payload),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, ...(data || {}) };
  } catch (err) {
    console.error("apiPost error:", err);
    return { ok: false, status: 0, error: "network_error" };
  }
}

export async function apiPatch(path, payload = {}, { credentials = "include" } = {}) {
  const url = API_BASE + path;
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials,
      body: JSON.stringify(payload),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, ...(data || {}) };
  } catch (err) {
    console.error("apiPatch error:", err);
    return { ok: false, status: 0, error: "network_error" };
  }
}

/* ---------- Convenience wrappers ---------- */

// Auth
export const apiRegister  = (fields) => apiPost("/api/auth/register", fields);
export const apiLogin     = (fields) => apiPost("/api/auth/login", fields);
export const apiOAuthMock = (provider) => apiPost("/api/auth/oauth/mock", { provider });

// User
export const apiMe        = () => apiGet("/api/me");
export const apiSavePrefs = (prefs) => apiPost("/api/me/preferences", prefs);
export const apiUpdateProfile = (payload) => apiPost("/api/me/profile", payload);

// Plan
export const apiChoosePlan = (plan) =>
  !plan
    ? Promise.resolve({ ok: false, status: 400, message: "plan required" })
    : apiPost("/api/plan/choose", { plan });

// Shortlist
export const apiShortlistToday = () => apiGet("/api/shortlist");
export const apiShortlistDecision = (profileId, action) =>
  apiPost("/api/shortlist/decision", { profileId, action });

// OTP helpers (auth flow)
export const apiSendVerificationCode = (email) =>
  apiPost("/api/auth/send-verification-code", { email });
export const apiVerifyEmailCode = (email, code) =>
  apiPost("/api/auth/verify-email-code", { email, code });

/* ---------- Coinbase Commerce (new) ---------- */

// ✅ tweak: send both plan + planKey (backend accepts planKey || plan)
export const apiCreateCoinbaseCharge = (plan, planKey) => {
  const picked = String(planKey || plan || "").toLowerCase().trim();
  return apiPost("/api/coinbase/create-charge", { plan: picked, planKey: picked });
};

/* ---------- Legacy Stripe names (kept so nothing breaks) ---------- */
/**
 * If some old frontend code still calls Stripe wrappers, we map them to Coinbase.
 * We return `{ url }` (Stripe shape) using Coinbase `hosted_url`.
 */
export const apiCreateStripeCheckoutSession = async (plan, planKey) => {
  const picked = String(planKey || plan || "").toLowerCase();
  const r = await apiPost("/api/coinbase/create-charge", { plan: picked, planKey: picked });
  if (r && r.ok) {
    const hosted = r.hosted_url || r.url;
    return { ...r, url: hosted };
  }
  return r;
};

/**
 * Stripe confirm used to activate plan.
 * With Coinbase, we can confirm the charge code on return via:
 * POST /api/stripe/confirm { session_id: CHARGE_CODE }
 *
 * Fallback: if session_id is not provided, we just check /api/me
 * so older callers won't break.
 */
export const apiStripeConfirm = async (session_id) => {
  if (session_id) {
    return apiPost("/api/stripe/confirm", { session_id });
  }

  // Fallback behavior (old): check `/api/me`
  const me = await apiMe();
  const u = (me && me.user) ? me.user : {};
  const hasActiveFlag = typeof u.planActive === "boolean" ? u.planActive : false;

  // Fallback: if planEnd exists and still in the future, treat as active
  let activeByEnd = false;
  if (!hasActiveFlag && u.planEnd) {
    const t = new Date(u.planEnd).getTime();
    activeByEnd = Number.isFinite(t) ? Date.now() <= t : false;
  }

  if (me && me.ok && (hasActiveFlag || activeByEnd)) {
    return { ok: true, status: 200, user: u };
  }
  return {
    ok: false,
    status: 400,
    message: "payment_not_confirmed",
    user: u
  };
};
/* ---------- Preferences helpers (localStorage + API) ---------- */