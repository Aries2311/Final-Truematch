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

  // =========================================================
  // ANIMATIONS & CHAT SIMULATION LOGIC
  // =========================================================
  whenReady(() => {
    
    // --- A. Left Side Mouse Parallax (3D Move) ---
    const visualSide = $(".auth-visual-side");
    const visualContent = $(".visual-content"); 
    const parallaxContent = $("#parallaxContent");

    if (visualSide && (parallaxContent || visualContent)) {
      const target = parallaxContent || visualContent;
      visualSide.addEventListener('mousemove', (e) => {
        const { offsetWidth: width, offsetHeight: height } = visualSide;
        const { offsetX: x, offsetY: y } = e;
        const moveX = ((x / width) * 20) - 10; 
        const moveY = ((y / height) * 20) - 10;
        target.style.transform = `rotateY(${moveX}deg) rotateX(${-moveY}deg)`;
      });
      visualSide.addEventListener('mouseleave', () => {
        target.style.transform = `rotateY(0deg) rotateX(0deg)`;
      });
    }

    // --- B. Flip Card Logic ---
    const flipCard = $("#authFlipCard");
    if (flipCard) {
      // Global click listener for background flip
      flipCard.addEventListener('click', (e) => {
        const target = e.target;
        // Don't flip if user is interacting with form
        if (target.closest('input') || target.closest('button') || target.closest('a') || target.closest('label') || target.closest('.forgot-link')) {
          return;
        }
        // Toggle flip
        const isFlipped = flipCard.classList.contains('flipped');
        setActiveTab(isFlipped ? 'login' : 'signup');
        setParam('mode', isFlipped ? 'login' : 'signup');
      });

      // Switch buttons listeners
      document.body.addEventListener('click', (e) => {
        if (e.target.closest('#toSignup')) { e.preventDefault(); setActiveTab('signup'); setParam('mode', 'signup'); }
        if (e.target.closest('#toLogin')) { e.preventDefault(); setActiveTab('login'); setParam('mode', 'login'); }
      });
    }

    // --- C. CHAT SIMULATION LOOP ---
    const chatContainer = $("#chatContainer");
    const reactionLayer = $("#reactionLayer");

    if (chatContainer) {
      const scenarios = [
        { a: "Nice pics! 🔥", b: "Thanks, you too. 😉" },
        { a: "Are you real? 🤔", b: "Come find out... 🤫" },
        { a: "VIP Lounge tonight? 🥂", b: "On my way. 🚀" }
      ];

      const wait = (ms) => new Promise(r => setTimeout(r, ms));

      async function typeMessage(text, isReceived) {
        // Typing indicator
        const typingId = "typing-" + Date.now();
        const typingHTML = `
          <div class="chat-bubble ${isReceived ? 'received' : 'sent'} typing-bubble" id="${typingId}">
            <div class="dot"></div><div class="dot"></div><div class="dot"></div>
          </div>
        `;
        chatContainer.insertAdjacentHTML('beforeend', typingHTML);
        chatContainer.scrollTop = chatContainer.scrollHeight;

        await wait(1200);

        const typingEl = document.getElementById(typingId);
        if(typingEl) typingEl.remove();

        const msgHTML = `<div class="chat-bubble ${isReceived ? 'received' : 'sent'}">${text}</div>`;
        chatContainer.insertAdjacentHTML('beforeend', msgHTML);
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }

      function showReaction() {
        const hearts = ['❤️', '🔥', '😍', '💋'];
        const heart = document.createElement('div');
        heart.className = 'floating-heart';
        heart.innerText = hearts[Math.floor(Math.random() * hearts.length)];
        heart.style.right = Math.random() * 20 + 'px';
        reactionLayer && reactionLayer.appendChild(heart);
        setTimeout(() => heart.remove(), 2000);
      }

      async function runChatSimulation() {
        while(true) { 
          for (const scene of scenarios) {
            chatContainer.innerHTML = ''; 
            await wait(500);
            await typeMessage(scene.a, true);
            await wait(1500);
            await typeMessage(scene.b, false);
            if(reactionLayer) { showReaction(); await wait(200); showReaction(); await wait(200); showReaction(); }
            await wait(3000); 
          }
        }
      }
      runChatSimulation(); 
    }
    
    // --- D. Text Slider ---
    const slides = $$('.slide-text');
    if (slides.length > 0) {
      let currentSlide = 0;
      slides[0].classList.add('active'); 
      setInterval(() => {
        slides[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add('active');
      }, 3000); 
    }
  });

  // =========================================================
  // CORE AUTH LOGIC (RETAINED & OPTIMIZED)
  // =========================================================

  function getEmailCandidate() {
    const fromModal = $("#verifyEmailTxt")?.textContent?.trim();
    if (fromModal) return fromModal.toLowerCase();

    const loginEmail = $("#loginEmail")?.value?.trim();
    const signupEmail = $("#signupEmail")?.value?.trim();

    if (loginEmail) return loginEmail.toLowerCase();
    if (signupEmail) return signupEmail.toLowerCase();

    try {
      const raw = localStorage.getItem("tm_user");
      if (raw) {
        const u = JSON.parse(raw);
        if (u?.email) return String(u.email).trim().toLowerCase();
      }
    } catch {}

    const any = $('input[name="email"]')?.value?.trim();
    return (any || "").toLowerCase();
  }

  // [FIXED] Added Timeout to API call to prevent long waiting if backend is down
  async function callAPI(path, payload = {}) {
    try {
      // Create a timeout controller (1.5 seconds max wait)
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1500);

      const res = await fetch(API_BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
        signal: controller.signal // Connect signal
      });
      clearTimeout(id); // Clear timeout on success

      const ok = res.ok;
      const status = res.status;
      let data = null;
      try { data = await res.json(); } catch {}
      return { ok, status, ...(data || {}) };
    } catch {
      // Offline / backend not running — allow demo routing immediately
      return { ok: true, demo: true, status: 0 };
    }
  }

  async function apiGet(path) {
    try {
      // Also add timeout for GET requests
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1000);
      
      const res = await fetch(API_BASE + path, { 
        credentials: "include",
        signal: controller.signal 
      });
      clearTimeout(id);

      let data = null;
      try { data = await res.json(); } catch {}
      return data;
    } catch {
      return null;
    }
  }

  function tmShowLoader(title, sub, small) {
    try {
      if (window.TMLoader && typeof window.TMLoader.show === "function") {
        window.TMLoader.show(title, sub, small);
      } else {
        const ov = $("#tm_loader_overlay");
        if(ov) {
            ov.innerHTML = `<div class="loader-spinner"></div><div style="color:white;margin-top:20px;text-align:center"><h3>${title}</h3><p>${sub}</p></div>`;
            ov.style.display = 'flex';
        }
      }
    } catch (e) {}
  }

  function tmHideLoader() {
    try {
      if (window.TMLoader && typeof window.TMLoader.hide === "function") {
        window.TMLoader.hide();
      } else {
        const ov = $("#tm_loader_overlay");
        if(ov) ov.style.display = 'none';
      }
    } catch (e) {}
  }

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
    } catch { return false; }
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
    location.replace(`/dashboard.html${q.toString() ? `?${q.toString()}` : ""}`);
  }

  function gotoPreferences(extraQuery) {
    const current = new URLSearchParams(location.search);
    const q = new URLSearchParams();
    if (current.get("demo")) q.set("demo", current.get("demo"));
    if (current.get("prePlan")) q.set("prePlan", current.get("prePlan"));
    const merged = mergeExtraParams(q.toString(), extraQuery);
    merged.set("onboarding", "1");
    location.replace(`/preferences.html${merged.toString() ? `?${merged.toString()}` : ""}`);
  }

  function gotoTier(extraQuery) {
    const current = new URLSearchParams(location.search);
    const q = new URLSearchParams();
    if (current.get("demo")) q.set("demo", current.get("demo"));
    if (current.get("prePlan")) q.set("prePlan", current.get("prePlan"));
    const merged = mergeExtraParams(q.toString(), extraQuery);
    merged.set("onboarding", "1");
    location.replace(`/tier.html${merged.toString() ? `?${merged.toString()}` : ""}`);
  }

  async function fetchMe() { return await apiGet("/api/me"); }

  // ---------- Sync Tab Logic (Flip)
  function setActiveTab(mode) {
    const wantLogin = String(mode).toLowerCase() !== "signup";
    const flipCard = $("#authFlipCard");
    
    if (flipCard) {
      if (wantLogin) {
        flipCard.classList.remove("flipped");
      } else {
        flipCard.classList.add("flipped");
      }
    }
    
    const tabBtns = $$("[data-tab-btn]");
    tabBtns.forEach((b) => {
      const isLogin = b.dataset.tabBtn === "login";
      b.setAttribute("aria-selected", String(isLogin === wantLogin));
      b.classList.toggle("active", isLogin === wantLogin);
    });

    setTimeout(() => {
        const focusEl = wantLogin ? $("#loginEmail") : $("#signupName");
        if(focusEl) focusEl.focus();
    }, 400); 
  }

  whenReady(() => {
    setActiveTab((getParam("mode") || "login").toLowerCase());
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
      alert("Demo password mali.");
      return true;
    }
    saveLocalUser({ email, name: d.name, plan: d.plan });
    try { await callAPI("/api/auth/login", { email, password: pass }); } catch {}
    const extra = new URLSearchParams({ demo: "1", prePlan: d.plan });
    finishLogin(extra.toString());
    return true;
  }

  // ---------- Email verification (OTP)
  async function apiSendVerificationCode(email) { return await callAPI("/api/auth/send-verification-code", { email }); }
  async function apiVerifyEmailCode(email, code) { return await callAPI("/api/auth/verify-email-code", { email, code }); }

  function safeDialogClose(dlg) {
    try { if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open"); } catch {}
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
          if (msg) msg.textContent = "Sent.";
        } catch { if (msg) msg.textContent = "Failed to send."; }
      };
    }
    if (btnClose) btnClose.onclick = () => safeDialogClose(dlg);

    const form = $("#frmVerify") || dlg.querySelector("form");
    if (form && !form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const code = String(codeInput?.value || "").trim();
        const e = String(emailTxt?.textContent || targetEmail || getEmailCandidate()).trim().toLowerCase();
        if (!e || !code) return;

        if (msg) msg.textContent = "Verifying…";
        try { tmShowLoader('Verifying code…','Finalizing'); } catch {}
        try {
          const out = await apiVerifyEmailCode(e, code);
          const ok = !!(out?.ok || out?.verified);
          if (!ok) { if (msg) msg.textContent = out?.message || "Invalid code."; return; }
          
          try {
            const raw = localStorage.getItem("tm_user");
            if (raw) {
              const u = JSON.parse(raw);
              u.emailVerified = true;
              localStorage.setItem("tm_user", JSON.stringify(u));
            }
          } catch {}

          if (msg) msg.textContent = "Verified ✅";
          safeDialogClose(dlg);
          const extra = new URLSearchParams(location.search);
          extra.delete("verify");
          gotoPreferences(extra.toString());
        } catch { if (msg) msg.textContent = "Verification failed."; }
        try { tmHideLoader(); } catch {}
      });
    }
    try { if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); } catch {}
    return true;
  }

  async function ensureVerifiedBeforeContinue(email) {
    try {
      const me = await apiGet("/api/me");
      const verified = !!(me?.user?.emailVerified);
      if (verified) return true;
      const e = (email || me?.user?.email || getEmailCandidate() || "").trim().toLowerCase();
      if (!e) return openVerifyDialog(""); 
      try { await apiSendVerificationCode(e); } catch {}
      return openVerifyDialog(e);
    } catch { return true; }
  }

  async function finishLogin(extraQuery) {
    const qs = new URLSearchParams(location.search);
    const demo = qs.get("demo") === "1";

    if (demo) {
      const prefs = hasLocalPrefs();
      if (prefs) return gotoDashboard(extraQuery);
      return gotoPreferences(extraQuery);
    }

    const resp = await fetchMe();
    const user = resp?.user;

    if (user && !user.emailVerified) {
      const e = (user.email || getEmailCandidate() || "").trim().toLowerCase();
      try { if (e) await apiSendVerificationCode(e); } catch {}
      await ensureVerifiedBeforeContinue(e);
      return;
    }

    const prefsServer = !!(user?.prefsSaved || user?.preferencesSaved);
    const prefs = prefsServer || hasLocalPrefs();

    if (prefs) return gotoDashboard(extraQuery);
    gotoPreferences(extraQuery);
  }

  whenReady(() => {
    try {
      const usp = new URLSearchParams(location.search);
      if (usp.get("verify") === "1") {
        const emailGuess = getEmailCandidate();
        setTimeout(() => { ensureVerifiedBeforeContinue(emailGuess); }, 60);
      }
    } catch {}
  });

  // ---------- Sign up form
  whenReady(() => {
    const signupForm = $("#signupForm");
    if (!signupForm || signupForm.dataset.tmBound === "1") return;
    signupForm.dataset.tmBound = "1";

    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(signupForm);
      try { tmShowLoader('Creating account…','Securing session'); } catch {}
      try {
        const payload = Object.fromEntries(fd.entries());
        // Backend expects `name` for full name
        payload.name = payload.name || payload.fullName || '';
        try { delete payload.fullName; } catch (e) {}

        const out = await callAPI("/api/auth/register", payload);
        const ok = !!(out?.ok || out?.created || out?.status === 200 || out?.status === 201 || out?.demo);

        if (!ok) {
          alert(out?.message || "Signup failed.");
          return;
        }

        // AUTO FLIP BACK TO LOGIN
        setActiveTab("login");
        setParam("mode", "login");
        const email = String(payload.email || "").trim();
        if (email && $("#loginEmail")) $("#loginEmail").value = email;
      } finally { try { tmHideLoader(); } catch {} }
    });
  });

  // ---------- Login form
  whenReady(() => {
    const loginForm = $("#loginForm");
    if (!loginForm || loginForm.dataset.tmBound === "1") return;
    loginForm.dataset.tmBound = "1";

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try { tmShowLoader('Signing in…','Checking credentials'); } catch {}
      try {
        const email = String($("#loginEmail")?.value || "").trim();
        const password = String($("#loginPass")?.value || "").trim();

        if (await tryDemoLogin(email, password)) return;

        const res = await callAPI("/api/auth/login", { email, password });
        const offline = !!(res && (res.demo || res.status === 0));
        const ok = !!(res && (res.ok || offline));

        if (!ok) {
          alert(res?.message || "Login failed.");
          return;
        }

        saveLocalUser(res.user || { email, name: email.split("@")[0] || "User" });
        const extra = new URLSearchParams();
        if (offline) extra.set("demo", "1");
        finishLogin(extra.toString());
      } finally { try { tmHideLoader(); } catch {} }
    });
  });

  // ---------- Google button
  whenReady(() => {
    const googleBtn = $("#btnGoogleLogin");
    if (!googleBtn || googleBtn.dataset.tmBound === "1") return;
    googleBtn.dataset.tmBound = "1";

    googleBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try { tmShowLoader('Signing in…','Opening Google'); } catch {}
      try {
        const r = await callAPI("/api/auth/oauth/mock", { provider: "google" });
        saveLocalUser(r?.user || { email: "google@demo.local", name: "Google User" });
        const extra = new URLSearchParams();
        if (r?.demo || r?.status === 0) extra.set("demo", "1");
        finishLogin(extra.toString());
      } finally { try { tmHideLoader(); } catch {} }
    });
  });
})();