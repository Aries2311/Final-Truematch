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

  // Views
  viewOverview: document.getElementById('viewOverview'),
  viewApply: document.getElementById('viewApply'),
  viewReview: document.getElementById('viewReview'),
  viewLounge: document.getElementById('viewLounge'),

  // Profile
  btnProfileToggle: document.getElementById('btnProfileToggle'),
  profileMenu: document.getElementById('profileMenu'),

  // Form Inputs
  frm: document.getElementById('frmPremiumApply'),
  fullName: document.getElementById('fullName'),
  age: document.getElementById('age'),
  occupation: document.getElementById('occupation'),
  finance: document.getElementById('finance'),
  btnSubmitApply: document.getElementById('btnSubmitApply'),
  applyError: document.getElementById('applyError'),

  // Misc
  btnRefresh: document.getElementById('btnRefresh'),
  txtConcierge: document.getElementById('txtConcierge'),
  btnSendConcierge: document.getElementById('btnSendConcierge'),
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
    void el.offsetWidth; // Force Reflow
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

  // Activate
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
      break;
  }

  if(activeView) triggerAnimations(activeView);
};

// ---------------------------------------------------------
// 2. UNLOCKED ACCESS LOGIC
// ---------------------------------------------------------

function setSidebarAccess(status) {
  // Always unlocked for dev/design purposes as requested
  DOM.tabApply.disabled = false;
  DOM.tabReview.disabled = false;
  DOM.tabLounge.disabled = false;

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
// 4. INIT
// ---------------------------------------------------------

function setupProfileToggle() {
  if (DOM.btnProfileToggle) {
    DOM.btnProfileToggle.onclick = () => {
      DOM.profileMenu.classList.toggle('show');
      DOM.btnProfileToggle.querySelector('.chevron').classList.toggle('fa-rotate-180');
    };
  }
}

function setupConciergeDraft() {
  const key = 'tm_concierge_draft';
  if(DOM.btnSendConcierge) {
    DOM.btnSendConcierge.onclick = () => {
      if(DOM.txtConcierge?.value) localStorage.setItem(key, DOM.txtConcierge.value);
      alert('Request sent to Concierge (Demo).');
    };
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (DOM.btnBack) DOM.btnBack.onclick = () => window.location.href = 'dashboard.html';
  if (DOM.btnRefresh) DOM.btnRefresh.onclick = refreshStatus;
  if (DOM.frm) DOM.frm.addEventListener('submit', submitApplication);
  
  setupProfileToggle();
  setupConciergeDraft();
  await refreshStatus();
});