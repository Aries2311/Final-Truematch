// dashboard-nav.js
(function () {
  function initDashboardNav() {
    const tabbar = document.getElementById('tabbar');
    if (!tabbar) return;

    const tabs = Array.from(tabbar.querySelectorAll('.tab'));
    if (!tabs.length) return;

    const panels = Array.from(
      document.querySelectorAll('section.panel[data-panel]')
    );
    const panelsById = new Map(
      panels.map(p => [p.dataset.panel, p])
    );

    function showPanel(panelId) {
      if (!panelId) return;

      // Toggle active class sa tabs
      tabs.forEach(tab => {
        const isActive = tab.dataset.panel === panelId;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      // Show/hide panels
      panelsById.forEach((panelEl, id) => {
        panelEl.hidden = id !== panelId;
      });

      // Optional: scroll to top ng main content scroll container
      const scroller = document.querySelector('.dash-content-scroll');
      if (scroller) scroller.scrollTop = 0;
    }

    // Bind click sa lahat ng tabs
    tabs.forEach(tab => {
      tab.addEventListener('click', evt => {
        evt.preventDefault();
        const panelId = tab.dataset.panel;
        if (!panelId) return;
        showPanel(panelId);
      });
    });

    // Initial active tab (yung may .is-active or first tab)
    const initialTab =
      tabs.find(t => t.classList.contains('is-active')) || tabs[0];

    if (initialTab) {
      const initialId = initialTab.dataset.panel;
      showPanel(initialId);
    }
  }

  function initLogoutButton() {
    const btn = document.getElementById('btn-logout');
    if (!btn) return;

    btn.addEventListener('click', async evt => {
      evt.preventDefault();

      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'Logging out…';

      const tries = ['/api/auth/logout', '/api/logout', '/logout'];

      for (const url of tries) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            credentials: 'include',
          });
          if (res && res.ok) break;
        } catch (err) {
          console.error('[tm-nav] logout error:', err);
        }
      }

      // Redirect back to landing/login
      window.location.href = '/';
      // (In case di nag-redirect, ibalik text)
      btn.textContent = originalText;
      btn.disabled = false;
    });
  }

  function bootNav() {
    initDashboardNav();
    initLogoutButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootNav);
  } else {
    bootNav();
  }
})();
