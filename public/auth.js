// auth.js — aligned to your current auth.html (loginEmail/signupEmail + dlgVerify IDs)
(() => {
  if (!/\/auth\.html(?:$|[?#])/.test(location.pathname)) return;

  // Backend origin (no trailing slash). Your auth.html sets window.API_BASE = '' in <head>.
  const API_BASE = (() => {
    const v = String(window.API_BASE || "").trim().replace(/\/$/, "");
    if (v) return v;

    // file:// dev fallback
    if (location.protocol === "file:") return "http://localhost:3000";

    const host = location.hostname;
    const port = location.port || "";

    // If frontend has a port and it's not 3000, assume backend on 3000
    if (port && port !== "3000") {
      return `${location.protocol}//${host}:3000`;
    }

    // Same origin
    return `${location.origin}`;
  })();

  // ---------- Helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function getParam(k) {
    try { return new URLSearchParams(location.search).get(k); } catch { return null; }
  }
  function setParam(k, v) {
    const u = new URL(location.href);
    if (v === null || v === undefined || v === "") u.searchParams.delete(k);
    else u.searchParams.set(k, String(v));
    history.replaceState({}, "", u.toString());
  }

  const whenReady = (fn) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  };

  function getEmailCandidate() {
    // Prefer verifyEmailTxt if already set in modal
    const fromModal = $("#verifyEmailTxt")?.textContent?.trim();
    if (fromModal) return fromModal.toLowerCase();

    // Prefer whichever pane is visible
    const paneLoginHidden = $("#pane-login")?.classList?.contains("hidden");
    const paneSignupHidden = $("#pane-signup")?.classList?.contains("hidden");

    const loginEmail = $("#loginEmail")?.value?.trim();
    const signupEmail = $("#signupEmail")?.value?.trim();

    if (!paneLoginHidden && loginEmail) return loginEmail.toLowerCase();
    if (!paneSignupHidden && signupEmail) return signupEmail.toLowerCase();

    // Fallback: whichever exists
    if (loginEmail) return loginEmail.toLowerCase();
    if (signupEmail) return signupEmail.toLowerCase();

    // Fallback: local user
    try {
      const raw = localStorage.getItem("tm_user");
      if (raw) {
        const u = JSON.parse(raw);
        if (u?.email) return String(u.email).trim().toLowerCase();
      }
    } catch {}

    // Generic
    const any = $('input[name="email"]')?.value?.trim();
    return (any || "").toLowerCase();
  }

  async function callAPI(path, payload = {}) {
    try {
      const res = await fetch(API_BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const ok = res.ok;
      const status = res.status;
      let data = null;
      try { data = await res.json(); } catch {}
      return { ok, status, ...(data || {}) };
    } catch {
      // Offline / backend not running — allow demo routing
      return { ok: true, demo: true, status: 0 };
    }
  }

  async function apiGet(path) {
    try {
      const res = await fetch(API_BASE + path, { credentials: "include" });
      let data = null;
      try { data = await res.json(); } catch {}
      return data;
    } catch {
      return null;
    }
  }

  // ---------- Loader helpers (works even if TMLoader is missing)
  function tmShowLoader(title, sub, small) {
    try {
      if (window.TMLoader && typeof window.TMLoader.show === "function") {
        window.TMLoader.show(title, sub, small);
      } else {
        console.log("[TM] Loader:", title || "Loading…", sub || "");
      }
    } catch (e) {
      console.warn("[TM] Loader show error", e);
    }
  }

  function tmHideLoader() {
    try {
      if (window.TMLoader && typeof window.TMLoader.hide === "function") {
        window.TMLoader.hide();
      }
    } catch (e) {
      console.warn("[TM] Loader hide error", e);
    }
  }

  // Expose for manual testing in console
  try {
    window.__tmShowLoader = tmShowLoader;
    window.__tmHideLoader = tmHideLoader;
  } catch {}

  function saveLocalUser(u) {
    const minimal = {
      id: u?.id || "local-demo",
      email: u?.email || "user@truematch.app",
      name: u?.name || "User",
      plan: u?.plan || u?.tier || u?.subscription || "",
    };
    try { localStorage.setItem("tm_user", JSON.stringify(minimal)); } catch {}
  }

  function localPlan() {
    try {
      const raw = localStorage.getItem("tm_user");
      if (raw) {
        const u = JSON.parse(raw);
        if (u?.plan) return String(u.plan);
      }
    } catch {}
    return "";
  }

  function hasLocalPrefs() {
    try {
      const email = getEmailCandidate();
      if (!email) return false;

      const rawMap = localStorage.getItem("tm_prefs_by_user");
      if (!rawMap) return false;

      const map = JSON.parse(rawMap) || {};
      return !!(map && typeof map === "object" && map[email]);
    } catch {
      return false;
    }
  }

  function mergeExtraParams(base, extraQuery) {
    const q = new URLSearchParams(base || "");
    if (extraQuery) {
      for (const [k, v] of new URLSearchParams(extraQuery)) {
        if (k === "mode" || k === "return") continue;
        q.set(k, v);
      }
    }
    return q;
  }

  function gotoDashboard(extraQuery) {
    const q = mergeExtraParams("", extraQuery);
    const qs = q.toString();
    location.replace(`/dashboard.html${qs ? `?${qs}` : ""}`);
  }

  function gotoPreferences(extraQuery) {
    const current = new URLSearchParams(location.search);
    const q = new URLSearchParams();

    const demo = current.get("demo");
    if (demo) q.set("demo", demo);

    const prePlan = current.get("prePlan");
    if (prePlan) q.set("prePlan", prePlan);

    const merged = mergeExtraParams(q.toString(), extraQuery);
    merged.set("onboarding", "1");

    const qs = merged.toString();
    location.replace(`/preferences.html${qs ? `?${qs}` : ""}`);
  }

  function gotoTier(extraQuery) {
    const current = new URLSearchParams(location.search);
    const q = new URLSearchParams();

    const demo = current.get("demo");
    if (demo) q.set("demo", demo);

    const prePlan = current.get("prePlan");
    if (prePlan) q.set("prePlan", prePlan);

    const merged = mergeExtraParams(q.toString(), extraQuery);
    merged.set("onboarding", "1");

    const qs = merged.toString();
    location.replace(`/tier.html${qs ? `?${qs}` : ""}`);
  }

  async function fetchMe() {
    return await apiGet("/api/me");
  }

  // ---------- Tabs wiring (matches auth.html: data-tab-btn + panes)
  let tabBtns = [];
  let paneLogin = null;
  let paneSignup = null;

  function refreshAuthRefs() {
    tabBtns = $$("[data-tab-btn]");
    paneLogin = $("#pane-login");
    paneSignup = $("#pane-signup");
  }

  function setActiveTab(mode) {
    if ((!paneLogin && !paneSignup) && document.readyState !== "loading") refreshAuthRefs();

    const wantLogin = String(mode).toLowerCase() !== "signup";
    tabBtns.forEach((b) => {
      const isLogin = b.dataset.tabBtn === "login";
      b.setAttribute("aria-selected", String(isLogin === wantLogin));
      b.classList.toggle("active", isLogin === wantLogin);
    });

    paneLogin?.classList.toggle("hidden", !wantLogin);
    paneSignup?.classList.toggle("hidden", wantLogin);

    const focusEl = wantLogin ? $("#loginEmail") : $("#signupName") || $("#signupEmail");
    focusEl && setTimeout(() => focusEl.focus(), 0);
  }

  whenReady(() => {
    refreshAuthRefs();
    setActiveTab((getParam("mode") || "login").toLowerCase());

    tabBtns.forEach((b) => {
      if (b.dataset.tmBound === "1") return;
      b.dataset.tmBound = "1";
      b.addEventListener("click", () => {
        const t = b.dataset.tabBtn || "login";
        setActiveTab(t);
        setParam("mode", t);
      });
    });

    // data-switch links (Create one / Sign in)
    if (!document.documentElement.dataset.tmSwitchBound) {
      document.documentElement.dataset.tmSwitchBound = "1";
      document.addEventListener("click", (e) => {
        const sw = e.target.closest("[data-switch]");
        if (!sw) return;
        e.preventDefault();
        const t = sw.getAttribute("data-switch") || "login";
        setActiveTab(t);
        setParam("mode", t);
      });
    }
  });

  // ---------- Demo accounts
  const DEMO = {
    "tier1.demo@truematch.app": { password: "111111", name: "Demo Tier 1", plan: "tier1" },
    "tier2.demo@truematch.app": { password: "222222", name: "Demo Tier 2", plan: "tier2" },
    "tier3.demo@truematch.app": { password: "333333", name: "Demo Tier 3", plan: "tier3" },
  };

  async function tryDemoLogin(email, pass) {
    const key = String(email || "").trim().toLowerCase();
    const d = DEMO[key];
    if (!d) return false;

    if (String(pass || "") !== d.password) {
      alert("Demo password mali. (Tier1=111111, Tier2=222222, Tier3=333333)");
      return true;
    }

    saveLocalUser({ email, name: d.name, plan: d.plan });

    // Optional: also try backend login
    try { await callAPI("/api/auth/login", { email, password: pass }); } catch {}

    const extra = new URLSearchParams({ demo: "1", prePlan: d.plan });
    finishLogin(extra.toString());
    return true;
  }

  // ---------- Email verification (OTP) — aligned to auth.html modal IDs
  async function apiSendVerificationCode(email) {
    return await callAPI("/api/auth/send-verification-code", { email });
  }
  async function apiVerifyEmailCode(email, code) {
    return await callAPI("/api/auth/verify-email-code", { email, code });
  }

  function safeDialogClose(dlg) {
    try {
      if (typeof dlg.close === "function") dlg.close();
      else dlg.removeAttribute("open");
    } catch {
      try { dlg.removeAttribute("open"); } catch {}
    }
  }

  function openVerifyDialog(email) {
    const dlg = $("#dlgVerify");
    if (!dlg) return false;

    const emailTxt = $("#verifyEmailTxt");
    const codeInput = $("#verifyCode");
    const msg = $("#verifyMsg");
    const btnResend = $("#btnResendCode");
    const btnClose = $("#btnCloseVerify");

    const targetEmail = (email || getEmailCandidate() || "").trim();
    if (emailTxt) emailTxt.textContent = targetEmail || "";

    if (msg) msg.textContent = "";
    if (codeInput) { codeInput.value = ""; setTimeout(() => codeInput.focus(), 0); }

    if (btnResend) {
      btnResend.onclick = async () => {
        if (msg) msg.textContent = "Sending…";
        try {
          const e = (emailTxt?.textContent || targetEmail || getEmailCandidate()).trim();
          if (!e) throw new Error("No email");
          await apiSendVerificationCode(e);
          if (msg) msg.textContent = "Sent. Check your inbox.";
        } catch {
          if (msg) msg.textContent = "Failed to send. Try again.";
        }
        setTimeout(() => { if (msg) msg.textContent = ""; }, 1500);
      };
    }

    if (btnClose) {
      btnClose.onclick = () => safeDialogClose(dlg);
    }

    const form = $("#frmVerify") || dlg.querySelector("form");
    if (form && !form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();

        const code = String(codeInput?.value || "").trim();
        const e = String(emailTxt?.textContent || targetEmail || getEmailCandidate()).trim().toLowerCase();

        if (!e) { if (msg) msg.textContent = "Email missing. Please reopen and try again."; return; }
        if (!code) { if (msg) msg.textContent = "Enter the code."; return; }

        if (msg) msg.textContent = "Verifying…";
        try { tmShowLoader('Verifying code…','Finalizing sign-in'); } catch {}
        try {
          const out = await apiVerifyEmailCode(e, code);
          const ok = !!(out?.ok || out?.verified);

          if (!ok) {
            if (msg) msg.textContent = out?.message || "Invalid code.";
            return;
          }
          
          // [FIX START] Update local storage immediately to avoid loops
          try {
            const raw = localStorage.getItem("tm_user");
            if (raw) {
              const u = JSON.parse(raw);
              u.emailVerified = true;
              localStorage.setItem("tm_user", JSON.stringify(u));
            }
          } catch {}
          // [FIX END]

          if (msg) msg.textContent = "Verified ✅";
          safeDialogClose(dlg);

          // After verify: go directly to Preferences (no flicker)
          const extra = new URLSearchParams(location.search);
          extra.delete("verify");
          gotoPreferences(extra.toString());
        } catch {
          if (msg) msg.textContent = "Verification failed. Try again.";
        }
        try { tmHideLoader(); } catch {}
      });
    }

    try {
      if (typeof dlg.showModal === "function") dlg.showModal();
      else dlg.setAttribute("open", "");
    } catch {
      dlg.setAttribute("open", "");
    }

    return true;
  }

  async function ensureVerifiedBeforeContinue(email) {
    try {
      const me = await apiGet("/api/me");
      const verified = !!(me?.user?.emailVerified);
      if (verified) return true;

      const e = (email || me?.user?.email || getEmailCandidate() || "").trim().toLowerCase();
      if (!e) return openVerifyDialog(""); // still open, user can see blank + resend won't work until email exists

      try { await apiSendVerificationCode(e); } catch {}
      return openVerifyDialog(e);
    } catch {
      // If backend unreachable, just continue (demo/offline)
      return true;
    }
  }

  // ---------- Finish login routing (prefs + plan + verify)
  async function finishLogin(extraQuery) {
    const qs = new URLSearchParams(location.search);
    const demo = qs.get("demo") === "1";

    // Demo routing — align with new logic:
    // Once may prefs na, diretso Dashboard. Otherwise Preferences.
    if (demo) {
      const prefs = hasLocalPrefs();

      const ret = qs.get("return");
      if (ret) { location.replace(ret); return; }

      if (prefs) {
        gotoDashboard(extraQuery);
        return;
      }
      gotoPreferences(extraQuery);
      return;
    }

    // Backend routing
    const resp = await fetchMe();
    const user = resp?.user;

    // Email verify required
    if (user && !user.emailVerified) {
      const e = (user.email || getEmailCandidate() || "").trim().toLowerCase();
      try { if (e) await apiSendVerificationCode(e); } catch {}
      await ensureVerifiedBeforeContinue(e);
      return;
    }

    // Recompute prefs more defensively:
    const prefsServer =
      !!(user?.prefsSaved || user?.preferencesSaved) ||
      (user?.preferences && Object.keys(user.preferences || {}).length > 0) ||
      (user?.prefs && Object.keys(user.prefs || {}).length > 0);

    const prefs = prefsServer || hasLocalPrefs();

    const ret = qs.get("return");
    if (ret) { location.replace(ret); return; }

    // NEW RULE: Kapag may preferences na, diretso Dashboard.
    // Paid plan is optional (Free by default).
    if (prefs) {
      gotoDashboard(extraQuery);
      return;
    }

    // Kung wala pang prefs, saka lang sa preferences page.
    gotoPreferences(extraQuery);
  }

  // Auto open verify modal if /auth.html?verify=1
  whenReady(() => {
    try {
      const usp = new URLSearchParams(location.search);
      if (usp.get("verify") === "1") {
        const emailGuess = getEmailCandidate();
        // Let the DOM settle a bit
        setTimeout(() => { ensureVerifiedBeforeContinue(emailGuess); }, 60);
      }
    } catch {}
  });

  // ---------- Sign up form (id="signupForm")
  whenReady(() => {
    const signupForm = $("#signupForm");
    if (!signupForm || signupForm.dataset.tmBound === "1") return;
    signupForm.dataset.tmBound = "1";

    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(signupForm);
      try { tmShowLoader('Creating your account…','Securing your session'); } catch {}
      try {
        const payload = Object.fromEntries(fd.entries());
        const out = await callAPI("/api/auth/register", payload);
        const ok = !!(out?.ok || out?.created || out?.status === 200 || out?.status === 201 || out?.demo);

        if (!ok) {
          alert(out?.message || "Signup failed. Please try again.");
          return;
        }

        // After signup: switch to login tab (as in your UX)
        setActiveTab("login");
        setParam("mode", "login");
        // Optionally prefill login email
        const email = String(payload.email || "").trim();
        if (email && $("#loginEmail")) $("#loginEmail").value = email;
      } finally {
        try { tmHideLoader(); } catch {}
      }
    });
  });

  // ---------- Login form (id="loginForm")
  whenReady(() => {
    const loginForm = $("#loginForm");
    if (!loginForm || loginForm.dataset.tmBound === "1") return;
    loginForm.dataset.tmBound = "1";

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try { tmShowLoader('Signing you in…','Checking credentials'); } catch {}
      try {
        const email = String($("#loginEmail")?.value || "").trim();
        const password = String($("#loginPass")?.value || "").trim();

        if (await tryDemoLogin(email, password)) return;

        const res = await callAPI("/api/auth/login", { email, password });
        const offline = !!(res && (res.demo || res.status === 0));
        const ok = !!(res && (res.ok || offline));

        if (!ok) {
          alert(res?.message || "Login failed. Please check your credentials.");
          return;
        }

        saveLocalUser(res.user || { email, name: email.split("@")[0] || "User" });

        const extra = new URLSearchParams();
        if (offline) extra.set("demo", "1");
        finishLogin(extra.toString());
      } finally {
        try { tmHideLoader(); } catch {}
      }
    });
  });

  // ---------- Google button (id="btnGoogleLogin")
  whenReady(() => {
    const googleBtn = $("#btnGoogleLogin");
    if (!googleBtn || googleBtn.dataset.tmBound === "1") return;
    googleBtn.dataset.tmBound = "1";

    googleBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try { tmShowLoader('Signing you in…','Opening Google'); } catch {}
      try {
        // If you later wire Google Identity Services, replace this with real OAuth flow.
        const r = await callAPI("/api/auth/oauth/mock", { provider: "google" });
        saveLocalUser(r?.user || { email: "google@demo.local", name: "Google User" });

        const extra = new URLSearchParams();
        if (r?.demo || r?.status === 0) extra.set("demo", "1");
        finishLogin(extra.toString());
      } finally {
        try { tmHideLoader(); } catch {}
      }
    });
  });
})();