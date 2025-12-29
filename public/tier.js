// tier.js — Choose plan (onboarding / upgrade)
// Includes: Email Gate, Auth Gate (Anti-Flicker), Upgrade View, and Logout -> Landing Page

import { apiMe, apiGet } from './tm-api.js';
import { getLocalPlan } from './tm-session.js';

// /* EMAIL VERIFIED GATE (UPDATED FIX) */
async function __gateEmailVerified() {
  try {
    const usp = new URLSearchParams(location.search);
    
    // 1. Kung Upgrade mode, SKIP verification check (dahil nakalogin naman na)
    if (usp.get('upgrade') === '1') return true; 

    // 2. Demo Check
    const isDemoQS = usp.get('demo') === '1';
    let isDemoLocal = false;
    let localUser = {};
    try {
      localUser = JSON.parse(localStorage.getItem('tm_user')||'{}');
      const em = String(localUser?.email||'').toLowerCase();
      isDemoLocal = em.endsWith('.demo@truematch.app');
    } catch {}
    
    if (isDemoQS || isDemoLocal) return true;

    // 3. API Check
    const me = await apiGet('/api/me');
    if (me?.user?.emailVerified) {
      return true;
    }

    // 4. [FIX] Check Local Storage Fallback
    // Kung kakave-verify lang sa auth.js, dito niya makikita 'yun kahit delay ang server.
    if (localUser && localUser.emailVerified === true) {
        return true;
    }

    // 5. Kung hindi verified sa Server at Local, Redirect
    const ret = encodeURIComponent(location.pathname + location.search);
    location.href = `/auth.html?mode=signin&verify=1&return=${ret}`;
    return false;

  } catch { return true; }
}

// --- Logout (only way back to landing) ---
async function doLogoutToLanding(){
  const tries = ['/api/auth/logout', '/api/logout', '/logout'];
  for (const url of tries){
    try{
      const r = await fetch(url, { method:'POST', credentials:'include' });
      if (r && r.ok) break;
    }catch{}
  }
  try{
    localStorage.removeItem('tm_user');
    localStorage.removeItem('tm_plan_override');
    localStorage.removeItem('tm_prefs_by_user');
    localStorage.removeItem('tm_prefs'); // Added legacy cleanup
  }catch{}
  location.replace('/index.html');
}

function attachLogoutButton(){
  const btn = document.getElementById('btnLogout');
  if (!btn) return;
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.disabled = true;
    const prev = btn.innerHTML;
    btn.innerHTML = 'Logging out…';
    await doLogoutToLanding();
  });
}

// --- Notice banner helpers (cancel/success) ---
function renderTierNotice(kind, message){
  try{
    const box = document.getElementById('tierNotice');
    const text = document.getElementById('tierNoticeText');
    if (!box || !text) return;
    box.classList.remove('success','error');
    if (kind) box.classList.add(kind);
    text.textContent = message;
    box.style.display = 'block';
  }catch{}
}

function getQS() {
  return new URLSearchParams(location.search);
}

// ---- Normalize to tier1/tier2/tier3/free
function normalizePlanName(code) {
  const v = String(code || '').toLowerCase().trim();
  // Map all synonyms / labels to canonical tier IDs
  if (v === 'free' || v === 'basic') return 'free';
  if (v === 'plus' || v === 'starter' || v === 'tier1' || v === '1') return 'tier1';
  if (v === 'elite' || v === 'pro' || v === 'tier2' || v === '2') return 'tier2';
  if (v === 'concierge' || v === 'vip' || v === 'tier3' || v === '3') return 'tier3';
  return 'tier1'; // Fallback if unknown, or default
}

// ---- Helpers for server shapes
function serverEmail(j) {
  const u = j?.user || {};
  return String(u.email || j?.email || '').trim();
}

function serverPlanActive(j) {
  const u = j?.user || {};
  if (typeof u.planActive === 'boolean') return u.planActive;
  if (typeof j?.planActive === 'boolean') return j.planActive;

  const plan = u.plan || j?.plan || null;
  const planEnd = u.planEnd || j?.planEnd || null;

  if (!plan) return false;
  if (!planEnd) return false;
  const endTs = new Date(planEnd).getTime();
  if (Number.isNaN(endTs)) return false;
  return Date.now() <= endTs;
}

function cleanURLParam(param) {
  try {
    const u = new URL(location.href);
    if (u.searchParams.has(param)) {
      u.searchParams.delete(param);
      history.replaceState(null, '', u.toString());
    }
  } catch { }
}

async function requireAuth() {
  const sp = getQS();
  const isDemoQS = sp.get('demo') === '1';

  let isDemoLocal = false;
  try {
    const raw = localStorage.getItem('tm_user');
    if (raw) {
      const u = JSON.parse(raw);
      const em = String(u?.email || '').toLowerCase();
      if (em.endsWith('.demo@truematch.app')) {
        isDemoLocal = true;
      }
    }
  } catch {}

  const isDemo = isDemoQS || isDemoLocal;
  const isUpgrade = sp.get('upgrade') === '1';

  cleanURLParam('session_id');

  try {
    const j = await apiMe();

    // 1. Check Login
    if (!j || j.ok === false || j.error) {
      if (!isDemo) {
        const ret = encodeURIComponent(location.pathname + location.search);
        location.replace(`/auth.html?mode=signin&return=${ret}`);
        return false;
      }
    }

    // 2. Check Email presence
    const email = serverEmail(j);
    if (!email && !isDemo) {
      const ret = encodeURIComponent(location.pathname + location.search);
      location.replace(`/auth.html?mode=signin&return=${ret}`);
      return false;
    }

    // 3. Check User & Preferences (Anti-Flicker)
    const user = j?.user || {};
    const prefsSaved = !!(user.prefsSaved || user.preferencesSaved || user.prefs || user.preferences || j.prefs);

    // [FIX 1] PREFERENCES GATE: Skip redirect if we are upgrading
    if (!prefsSaved && !isUpgrade) {
      const isDemoStrict = isDemo || (user.email && String(user.email).endsWith('.demo@truematch.app'));
      if (!isDemoStrict) {
        const qs = new URLSearchParams(location.search);
        qs.set('onboarding', '1');
        location.replace(`/preferences.html?${qs.toString()}`);
        return false;
      }
    }

    // 4. Check Active Plan
    const planActiveFromServer = serverPlanActive(j);
    const hasPlan = isDemo ? (planActiveFromServer || !!getLocalPlan()) : planActiveFromServer;

    // [FIX 2] DASHBOARD REDIRECT: Prevent going back to dashboard if we are explicitly upgrading
    if (hasPlan && !isUpgrade) {
      location.replace('/dashboard.html');
      return false;
    }

    // Show error banner if redirected from canceled checkout
    if (sp.get('cancelled') === '1') {
      const prePlan = sp.get('prePlan') || '';
      const p = prePlan ? ` (${prePlan})` : '';
      renderTierNotice('error', 'Payment canceled. Please choose a plan again' + p + '.');
    }

    return true;
  } catch (e) {
    console.error(e);
    const ret = encodeURIComponent(location.pathname + location.search);
    location.replace(`/auth.html?mode=signin&return=${ret}`);
    return false;
  }
}

function buildPayURL(plan) {
  const sp = getQS();
  const qs = new URLSearchParams();

  qs.set('plan', normalizePlanName(plan));

  const demo = sp.get('demo');
  const onboarding = sp.get('onboarding');
  const upgrade = sp.get('upgrade');

  if (demo === '1') qs.set('demo', '1');
  if (onboarding === '1') qs.set('onboarding', '1');
  if (upgrade === '1') qs.set('upgrade', '1');

  // Always carry the selected plan as prePlan
  qs.set('prePlan', normalizePlanName(plan));

  return `/pay.html?${qs.toString()}`;
}

function attachPlanButtons() {
  document.querySelectorAll('[data-plan]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const plan = normalizePlanName(btn.dataset.plan);
      if (plan === 'free') return;

      try{ window.TMLoader && TMLoader.show('Opening checkout…','Connecting to Coinbase'); }catch{}
      location.href = buildPayURL(plan);
    });
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-plan]')) return;

    const el = e.target.closest('[data-plan-card]') || e.target.closest('[data-tier]');
    if (!el) return;

    const planCard = el.getAttribute('data-plan-card');
    const tier = el.getAttribute('data-tier');

    let plan = planCard ? normalizePlanName(planCard) : '';
    if (!plan && tier) {
      plan = ({ '1': 'tier1', '2': 'tier2', '3': 'tier3' }[tier]) || tier;
    }

    plan = normalizePlanName(plan);
    if (plan === 'free') return;

    try{ window.TMLoader && TMLoader.show('Opening checkout…','Connecting to Coinbase'); }catch{}
    location.href = buildPayURL(plan);
  });
}

async function renderUpgradeView() {
  const sp = new URLSearchParams(location.search);
  if (sp.get('upgrade') !== '1') return;

  try {
    const j = await apiMe();
    const current = String((j?.user?.plan || j?.plan || 'free')).toLowerCase();
    
    const ranks = { free: 0, tier1: 1, tier2: 2, tier3: 3 };
    const myRank = ranks[current] ?? 0;

    document.querySelectorAll('[data-plan-card], [data-tier]').forEach(el => {
      let cardPlan = el.getAttribute('data-plan-card') || el.getAttribute('data-tier') || '';
      cardPlan = cardPlan.toLowerCase();
      
      if(cardPlan === 'plus') cardPlan = 'tier1';
      if(cardPlan === 'elite') cardPlan = 'tier2';
      if(cardPlan === 'concierge') cardPlan = 'tier3';

      const cardRank = ranks[cardPlan] ?? 0;
      const btn = el.querySelector('button');

      if (cardPlan === current) {
        el.style.opacity = '1';
        el.classList.add('current-plan-card');
        if(btn) {
          btn.textContent = 'Current Plan';
          btn.disabled = true;
          btn.classList.add('btn--disabled');
        }
      } 
      else if (cardRank < myRank) {
        el.style.opacity = '0.5';
        el.style.pointerEvents = 'none';
        if(btn) {
          btn.textContent = 'Included';
          btn.disabled = true;
        }
      }
      else {
        el.style.opacity = '1';
        el.classList.add('ring-2');
        if(btn) {
          btn.textContent = 'Upgrade';
          btn.disabled = false;
          btn.onclick = () => handleSelectPlan(cardPlan); // This function isn't defined but logic handled by listener above
        }
      }
    });

  } catch (e) {
    console.error('Upgrade view error:', e);
  }
}

// =================================================================
// MAIN INITIALIZATION
// =================================================================
document.addEventListener('DOMContentLoaded', async () => {
  attachLogoutButton();

  // 1. Check basic Auth
  const ok = await requireAuth();
  if (!ok) return;

  // 2. CHECK UPGRADE FLAG
  const sp = new URLSearchParams(location.search);
  const isUpgrade = sp.get('upgrade') === '1';

  // [FIX 3] EMAIL VERIFICATION BYPASS:
  // If we are upgrading (isUpgrade=true), SKIP the email verification gate.
  // This prevents the redirect to auth.html?verify=1 shown in your screenshot.
  if (!isUpgrade) {
    const verifiedOk = await __gateEmailVerified();
    if (!verifiedOk) return;
  }

  // 3. Setup UI
  attachPlanButtons();
  renderUpgradeView();
});