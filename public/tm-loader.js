// tm-loader.js
(function () {
  const STYLE_ID = "tm_loader_style";
  const OVERLAY_ID = "tm_loader_overlay";

  function ensure() {
    if (!document.getElementById(STYLE_ID)) {
      const s = document.createElement("style");
      s.id = STYLE_ID;
      s.textContent = `
        html.tm-has-loader,
        body.tm-has-loader {
          overflow: hidden !important;
        }

        /* Fullscreen dark overlay */
        #${OVERLAY_ID} {
          position: fixed;
          inset: 0;
          z-index: 99999;
          display: none;
          background: rgba(0, 0, 0, .55);
          backdrop-filter: blur(6px);
        }

        #${OVERLAY_ID}.show {
          display: block;
        }

        /* Card is locked to exact center of viewport */
        #${OVERLAY_ID} .tm_loader_card {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: min(420px, 92vw);
          padding: 22px 18px;
          border-radius: 16px;
          background: rgba(15, 15, 18, .80);
          border: 1px solid rgba(255, 255, 255, .14);
          box-shadow: 0 10px 35px rgba(0, 0, 0, .55);
          text-align: center;
          color: #fff;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        }

        .tm_spinner {
          width: 40px;
          height: 40px;
          margin: 0 auto 12px;
          border-radius: 50%;
          border: 3px solid rgba(255, 255, 255, .18);
          border-top-color: rgba(255, 255, 255, .95);
          animation: tmSpin 0.9s linear infinite;
        }

        @keyframes tmSpin {
          to { transform: rotate(360deg); }
        }

        .tm_loader_title {
          font-size: 15px;
          font-weight: 700;
          margin: 0 0 6px;
        }

        .tm_loader_sub {
          font-size: 13px;
          opacity: .85;
          margin: 0;
        }

        .tm_loader_small {
          font-size: 12px;
          opacity: .75;
          margin-top: 10px;
        }
      `;
      document.head.appendChild(s);
    }

    if (!document.getElementById(OVERLAY_ID)) {
      const d = document.createElement("div");
      d.id = OVERLAY_ID;
      d.innerHTML = `
        <div class="tm_loader_card">
          <div class="tm_spinner"></div>
          <p class="tm_loader_title" id="tm_loader_title">Loading…</p>
          <p class="tm_loader_sub" id="tm_loader_sub">Please wait.</p>
          <p class="tm_loader_small" id="tm_loader_small" style="display:none;"></p>
        </div>
      `;
      document.body.appendChild(d);
    }
  }

  function doHide() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.classList.remove("show");
    document.documentElement.classList.remove("tm-has-loader");
    document.body.classList.remove("tm-has-loader");
  }

  window.TMLoader = {
    show(title = "Loading…", sub = "Please wait.", small = "") {
      ensure();
      document.getElementById("tm_loader_title").textContent = title;
      document.getElementById("tm_loader_sub").textContent = sub;
      const sm = document.getElementById("tm_loader_small");
      if (small) {
        sm.style.display = "block";
        sm.textContent = small;
      } else {
        sm.style.display = "none";
        sm.textContent = "";
      }
      const overlay = document.getElementById(OVERLAY_ID);
      overlay.classList.add("show");
      document.documentElement.classList.add("tm-has-loader");
      document.body.classList.add("tm-has-loader");
    },
    hide() {
      doHide();
    }
  };

  // ---------- Auto-hide on browser back / history navigation ----------
  function autoHideOnReturn() {
    // Safely hide loader if it was left visible (e.g., after navigation to Coinbase then Back)
    try {
      doHide();
    } catch (e) {
      console.warn("[TM] autoHideOnReturn error", e);
    }
  }

  // Fired when page is shown again, including from bfcache (back/forward)
  window.addEventListener("pageshow", autoHideOnReturn);

  // Extra safety for SPA-style history changes (if ever used later)
  window.addEventListener("popstate", autoHideOnReturn);
  window.addEventListener("hashchange", autoHideOnReturn);
})();
