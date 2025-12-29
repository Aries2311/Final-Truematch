// ---------------------------------------------------------------------
// TrueMatch Dashboard – main client-side controller
// ---------------------------------------------------------------------

import { getLocalPlan, saveLocalUser } from './tm-session.js';
// [FIX] Added apiPost to imports
import { apiGet, apiPost, apiUpdateProfile, apiSavePrefs } from './tm-api.js';

// ---------------------------------------------------------------------
// 1. Global state + DOM cache
// ---------------------------------------------------------------------

const state = {
  me: null,
  prefs: null, 
  plan: 'free',
  activeTab: 'home',

  // Usage / quotas
  usage: {
    swipesRemaining: 20,
    swipesLimit: 20,
    shortlistCount: 0,
    shortlistLimit: 5,
    approvedCount: 0,
    datesCount: 0
  },
  isLoading: false,
};

const DOM = {
  tabs: null,
  tabPanels: null,
  headerName: null,
  headerEmail: null,
  headerPlanBadge: null,
  headerAvatar: null,
  homeWelcomeName: null,
  homePlanPill: null,
  homePlanSummary: null,
  homeAccountList: null,
  kpiRemaining: null,        
  kpiShortlistTotal: null,   
  kpiShortlistApproved: null,
  kpiDates: null,            
  swipeStack: null,
  swipeEmpty: null,
  swipeControls: null,
  btnSwipePass: null,
  btnSwipeLike: null,
  btnRefreshSwipe: null,
  sAvatar: null,
  sNameDisplay: null,
  sEmailDisplay: null,
  dispCity: null,
  dispAge: null,
  dispEthnicity: null,
  dispLooking: null,
  btnEditProfile: null,
  btnChangePassword: null,
  btnLogoutPanel: null,
  dlgProfile: null,
  frmProfile: null,
  btnCloseProfile: null,
  btnCancelProfile: null,
  inpName: null,
  inpEmail: null,
  inpCity: null,
  inpUserAge: null,
  inpAvatarFile: null,
  previewAvatar: null,
  inpAgeMin: null,
  inpAgeMax: null,
  inpEthnicity: null,
  inpLooking: null,
  dlgPassword: null,
  frmPassword: null,
  btnCancelPassword: null,
  creatorStateNone: null,
  creatorStatePending: null,
  creatorStateApproved: null,
  btnOpenCreatorApply: null,
  dlgCreatorApply: null,
  frmCreatorApply: null,
  btnCloseCreatorApply: null,
  creatorsPaywall: null,
  creatorsUnlocked: null,
  btnSubscribeCreators: null,
  premiumStateNone: null,
  premiumStatePending: null,
  premiumStateApproved: null,
  btnOpenPremiumApply: null,
  dlgPremiumApply: null,
  frmPremiumApply: null,
  btnPremiumCancel: null,
  logoutBtn: null,
  errorBanner: null,
  loadingOverlay: null,
  toast: null,
  matchesContainer: null,
};

// ---------------------------------------------------------------------
// 2. Helpers
// ---------------------------------------------------------------------

function cacheDom() {
  DOM.tabs = document.querySelectorAll('.tab[data-panel], .nav-btn[data-panel], [data-panel]:not(.panel)');
  DOM.tabPanels = document.querySelectorAll('.panel[data-panel]');
  DOM.matchesContainer = document.getElementById('matchesContainer');
  
  DOM.headerName = document.querySelector('[data-me-name]');
  DOM.headerEmail = document.querySelector('[data-me-email]');
  DOM.headerPlanBadge = document.querySelector('[data-me-plan]');
  DOM.headerAvatar = document.querySelector('[data-me-avatar]');

  DOM.homeWelcomeName = document.getElementById('homeWelcomeName');
  DOM.homePlanPill = document.getElementById('homePlanPill');
  DOM.homePlanSummary = document.getElementById('homePlanSummary');
  DOM.homeAccountList = document.getElementById('homeAccountList');

  // KPIs
  DOM.kpiRemaining = document.querySelector('[data-kpi="remaining"] h3') || document.querySelector('[data-kpi="remaining"]');
  DOM.kpiShortlistTotal = document.querySelector('[data-kpi="shortlist"] h3') || document.getElementById('kpiShortlistTotal'); 
  DOM.kpiShortlistApproved = document.querySelector('[data-kpi="shortlist-approved"] h3');
  DOM.kpiDates = document.querySelector('[data-kpi="dates"] h3');

  // Swipe
  DOM.swipeStack = document.getElementById('swipeStack');
  DOM.swipeEmpty = document.getElementById('swipeEmpty');
  DOM.swipeControls = document.getElementById('swipeControls');
  DOM.btnSwipePass = document.getElementById('btnSwipePass');
  DOM.btnSwipeLike = document.getElementById('btnSwipeLike');
  DOM.btnRefreshSwipe = document.getElementById('btnRefreshSwipe');

  // Settings
  DOM.sAvatar = document.getElementById('sAvatar');
  DOM.sNameDisplay = document.getElementById('sNameDisplay');
  DOM.sEmailDisplay = document.getElementById('sEmailDisplay');
  DOM.dispCity = document.getElementById('dispCity');
  DOM.dispAge = document.getElementById('dispAge');
  DOM.dispEthnicity = document.getElementById('dispEthnicity');
  DOM.dispLooking = document.getElementById('dispLooking');
  DOM.btnEditProfile = document.getElementById('btnEditProfile');
  DOM.btnChangePassword = document.getElementById('btnChangePassword');
  DOM.btnLogoutPanel = document.getElementById('btn-logout-panel');

  // Modals
  DOM.dlgProfile = document.getElementById('dlgProfile');
  DOM.frmProfile = document.getElementById('frmProfile');
  DOM.btnCloseProfile = document.getElementById('btnCloseProfile');
  DOM.btnCancelProfile = document.getElementById('btnCancelProfile');
  DOM.inpName = document.getElementById('inpName');
  DOM.inpEmail = document.getElementById('inpEmail');
  DOM.inpCity = document.getElementById('inpCity');
  DOM.inpUserAge = document.getElementById('inpUserAge'); 
  DOM.inpAvatarFile = document.getElementById('inpAvatarFile'); 
  DOM.previewAvatar = document.getElementById('previewAvatar'); 
  DOM.inpAgeMin = document.getElementById('inpAgeMin');
  DOM.inpAgeMax = document.getElementById('inpAgeMax');
  DOM.inpEthnicity = document.getElementById('inpEthnicity');
  DOM.inpLooking = document.getElementById('inpLooking');

  DOM.dlgPassword = document.getElementById('dlgPassword');
  DOM.frmPassword = document.getElementById('frmPassword');
  DOM.btnCancelPassword = document.getElementById('btnCancelPassword');

  DOM.creatorStateNone = document.getElementById('creatorStateNone');
  DOM.creatorStatePending = document.getElementById('creatorStatePending');
  DOM.creatorStateApproved = document.getElementById('creatorStateApproved');
  DOM.btnOpenCreatorApply = document.getElementById('btnOpenCreatorApply');
  DOM.dlgCreatorApply = document.getElementById('dlgCreatorApply');
  DOM.frmCreatorApply = document.getElementById('frmCreatorApply');
  DOM.btnCloseCreatorApply = document.getElementById('btnCloseCreatorApply');
  DOM.creatorsPaywall = document.getElementById('creatorsPaywall');
  DOM.creatorsUnlocked = document.getElementById('creatorsUnlocked');
  DOM.btnSubscribeCreators = document.getElementById('btnSubscribeCreators');

  DOM.premiumStateNone = document.getElementById('premiumStateNone');
  DOM.premiumStatePending = document.getElementById('premiumStatePending');
  DOM.premiumStateApproved = document.getElementById('premiumStateApproved');
  DOM.btnOpenPremiumApply = document.getElementById('btnOpenPremiumApply');
  DOM.dlgPremiumApply = document.getElementById('dlgPremiumApply');
  DOM.frmPremiumApply = document.getElementById('frmPremiumApply');
  DOM.btnPremiumCancel = document.getElementById('btnPremiumCancel');

  DOM.logoutBtn = document.querySelector('[data-action="logout"]') || document.getElementById('btn-logout');
  DOM.errorBanner = document.querySelector('[data-error-banner]');
  DOM.loadingOverlay = document.querySelector('[data-loading-overlay]');
  DOM.toast = document.getElementById('tm-toast');
}

function showToast(msg) {
  const el = DOM.toast || document.getElementById('tm-toast');
  if(!el) return;
  el.textContent = msg;
  el.classList.add('toast--visible');
  setTimeout(() => el.classList.remove('toast--visible'), 3000);
}

function setText(el, value) {
  if (!el) return;
  el.textContent = value == null ? '' : String(value);
}

function safeNumber(n, fallback = 0) {
  if (typeof n === 'number' && Number.isFinite(n)) return n;
  const parsed = Number(n);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePlanKey(rawPlan) {
  if (!rawPlan) return 'free';
  const p = String(rawPlan).toLowerCase().replace(/\s+/g, '');
  if (p.includes('plus') || p.includes('tier1')) return 'tier1';
  if (p.includes('elite') || p.includes('tier2')) return 'tier2';
  if (p.includes('concierge') || p.includes('tier3')) return 'tier3';
  return 'free';
}

// ---------------------------------------------------------------------
// 3. Nav Gating
// ---------------------------------------------------------------------

const NAV_RULES = {
  free: ['home', 'matches', 'swipe', 'creators', 'premium', 'settings'],
  tier1: ['home', 'matches', 'swipe', 'creators', 'premium', 'settings'],
  tier2: ['home', 'matches', 'shortlist', 'approved', 'swipe', 'creators', 'premium', 'settings'],
  tier3: ['home', 'matches', 'shortlist', 'approved', 'confirmed', 'swipe', 'creators', 'premium', 'settings'],
};

function applyPlanNavGating() {
  const key = normalizePlanKey(state.plan);
  const allowed = new Set(NAV_RULES[key] || NAV_RULES.free);
  
  if (DOM.tabs) {
    DOM.tabs.forEach((btn) => {
      const target = btn.dataset.panel;
      if (!target) return;
      if (allowed.has(target)) {
         btn.style.display = '';
         btn.style.visibility = 'visible';
         btn.classList.remove('hidden');
      } else {
         btn.style.setProperty('display', 'none', 'important');
         btn.style.setProperty('visibility', 'hidden', 'important');
         btn.classList.add('hidden');
      }
    });
  }

  if (DOM.tabPanels) {
    DOM.tabPanels.forEach((panel) => {
      const name = panel.dataset.panel;
      if (!name) return;
      if (!allowed.has(name)) {
        panel.style.display = 'none';
        panel.hidden = true;
      } else if (state.activeTab === name) {
        panel.style.display = '';
        panel.hidden = false;
      }
    });
  }

  if (!allowed.has(state.activeTab)) setActiveTab('home');
}

// ---------------------------------------------------------------------
// 4. Swipe Controller
// ---------------------------------------------------------------------

const SwipeController = (() => {
  let profiles = [];
  let currentIndex = 0;
  let isLoading = false;

  async function init() {
    await loadCandidates();
  }

  async function loadCandidates(isRefresh = false) {
    if (isLoading) return;
    isLoading = true;

    if (DOM.swipeEmpty) DOM.swipeEmpty.hidden = true;
    if (DOM.swipeStack) DOM.swipeStack.innerHTML = '<div class="loader-dot"></div><div class="loader-dot"></div><div class="loader-dot"></div>';

    try {
      const c = await apiGet('/api/swipe/candidates');
      
      if (c.limitReached) {
         profiles = [];
         if(DOM.swipeStack) DOM.swipeStack.innerHTML = '';
         if(DOM.swipeEmpty) {
            DOM.swipeEmpty.hidden = false;
            DOM.swipeEmpty.innerHTML = `
              <div class="swipe-empty__icon">🛑</div>
              <h3>Daily Limit Reached</h3>
              <p class="muted">You reached your daily limit of swipes.</p>
              <button class="btn btn--primary" onclick="window.location.href='tier.html?upgrade=1'">Upgrade to Unlimited</button>
            `;
            if(DOM.swipeControls) DOM.swipeControls.style.display = 'none';
         }
      } 
      else if (c.candidates && c.candidates.length > 0) {
        profiles = c.candidates;
        currentIndex = 0;
        renderCards();
      } 
      else {
        profiles = [];
        if(DOM.swipeStack) DOM.swipeStack.innerHTML = '';
        if(DOM.swipeEmpty) {
           DOM.swipeEmpty.hidden = false;
           DOM.swipeEmpty.innerHTML = `
             <div class="swipe-empty__icon">✨</div>
             <h3>That's everyone!</h3>
             <p class="muted">Check back later for more profiles.</p>
             <button class="btn btn--primary" onclick="location.reload()">Refresh Profiles</button>
           `;
           if(DOM.swipeControls) DOM.swipeControls.style.display = 'none';
        }
      }
    } catch (err) {
      console.error(err);
      if (DOM.swipeStack) DOM.swipeStack.innerHTML = '<p class="text-center text-danger">Error loading profiles.</p>';
    } finally {
      isLoading = false;
    }
  }

  function renderCards() {
    if (!DOM.swipeStack) return;
    DOM.swipeStack.innerHTML = '';

    if (currentIndex >= profiles.length) {
      if (DOM.swipeEmpty) DOM.swipeEmpty.hidden = false;
      if (DOM.swipeControls) DOM.swipeControls.style.display = 'none';
      return;
    } else {
      if (DOM.swipeEmpty) DOM.swipeEmpty.hidden = true;
      if (DOM.swipeControls) DOM.swipeControls.style.display = 'flex';
    }

    const cardLimit = 2;
    const cardsToRender = profiles.slice(currentIndex, currentIndex + cardLimit).reverse();

    cardsToRender.forEach((p, idx) => {
      const isTop = idx === cardsToRender.length - 1; 
      const card = document.createElement('div');
      card.className = 'swipe-card';
      const img = p.photoUrl || 'assets/images/truematch-mark.png';
      card.style.backgroundImage = `url('${img}')`;
      
      if (!isTop) {
        card.style.transform = 'scale(0.95) translateY(10px)';
        card.style.opacity = '0.5';
        card.style.zIndex = '1';
      } else {
        card.id = 'activeSwipeCard';
        card.style.zIndex = '2';
      }

      card.innerHTML = `
        <div class="swipe-card__info">
          <h2>${p.name} <span>${p.age || ''}</span></h2>
          <p>📍 ${p.city || ''}</p>
        </div>
      `;
      DOM.swipeStack.appendChild(card);
    });
  }

  async function handleAction(action) {
    if (currentIndex >= profiles.length) return;
    const profile = profiles[currentIndex];
    const card = document.getElementById('activeSwipeCard');
    
    if (card) {
      if (action === 'pass') card.classList.add('swipe-out-left');
      else card.classList.add('swipe-out-right');
    }

    try {
        // [FIX] USE apiPost INSTEAD OF apiGet
        const res = await apiPost('/api/swipe/action', { targetId: profile.id, type: action });
        
        if (res.limitReached) {
            showToast("Daily limit reached!");
            profiles = [];
            loadCandidates(); 
            return;
        }

        if(res && res.remaining != null) updateSwipesUI(res.remaining);
        if (res && res.ok && res.match) showToast(`It's a Match with ${profile.name}!`);
    } catch(e) { console.error('Swipe action failed', e); }

    setTimeout(() => {
      currentIndex++;
      renderCards();
    }, 250); 
  }

  function updateSwipesUI(remaining) {
      if(DOM.kpiRemaining) {
          DOM.kpiRemaining.textContent = `${remaining} / 20`;
      }
  }

  return { 
    init, 
    pass: () => handleAction('pass'), 
    like: () => handleAction('like') 
  };
})();
  
// ---------------------------------------------------------------------
// 5. Rendering
// ---------------------------------------------------------------------

function renderUserHeader(user) {
  if (!user) return;
  const name = user.name || user.email || 'Member';
  const email = user.email || '';
  const planKey = normalizePlanKey(state.plan);

  setText(DOM.headerName, name);
  setText(DOM.headerEmail, email);
  if (DOM.headerAvatar && user.avatarUrl) DOM.headerAvatar.src = user.avatarUrl;

  let label = 'Free plan', pillText = 'FREE PLAN', pillClass = 'pill-plan';
  let summary = 'Use your daily swipes and keep preferences updated.';

  if (planKey === 'tier1') {
    label = 'Plus plan'; pillText = 'PLUS PLAN'; pillClass += ' pill-premium';
    summary = 'Unlimited swipes and advanced filters active.';
  } else if (planKey === 'tier2') {
    label = 'Elite plan'; pillText = 'ELITE PLAN'; pillClass += ' pill-premium';
    summary = 'Daily shortlist and Approved matches active.';
  } else if (planKey === 'tier3') {
    label = 'Concierge plan'; pillText = 'CONCIERGE PLAN'; pillClass += ' pill-premium';
    summary = 'Concierge dating service active.';
  }

  setText(DOM.headerPlanBadge, label.toUpperCase());
  setText(DOM.homeWelcomeName, name);
  setText(DOM.homePlanPill, pillText);
  setText(DOM.homePlanSummary, summary);
  if(DOM.homePlanPill) DOM.homePlanPill.className = pillClass;
}

function renderUsage(u, planKey) {
  const swipesRem = safeNumber(u.swipesRemaining, 20); 
  const swipeLimit = safeNumber(u.swipesLimit, 20);
  const shortlistCount = safeNumber(u.shortlistCount, 0); 
  
  if (DOM.kpiRemaining) {
    if (planKey === 'free') {
       DOM.kpiRemaining.textContent = `${swipesRem} / ${swipeLimit}`;
    } else {
       DOM.kpiRemaining.textContent = 'Unlimited';
    }
  }

  const isEliteOrConcierge = (planKey === 'tier2' || planKey === 'tier3');
  
  if (DOM.kpiShortlistTotal) {
    const card = DOM.kpiShortlistTotal.closest('.kpi-card') || DOM.kpiShortlistTotal.parentElement;
    if (isEliteOrConcierge) {
        if (card) card.style.display = ''; 
        DOM.kpiShortlistTotal.textContent = shortlistCount > 0 ? `${shortlistCount} New` : 'Check back tomorrow';
    } else {
        if (card) card.style.display = 'none'; 
    }
  }

  if (DOM.kpiDates) {
     const card = DOM.kpiDates.closest('.kpi-card') || DOM.kpiDates.parentElement;
     if (planKey === 'tier3') { 
        if (card) card.style.display = '';
     } else {
        if (card) card.style.display = 'none';
     }
  }
}

function renderPlanStatus() {
  const planKey = normalizePlanKey(state.plan);
  let displayName = 'Free Plan';
  if (planKey === 'tier1') displayName = 'Plus';
  if (planKey === 'tier2') displayName = 'Elite';
  if (planKey === 'tier3') displayName = 'Concierge';

  if (DOM.homeAccountList) {
    const isTopTier = planKey === 'tier3';
    DOM.homeAccountList.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <span class="muted" style="font-size:13px;">Current Membership</span>
        <span class="plan-chip plan-chip--${planKey}">${displayName}</span>
      </div>
      ${!isTopTier ? `
        <button id="btnHomeUpgrade" class="btn btn--primary btn--wide" style="justify-content:center;">
          Upgrade Plan
        </button>
      ` : `
        <div style="text-align:center; padding:8px; background:rgba(255,255,255,0.05); border-radius:8px;">
          <span style="font-size:12px; color:var(--ok);">You are on the highest tier.</span>
        </div>
      `}
    `;
    const btnUpgrade = document.getElementById('btnHomeUpgrade');
    if (btnUpgrade) btnUpgrade.onclick = () => window.location.href = 'tier.html?upgrade=1';
  }
}

function renderSettings(user, prefs) {
  if (!user) return;
  setText(DOM.sNameDisplay, user.name || 'Member');
  setText(DOM.sEmailDisplay, user.email || '');
  if (DOM.sAvatar && user.avatarUrl) DOM.sAvatar.src = user.avatarUrl;

  const p = prefs || {};
  setText(DOM.dispCity, p.city || 'Not set');
  if (p.ageMin && p.ageMax) setText(DOM.dispAge, `${p.ageMin} – ${p.ageMax}`);
  else setText(DOM.dispAge, 'Not set');
  let eth = p.ethnicity || 'Any';
  eth = eth.charAt(0).toUpperCase() + eth.slice(1);
  setText(DOM.dispEthnicity, eth);
  let looking = 'Not set';
  if (Array.isArray(p.lookingFor) && p.lookingFor.length > 0) {
    looking = p.lookingFor.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');
  } else if (typeof p.lookingFor === 'string') {
    looking = p.lookingFor;
  }
  setText(DOM.dispLooking, looking);
}

function renderCreatorsState(user) {
  if (!user) return;
  const status = user.creatorStatus || 'none';
  const show = (el, visible) => { if (el) el.hidden = !visible; };

  if (status === 'pending') {
    show(DOM.creatorStateNone, false);
    show(DOM.creatorStatePending, true);
    show(DOM.creatorStateApproved, false);
  } else if (status === 'approved') {
    show(DOM.creatorStateNone, false);
    show(DOM.creatorStatePending, false);
    show(DOM.creatorStateApproved, true);
  } else {
    show(DOM.creatorStateNone, true);
    show(DOM.creatorStatePending, false);
    show(DOM.creatorStateApproved, false);
  }

  if (user.hasCreatorAccess) {
    show(DOM.creatorsPaywall, false);
    show(DOM.creatorsUnlocked, true);
  } else {
    show(DOM.creatorsPaywall, true);
    show(DOM.creatorsUnlocked, false);
  }
}

function renderPremiumState(user) {
  if (!user) return;
  const status = user.premiumStatus || 'none';
  const show = (el, visible) => { if (el) el.hidden = !visible; };

  if (status === 'pending') {
    show(DOM.premiumStateNone, false);
    show(DOM.premiumStatePending, true);
    show(DOM.premiumStateApproved, false);
  } else if (status === 'approved') {
    show(DOM.premiumStateNone, false);
    show(DOM.premiumStatePending, false);
    show(DOM.premiumStateApproved, true);
  } else {
    show(DOM.premiumStateNone, true);
    show(DOM.premiumStatePending, false);
    show(DOM.premiumStateApproved, false);
  }
}

async function loadAndRenderMatches() {
  if (!DOM.matchesContainer) return;
  let matches = [];
  try {
    const res = await apiGet('/api/matches');
    if (res && res.ok && Array.isArray(res.matches)) matches = res.matches;
  } catch (err) {}

  if (matches.length === 0) {
    DOM.matchesContainer.innerHTML = `
       <div class="swipe-empty" style="grid-column: 1/-1;">
         <div class="swipe-empty__icon">💞</div>
         <h3>No matches yet</h3>
         <p class="muted">Start swiping to find your match!</p>
         <button class="btn btn--primary" onclick="document.querySelector('[data-panel=swipe]').click()">Go to Swipe</button>
       </div>`;
    return;
  }
  DOM.matchesContainer.innerHTML = matches.map(m => `
    <div class="match-card">
      <img src="${m.photoUrl || 'assets/images/truematch-mark.png'}" class="match-img" alt="${m.name}">
      <div class="match-info">
        <strong style="color:#fff; display:block;">${m.name}, ${m.age}</strong>
        <div class="match-actions">
          <button class="btn btn--sm btn--primary">Chat</button>
          <button class="btn btn--sm btn--ghost">Profile</button>
        </div>
      </div>
    </div>
  `).join('');
}

// ---------------------------------------------------------------------
// 6. Tabs
// ---------------------------------------------------------------------

function setActiveTab(panelName) {
  state.activeTab = panelName;
  const btns = document.querySelectorAll('.tab, .nav-btn, [data-panel]');
  btns.forEach(btn => {
    if(btn.dataset.panel === panelName) {
      btn.classList.add('is-active', 'active');
      btn.setAttribute('aria-selected', true);
    } else {
      btn.classList.remove('is-active', 'active');
      btn.setAttribute('aria-selected', false);
    }
  });

  if (DOM.tabPanels) {
    DOM.tabPanels.forEach(p => {
      const active = p.dataset.panel === panelName;
      p.classList.toggle('is-active', active);
      p.style.display = active ? '' : 'none';
      p.hidden = !active;
    });
  }
  if (panelName === 'swipe') SwipeController.init();
}

function handleTabClick(evt) {
  const btn = evt.target.closest('[data-panel]');
  if (!btn) return;
  const panelName = btn.dataset.panel;
  if (panelName) {
      evt.preventDefault();
      setActiveTab(panelName);
      if (panelName === 'matches') loadAndRenderMatches();
  }
}

// ---------------------------------------------------------------------
// 7. Wiring Functions
// ---------------------------------------------------------------------
function openProfileModal() {
  const user = state.me || {};
  const prefs = state.prefs || {};
  if (DOM.inpName) DOM.inpName.value = user.name || '';
  if (DOM.inpEmail) DOM.inpEmail.value = user.email || '';
  if (DOM.inpUserAge) DOM.inpUserAge.value = user.age || ''; 
  if (DOM.inpCity) DOM.inpCity.value = user.city || prefs.city || '';
  if (DOM.previewAvatar) DOM.previewAvatar.src = user.avatarUrl || 'assets/images/truematch-mark.png';
  if (DOM.inpAgeMin) DOM.inpAgeMin.value = prefs.ageMin || 18;
  if (DOM.inpAgeMax) DOM.inpAgeMax.value = prefs.ageMax || 40;
  if (DOM.inpEthnicity) DOM.inpEthnicity.value = prefs.ethnicity || 'any';
  if (DOM.inpLooking) DOM.inpLooking.value = (prefs.lookingFor && prefs.lookingFor[0]) || 'women';
  if (DOM.dlgProfile) {
    if (typeof DOM.dlgProfile.showModal === 'function') DOM.dlgProfile.showModal();
    else DOM.dlgProfile.setAttribute('open', '');
    document.documentElement.classList.add('modal-open');
  }
}
function closeProfileModal() {
  if (DOM.dlgProfile) {
    if (typeof DOM.dlgProfile.close === 'function') DOM.dlgProfile.close();
    else DOM.dlgProfile.removeAttribute('open');
    document.documentElement.classList.remove('modal-open');
  }
}
async function handleProfileSubmit(e) {
  e.preventDefault(); showLoading();
  let avatarDataUrl = null;
  if (DOM.inpAvatarFile && DOM.inpAvatarFile.files[0]) {
    const file = DOM.inpAvatarFile.files[0];
    avatarDataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target.result);
      reader.readAsDataURL(file);
    });
  }
  const p1 = { name: DOM.inpName?.value.trim(), email: DOM.inpEmail?.value.trim(), age: parseInt(DOM.inpUserAge?.value), city: DOM.inpCity?.value.trim(), avatarDataUrl };
  const p2 = { city: DOM.inpCity?.value.trim(), ageMin: parseInt(DOM.inpAgeMin?.value), ageMax: parseInt(DOM.inpAgeMax?.value), ethnicity: DOM.inpEthnicity?.value, lookingFor: [DOM.inpLooking?.value] };
  try {
    await Promise.all([apiUpdateProfile(p1), apiSavePrefs(p2)]);
    await loadMe(); closeProfileModal(); showToast("Profile updated!");
  } catch (err) { showError('Error saving.'); } finally { hideLoading(); }
}
function wireSettings() {
  if (DOM.btnEditProfile) DOM.btnEditProfile.onclick = openProfileModal;
  if (DOM.btnCloseProfile) DOM.btnCloseProfile.onclick = closeProfileModal;
  if (DOM.btnCancelProfile) DOM.btnCancelProfile.onclick = closeProfileModal;
  if (DOM.frmProfile) DOM.frmProfile.onsubmit = handleProfileSubmit;
  if (DOM.btnChangePassword) DOM.btnChangePassword.onclick = () => { DOM.frmPassword.reset(); DOM.dlgPassword.showModal(); };
  if (DOM.btnCancelPassword) DOM.btnCancelPassword.onclick = () => DOM.dlgPassword.close();
  if (DOM.frmPassword) DOM.frmPassword.onsubmit = async (e) => {
      e.preventDefault(); const fd = new FormData(DOM.frmPassword);
      try { await apiUpdateProfile({ password: fd.get('newPassword') }); DOM.dlgPassword.close(); alert('Password updated.'); } catch { showError('Failed.'); }
  };
  if (DOM.btnLogoutPanel) DOM.btnLogoutPanel.addEventListener('click', () => DOM.logoutBtn?.click());
}

function wireCreators() {
  if (DOM.btnOpenCreatorApply) DOM.btnOpenCreatorApply.onclick = () => DOM.dlgCreatorApply.showModal();
  if (DOM.btnCloseCreatorApply) DOM.btnCloseCreatorApply.onclick = () => DOM.dlgCreatorApply.close();
  if (DOM.frmCreatorApply) DOM.frmCreatorApply.onsubmit = async (e) => {
      e.preventDefault(); showLoading();
      const fd = new FormData(DOM.frmCreatorApply);
      const payload = Object.fromEntries(fd.entries()); payload.price = Number(payload.price);
      try { 
        await fetch('/api/me/creator/apply', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        DOM.dlgCreatorApply.close(); state.me.creatorStatus='pending'; renderCreatorsState(state.me); alert('Applied!');
      } catch { showError('Failed'); } finally { hideLoading(); }
  };
  if (DOM.btnSubscribeCreators) DOM.btnSubscribeCreators.onclick = async () => {
      if(!confirm("Pay $9.99?")) return; showLoading();
      try {
        const r = await fetch('/api/coinbase/create-charge', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ planKey:'creator_access' }) });
        const j = await r.json(); if(j.ok) location.href=j.url; else showError(j.message);
      } catch { showError('Error'); } finally { hideLoading(); }
  };
} 

function wirePremium() {
  if (DOM.btnOpenPremiumApply) DOM.btnOpenPremiumApply.onclick = () => DOM.dlgPremiumApply.showModal();
  if (DOM.btnPremiumCancel) DOM.btnPremiumCancel.onclick = () => DOM.dlgPremiumApply.close();
  if (DOM.frmPremiumApply) DOM.frmPremiumApply.onsubmit = async (e) => {
      e.preventDefault(); showLoading();
      const fd = new FormData(DOM.frmPremiumApply);
      try { 
        await fetch('/api/me/premium/apply', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.fromEntries(fd.entries())) });
        DOM.dlgPremiumApply.close(); state.me.premiumStatus='pending'; renderPremiumState(state.me); alert('Applied!');
      } catch { showError('Failed'); } finally { hideLoading(); }
  };
}

function wireSwipe() {
  if (DOM.btnSwipePass) DOM.btnSwipePass.addEventListener('click', (e) => { e.preventDefault(); SwipeController.pass(); });
  if (DOM.btnSwipeLike) DOM.btnSwipeLike.addEventListener('click', (e) => { e.preventDefault(); SwipeController.like(); });
  if (DOM.btnRefreshSwipe) DOM.btnRefreshSwipe.addEventListener('click', (e) => { e.preventDefault(); location.reload(); });
  document.addEventListener('keydown', (e) => {
    if (state.activeTab === 'swipe') {
      if (e.key === 'ArrowLeft') SwipeController.pass();
      if (e.key === 'ArrowRight') SwipeController.like();
    }
  });
}

// ---------------------------------------------------------------------
// 8. Data loading
// ---------------------------------------------------------------------

async function loadMe() {
  showLoading(); hideError();
  try {
    const data = await apiGet('/api/me');
    if (!data || !data.ok || !data.user) { window.location.href = '/auth.html?mode=login'; return; }

    const user = data.user;
    let planCandidate = user.plan;
    if (!planCandidate || planCandidate === 'free') {
       const urlParams = new URLSearchParams(window.location.search);
       const paramPlan = urlParams.get('plan') || urlParams.get('prePlan');
       if (paramPlan) planCandidate = paramPlan;
       else planCandidate = getLocalPlan?.() || 'free';
    }

    state.me = user;
    state.prefs = data.prefs || user.preferences || {}; 
    state.plan = normalizePlanKey(planCandidate);
    
    if (typeof saveLocalUser === 'function') saveLocalUser({ ...user, plan: state.plan });

    renderUserHeader(user);
    renderPlanStatus();
    renderSettings(user, state.prefs);
    applyPlanNavGating(); 
    renderCreatorsState(user);
    renderPremiumState(user);

    // [FIX] LOAD AND RENDER USAGE
    const usageRes = await apiGet('/api/dashboard/usage');
    if (usageRes && usageRes.ok) {
       renderUsage(usageRes.usage, state.plan);
    } else {
       // Fallback defaults
       renderUsage({ swipesRemaining: 20, swipesLimit: 20, shortlistCount: 0 }, state.plan);
    }

  } catch (err) {
    console.error(err); showError('Failed to load dashboard.');
  } finally {
    hideLoading();
  }
}

function showLoading() { if (DOM.loadingOverlay) DOM.loadingOverlay.classList.remove('hidden'); }
function hideLoading() { if (DOM.loadingOverlay) DOM.loadingOverlay.classList.add('hidden'); }
function showError(m) { if (DOM.errorBanner) { DOM.errorBanner.textContent = m; DOM.errorBanner.classList.remove('hidden'); } }
function hideError() { if (DOM.errorBanner) DOM.errorBanner.classList.add('hidden'); }

// ---------------------------------------------------------------------
// 9. Init
// ---------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  cacheDom();
  document.body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-panel]');
      if (btn && !btn.classList.contains('panel')) handleTabClick(e);
  });
  if (DOM.logoutBtn) {
    DOM.logoutBtn.addEventListener('click', async () => {
       try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
       try { localStorage.clear(); } catch {} 
       window.location.href = '/index.html';
    });
  }
  wireSettings(); wireCreators(); wirePremium(); wireSwipe();
  loadMe(); 
});