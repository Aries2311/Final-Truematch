// premium-society.js
import { apiGet, apiPost } from './tm-api.js';

const DOM = {
  // Global
  btnBack: document.getElementById('btnBack'),
  pageTitle: document.getElementById('pageTitle'),
  
  // Tabs
  tabOverview: document.getElementById('tabOverview'),
  tabApply: document.getElementById('tabApply'),
  tabReview: document.getElementById('tabReview'),
  tabLounge: document.getElementById('tabLounge'),

  // Icons
  iconApply: document.getElementById('iconApply'),
  iconReview: document.getElementById('iconReview'),
  iconLounge: document.getElementById('iconLounge'),
  sidebarRoleLabel: document.getElementById('sidebarRoleLabel'),

  // Views
  viewOverview: document.getElementById('viewOverview'),
  viewApply: document.getElementById('viewApply'),
  viewReview: document.getElementById('viewReview'),
  viewLounge: document.getElementById('viewLounge'),

  // Profile
  btnProfileToggle: document.getElementById('btnProfileToggle'),
  profileMenu: document.getElementById('profileMenu'),

  // Form
  frm: document.getElementById('frmPremiumApply'),
  fullName: document.getElementById('fullName'),
  age: document.getElementById('age'),
  occupation: document.getElementById('occupation'),
  finance: document.getElementById('finance'),
  btnSubmitApply: document.getElementById('btnSubmitApply'),
  applyError: document.getElementById('applyError'),

  // Chat & Misc
  btnRefresh: document.getElementById('btnRefresh'),
  txtConcierge: document.getElementById('txtConcierge'),
  btnSendConcierge: document.getElementById('btnSendConcierge'),
  chatBody: document.getElementById('chatBody'),
  pendingWhen: document.getElementById('pendingWhen'),
  btnHeroApply: document.getElementById('btnHeroApply'),
  globalLoader: document.getElementById('globalLoader')
};

// ---------------------------------------------------------
// ANIMATION TRIGGER
// ---------------------------------------------------------
function triggerAnimations(container) {
  const elements = container.querySelectorAll('.reveal-up, .reveal-left, .reveal-right, .reveal-down');
  elements.forEach(el => {
    el.classList.remove('is-visible'); 
    void el.offsetWidth; 
    el.classList.add('is-visible'); 
  });
}

// ---------------------------------------------------------
// 1. VIEW SWITCHING
// ---------------------------------------------------------

window.switchView = function(viewName) {
  // Hide all
  DOM.viewOverview.hidden = true;
  DOM.viewApply.hidden = true;
  DOM.viewReview.hidden = true;
  DOM.viewLounge.hidden = true;
  if(DOM.globalLoader) DOM.globalLoader.hidden = true;

  // Deactivate Tabs
  DOM.tabOverview.classList.remove('active');
  DOM.tabApply.classList.remove('active');
  DOM.tabReview.classList.remove('active');
  DOM.tabLounge.classList.remove('active');

  let activeView = null;

  switch(viewName) {
    case 'overview':
      DOM.viewOverview.hidden = false;
      DOM.tabOverview.classList.add('active');
      DOM.pageTitle.textContent = 'Overview';
      activeView = DOM.viewOverview;
      break;
    case 'apply':
      DOM.viewApply.hidden = false;
      DOM.tabApply.classList.add('active');
      DOM.pageTitle.textContent = 'Application';
      activeView = DOM.viewApply;
      break;
    case 'review':
      DOM.viewReview.hidden = false;
      DOM.tabReview.classList.add('active');
      DOM.pageTitle.textContent = 'Status Review';
      activeView = DOM.viewReview;
      break;
    case 'lounge':
      DOM.viewLounge.hidden = false;
      DOM.tabLounge.classList.add('active');
      DOM.pageTitle.textContent = 'The Lounge';
      activeView = DOM.viewLounge;
      setTimeout(() => scrollToBottom(), 100);
      break;
  }

  if(activeView) triggerAnimations(activeView);
};

// ---------------------------------------------------------
// 2. UNLOCKED ACCESS LOGIC (STRICT SECURITY RESTORED)
// ---------------------------------------------------------

function updateSidebarVisuals(status) {
  const setIcon = (el, iconClass) => { if(el) el.innerHTML = `<i class="${iconClass}"></i>`; };

  if (status === 'locked') {
    setIcon(DOM.iconApply, 'fa-solid fa-arrow-right');
    setIcon(DOM.iconReview, 'fa-solid fa-lock');
    setIcon(DOM.iconLounge, 'fa-solid fa-lock');
    if(DOM.sidebarRoleLabel) DOM.sidebarRoleLabel.textContent = "Guest";
  } 
  else if (status === 'pending') {
    setIcon(DOM.iconApply, 'fa-solid fa-check');
    setIcon(DOM.iconReview, 'fa-solid fa-clock');
    setIcon(DOM.iconLounge, 'fa-solid fa-lock');
    if(DOM.sidebarRoleLabel) DOM.sidebarRoleLabel.textContent = "Pending";
  } 
  else if (status === 'approved') {
    setIcon(DOM.iconApply, 'fa-solid fa-check');
    setIcon(DOM.iconReview, 'fa-solid fa-check');
    setIcon(DOM.iconLounge, 'fa-solid fa-crown');
    if(DOM.sidebarRoleLabel) DOM.sidebarRoleLabel.textContent = "Member";
    if(DOM.sidebarRoleLabel) DOM.sidebarRoleLabel.style.color = "#00ff88";
  }
}

function setSidebarAccess(status) {
  updateSidebarVisuals(status);

  // --- STRICT SECURITY LOGIC ---
  
  // Reset: Disable protected areas by default
  DOM.tabApply.disabled = false; 
  DOM.tabReview.disabled = true; 
  DOM.tabLounge.disabled = true;

  // Visual Reset
  DOM.tabReview.classList.remove('disabled-tab');
  DOM.tabLounge.classList.remove('disabled-tab');

  if (status === 'locked') {
    // GUEST: Can Apply, Cannot access Status/Lounge
    DOM.tabReview.classList.add('disabled-tab');
    DOM.tabLounge.classList.add('disabled-tab');
  } 
  else if (status === 'pending') {
    // PENDING: Cannot Apply again, Can see Review, Cannot see Lounge
    DOM.tabApply.disabled = true; 
    DOM.tabReview.disabled = false; 
    DOM.tabLounge.disabled = true;
    DOM.tabLounge.classList.add('disabled-tab');
  } 
  else if (status === 'approved') {
    // MEMBER: Access Lounge!
    DOM.tabApply.disabled = true; 
    DOM.tabReview.disabled = true; 
    DOM.tabLounge.disabled = false;
  }

  // Auto-Redirect Logic
  if (!window.hasSwitched) {
    if (status === 'locked') {
       switchView('overview');
    } else if (status === 'pending') {
       switchView('review');
    } else if (status === 'approved') {
       switchView('lounge');
    }
    window.hasSwitched = true;
  }
}

// ---------------------------------------------------------
// 3. BACKEND INTEGRATION
// ---------------------------------------------------------

function normalizeStatus(val) { return String(val || '').trim().toLowerCase(); }

function computePremiumState(user) {
  const plan = normalizeStatus(user?.plan);
  const planActive = !!user?.planActive;
  const premiumStatus = normalizeStatus(user?.premiumStatus);

  const approved = (plan === 'tier3' && planActive) || premiumStatus === 'approved';
  const pending = premiumStatus === 'pending';

  return { approved, pending };
}

async function refreshStatus() {
  if(DOM.globalLoader) DOM.globalLoader.hidden = false;

  try {
    const res = await apiGet('/api/me');
    if(DOM.globalLoader) DOM.globalLoader.hidden = true;

    if (!res?.ok) {
      setSidebarAccess('locked');
      return;
    }

    const user = res.user || {};
    const s = computePremiumState(user);

    if (s.approved) {
      setSidebarAccess('approved');
    } else if (s.pending) {
      if (DOM.pendingWhen) DOM.pendingWhen.textContent = new Date(user?.premiumApplication?.appliedAt || Date.now()).toLocaleDateString();
      setSidebarAccess('pending');
    } else {
      setSidebarAccess('locked');
    }

  } catch (err) {
    console.error('API Error', err);
    setSidebarAccess('locked');
    if(DOM.globalLoader) DOM.globalLoader.hidden = true;
  }
}

async function submitApplication(e) {
  e.preventDefault();
  DOM.applyError.hidden = true;
  DOM.btnSubmitApply.disabled = true;
  DOM.btnSubmitApply.textContent = 'Submitting...';

  const payload = {
    fullName: DOM.fullName.value,
    age: Number(DOM.age.value),
    occupation: DOM.occupation.value,
    finance: DOM.finance.value
  };

  try {
    const res = await apiPost('/api/me/premium/apply', payload);
    if (!res?.ok) throw new Error(res.message || 'Error');

    await refreshStatus();
    switchView('review');

  } catch (err) {
    DOM.applyError.hidden = false;
    DOM.applyError.textContent = err.message || 'Failed to submit.';
  } finally {
    DOM.btnSubmitApply.disabled = false;
    DOM.btnSubmitApply.textContent = 'Submit Application';
  }
}

// ---------------------------------------------------------
// 4. CHAT FUNCTIONALITY
// ---------------------------------------------------------

function scrollToBottom() {
  if(DOM.chatBody) {
    DOM.chatBody.scrollTop = DOM.chatBody.scrollHeight;
  }
}

function setupConciergeDraft() {
  const key = 'tm_concierge_draft';
  const txt = DOM.txtConcierge;
  const btn = DOM.btnSendConcierge;

  // Handle Enter (Send) vs Shift+Enter (New Line)
  if(txt) {
    txt.addEventListener("keydown", function(event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault(); // Prevent default new line
        btn.click(); // Trigger send
      }
    });
  }

  if(btn) {
    btn.onclick = () => {
      const msg = txt?.value;
      if(msg && msg.trim() !== "") {
        localStorage.setItem(key, msg);
        
        // Add visual bubble
        const bubble = document.createElement('div');
        bubble.className = 'msg-row msg-outgoing';
        
        const bubbleContent = document.createElement('div');
        bubbleContent.className = 'msg-bubble';
        bubbleContent.innerText = msg; // Safe text insertion
        
        const meta = document.createElement('div');
        meta.className = 'msg-meta';
        meta.innerText = 'Just now';

        bubble.appendChild(bubbleContent);
        bubble.appendChild(meta);
        
        if(DOM.chatBody) {
          DOM.chatBody.appendChild(bubble);
          setTimeout(() => scrollToBottom(), 50); 
        }
        
        txt.value = ""; // Clear input
      }
    };
  }
}

function setupProfileToggle() {
  if (DOM.btnProfileToggle) {
    DOM.btnProfileToggle.onclick = () => {
      DOM.profileMenu.classList.toggle('show');
      DOM.btnProfileToggle.querySelector('.chevron').classList.toggle('fa-rotate-180');
    };
  }
}

// ---------------------------------------------------------
// 5. PERKS TOGGLE LOGIC
// ---------------------------------------------------------
function setupPerksToggle() {
  const perks = document.querySelectorAll('.perk-pill, .perk-item');
  perks.forEach(p => {
    p.addEventListener('click', () => {
      p.classList.toggle('active');
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (DOM.btnBack) DOM.btnBack.onclick = () => window.location.href = 'dashboard.html';
  if (DOM.btnRefresh) DOM.btnRefresh.onclick = refreshStatus;
  if (DOM.frm) DOM.frm.addEventListener('submit', submitApplication);
  
  setupProfileToggle();
  setupConciergeDraft();
  setupPerksToggle();
  await refreshStatus();
});