// pay.js — Coinbase Commerce checkout flow (keeps your existing onboarding logic)
const API_ROOT = (window.API_BASE || '').replace(/\/$/, '');
const API = API_ROOT ? `${API_ROOT}/api` : '/api';

function qs(){ return new URLSearchParams(location.search); }

function normalizePlan(code = ''){
  const v = String(code).toLowerCase().trim();
  // [FIX] Handle 'free' explicitly so it doesn't fallback to 'tier1'
  if (v === 'free' || v === 'basic') return 'free';
  
  if (v === 'plus'      || v === 'starter' || v === 'tier1' || v === '1') return 'tier1';
  if (v === 'elite'     || v === 'pro'     || v === 'tier2' || v === '2') return 'tier2';
  if (v === 'concierge' || v === 'vip'     || v === 'tier3' || v === '3') return 'tier3';
  
  return 'tier1'; // Default fallback
}



// ---------- Local storage helpers for upgrade onboarding ----------

const LS_PREV_PLAN_KEY = 'tm_prevPlanByEmail';
const LS_ADV_ONBOARD_KEY = 'tm_advOnboardingByEmail';

function readJsonLS(key){
  try{
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw);
  }catch(err){
    console.warn('readJsonLS error', key, err);
    return {};
  }
}

function writeJsonLS(key, value){
  try{
    window.localStorage.setItem(key, JSON.stringify(value));
  }catch(err){
    console.warn('writeJsonLS error', key, err);
  }
}

function emailKey(email){
  return String(email || '').toLowerCase();
}

function getPrevPlanForEmail(email){
  const map = readJsonLS(LS_PREV_PLAN_KEY);
  const k = emailKey(email);
  return map[k] || 'free';
}

function setPrevPlanForEmail(email, plan){
  if (!email) return;
  const map = readJsonLS(LS_PREV_PLAN_KEY);
  const k = emailKey(email);
  map[k] = normalizePlan(plan || 'free');
  writeJsonLS(LS_PREV_PLAN_KEY, map);
}

function setAdvancedOnboardingFlag(email, plan){
  if (!email) return;
  const map = readJsonLS(LS_ADV_ONBOARD_KEY);
  const k = emailKey(email);
  map[k] = {
    plan: normalizePlan(plan || 'tier1'),
    createdAt: Date.now(),
    done: false
  };
  writeJsonLS(LS_ADV_ONBOARD_KEY, map);
}

// Decide where to send user after confirmed payment / detected upgrade
async function handlePostUpgradeRedirect(targetPlan, confirmPayload){
  try{
    const me = await fetchMe();
    const user = me?.user || {};
    const email = user.email || null;
    const newPlan = normalizePlan(user.plan || confirmPayload?.plan || targetPlan || 'tier1');
    const prevPlan = email ? getPrevPlanForEmail(email) : 'free';

    if (email){
      // store new canonical plan
      setPrevPlanForEmail(email, newPlan);
    }

    if (prevPlan === 'free' && newPlan !== 'free'){
      setAdvancedOnboardingFlag(email, newPlan);
      const qp = new URLSearchParams();
      qp.set('onboarding', 'advanced');
      qp.set('from', 'upgrade');
      qp.set('plan', newPlan);
      location.replace(`/preferences.html?${qp.toString()}`);
    }else{
      location.replace('/dashboard.html');
    }
  }catch(err){
    console.error('handlePostUpgradeRedirect error', err);
    location.replace('/dashboard.html');
  }
}

function getPlanMeta(plan){
  const map = {
    tier1: {
      label: 'TrueMatch Plus',
      price: 28.12,
      period: '1 month',
      features: [
        'Everything in Free',
        'Unlimited swipes',
        'Advanced filters',
        'Read receipts',
        'Priority matching'
      ]
    },
    tier2: {
      label: 'TrueMatch Elite',
      price: 95.00,
      period: '1 month',
      features: [
        'Everything in Plus',
        'Access to Elite-only pool',
        'Monthly curated shortlist',
        'Higher profile visibility',
        'Soft concierge support'
      ]
    },
    tier3: {
      label: 'TrueMatch Concierge',
      price: 485.00,
      period: '1 month',
      features: [
        'Everything in Elite',
        'Dedicated human + AI operator',
        'Personalized sourcing',
        'Outreach & follow-ups handled for you',
        'Date coordination & logistics',
        'Ongoing optimization & reporting'
      ]
    }
  };
  return map[plan] || map.tier1;
}

async function fetchMe(){
  try{
    const r = await fetch(`${API}/me`, { credentials: 'include' });
    let j = null; try{ j = await r.json(); }catch{}
    return j || null;
  }catch{
    return null;
  }
}

// kept (may be used elsewhere / future)
function serverPrefsSaved(j){
  const u = j?.user || {};
  const p = j?.prefs || u?.prefs || j?.preferences || u?.preferences;
  return !!(u?.prefsSaved || u?.preferencesSaved || j?.prefsSaved || j?.preferencesSaved || p);
}

function serverPlanActive(j){
  const u = j?.user || {};
  if (typeof u.planActive === 'boolean') return u.planActive;
  const plan = u.plan || j?.plan || null;
  const end  = u.planEnd || j?.planEnd || null;
  if (!plan) return false;
  if (!end)  return false;
  const t = new Date(end).getTime();
  return Number.isNaN(t) ? false : (Date.now() <= t);
}

function renderSelectedPlan(plan){
  const meta = getPlanMeta(plan);
  const labelEl  = document.getElementById('planLabel');
  const amountEl = document.getElementById('planAmount');
  const listEl   = document.getElementById('planFeatures');

  if (labelEl)  labelEl.textContent  = meta.label;
  if (amountEl) amountEl.textContent = `$${meta.price} / ${meta.period}`;

  if (listEl){
    listEl.innerHTML = '';
    meta.features.forEach(txt => {
      const li = document.createElement('li');
      li.className = 'feature-item';
      li.innerHTML = `<span class="feature-icon">✓</span><span class="feature-text">${txt}</span>`;
      listEl.appendChild(li);
    });
  }
}

function buildTierHref(plan){
  const sp = qs();
  const q = new URLSearchParams();
  q.set('onboarding', '1');
  q.set('prePlan', plan);
  if (sp.get('demo') === '1')    q.set('demo', '1');
  if (sp.get('upgrade') === '1') q.set('upgrade', '1');
  return `/tier.html?${q.toString()}`;
}

function syncBackLinks(plan){
  const href = buildTierHref(plan);

  // supports your existing markup + optional data-back-tier
  const ids = ['btnBack', 'linkChangePlan'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.tagName === 'A') el.setAttribute('href', href);
  });

  document.querySelectorAll('[data-back-tier]').forEach(a => {
    a.setAttribute('href', href);
  });
}

async function requireAuth(){
  try{
    const j = await fetchMe();
    if (!j || !j.ok) throw new Error('no auth');

    const sp = qs();
    // Use raw plan string for check to avoid normalization bugs here
    const rawPlan = (j?.user?.plan || 'free').toLowerCase().trim();

    // [FIX] Only redirect if plan is Active AND NOT FREE.
    if (serverPlanActive(j) && rawPlan !== 'free' && sp.get('upgrade') !== '1'){
      location.replace('/dashboard.html');
      return false;
    }
    return true;
  }catch{
    const ret = encodeURIComponent(location.pathname + location.search);
    location.replace(`/auth.html?mode=signin&return=${ret}`);
    return false;
  }
}

async function startCoinbaseCheckout(plan){
  // Primary endpoint (Coinbase-only)
  const r = await fetch(`${API}/coinbase/create-charge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ plan })
  });

  let j = null; try{ j = await r.json(); }catch{}
  if (!j || !j.ok) throw new Error(j?.message || 'coinbase_error');

  // Support both shapes: {hosted_url} or {url}
  const url = j.hosted_url || j.url || j.hostedUrl || j.checkout_url;
  if (!url) throw new Error('missing_checkout_url');
  location.href = url;
}

/**
 * UPDATED: return the raw JSON so we can read a failure/canceled/expired status.
 * Coinbase return sends: ?session_id=CHARGE_CODE
 * We call backend alias: POST /api/stripe/confirm { session_id }
 */
async function confirmBySessionId(sessionId){
  const code = String(sessionId || '').trim();
  if (!code) return null;
  try{
    const r = await fetch(`${API}/stripe/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ session_id: code })
    });
    let j = null; try{ j = await r.json(); }catch{}
    return j || { ok: false };
  }catch{
    return { ok: false, error: 'network' };
  }
}

function looksCanceledOrExpired(res){
  const s = String(res?.status || res?.state || res?.charge_status || '').toUpperCase();
  return s === 'EXPIRED' || s === 'CANCELED' || s === 'CANCELLED';
}

async function init(){
  const sp   = qs();
  // Target plan user wants to buy
  const plan = normalizePlan(sp.get('plan') || sp.get('prePlan') || 'tier1');

  const ok = await requireAuth();
  if (!ok) return;

  renderSelectedPlan(plan);
  syncBackLinks(plan);

  // If backend added ?error=1 on return, bounce back to Tier immediately
  if (sp.get('error')){
    location.replace(buildTierHref(plan));
    return;
  }

  // explicit cancel → back to Tier
  if (sp.get('cancelled') === '1'){
    location.replace(buildTierHref(plan));
    return;
  }

  // If user comes back from Coinbase with session_id, confirm immediately
  const sessionId = sp.get('session_id');
  if (sessionId){
    try{ window.TMLoader && TMLoader.show('Confirming payment…', 'Syncing your account'); }catch{}
    const res = await confirmBySessionId(sessionId);

    if (res?.ok){
      try{ window.TMLoader && TMLoader.hide(); }catch{}
      await handlePostUpgradeRedirect(plan, res);
      return;
    }
    if (looksCanceledOrExpired(res)){
      try{ window.TMLoader && TMLoader.hide(); }catch{}
      location.replace(buildTierHref(plan));
      return;
    }
    // Not confirmed, not clearly cancelled → fall back to polling
    try{ window.TMLoader && TMLoader.hide(); }catch{}
  }

  // Logout (return to landing)
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout){
    btnLogout.addEventListener('click', async () => {
      btnLogout.disabled = true;
      try{ await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' }); }catch{}
      try{
        localStorage.removeItem('tm_user');
        localStorage.removeItem('tm_plan_override');
        localStorage.removeItem('tm_prefs_by_user');
      }catch{}
      location.replace('/index.html');
    });
  }

  // Pay button flow (Coinbase)
  const btn = document.getElementById('btnPay');
  if (btn){
    btn.addEventListener('click', async () => {
      btn.disabled   = true;
      btn.textContent = 'Redirecting to Coinbase...';
      try{ window.TMLoader && TMLoader.show('Redirecting to Coinbase…', 'Opening secure checkout'); }catch{}

      try{
        // Capture current plan before starting checkout
        const me = await fetchMe();
        const user = me?.user || {};
        const email = user.email || null;
        const currentPlan = normalizePlan(user.plan || 'free');
        if (email){
          setPrevPlanForEmail(email, currentPlan);
        }

        // Demo path (no real checkout)
        const demo = (sp.get('demo') === '1');
        if (demo){
          const r = await fetch(`${API}/plan/choose`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ plan })
          });
          const j = await r.json();
          if (!j.ok) throw new Error(j.message || 'plan_error');

          // Simulate the same upgrade redirect logic as real checkout
          await handlePostUpgradeRedirect(plan, j);
          return;
        }

        await startCoinbaseCheckout(plan);
      }catch(err){
        console.error(err);
        alert('Could not start checkout. Please try again.');
        btn.disabled   = false;
        btn.textContent = 'Pay now';
        try{ window.TMLoader && TMLoader.hide(); }catch{}
      }
    });
  }

  // Polling loop
  let tries    = 0;
  const maxTries = 20; // ~60s @3s
  const iv = setInterval(async () => {
    tries++;
    const j = await fetchMe();
    
    // [FIXED LOGIC] 
    // Redirect only if plan is active AND it is NOT 'free'.
    // OR if the user successfully upgraded (currentPlan == targetPlan).
    if (j && j.ok && serverPlanActive(j)) {
        const currentPlan = normalizePlan(j.user.plan);
        
        // Prevent Free plan from triggering success if we are trying to buy Tier 1
        if (currentPlan === 'free') {
           // Do nothing, keep waiting for upgrade
        } else if (currentPlan === plan || (plan === 'tier1' && currentPlan !== 'free')) {
            // Success! Plan updated.
            clearInterval(iv);
            await handlePostUpgradeRedirect(plan, { plan: currentPlan });
            return;
        }
    }

    if (tries >= maxTries){
      clearInterval(iv);
    }
  }, 3000);
}

document.addEventListener('DOMContentLoaded', init);