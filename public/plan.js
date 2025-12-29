// plan.js — show current plan status with global loader integration
// Uses the same layout as plan.html (pEmail, pTier, pStart, pEnd, pActive, pQuota).
// Requires tm-loader.js to be included before this script in plan.html.

import { apiGet } from './tm-api.js';

// Business mapping (display-only):
//   No plan / expired      → "Free"
//   tier1                  → "Plus"
//   tier2                  → "Elite"
//   tier3                  → "Concierge"
const RULES = {
  free:  { dailyCap: 0,  label: 'Free' },
  tier1: { dailyCap: 20, label: 'Plus' },
  tier2: { dailyCap: 20, label: 'Elite' },
  tier3: { dailyCap: 20, label: 'Concierge' }
};

// Format dates nicely, fallback to em dash
function fmt(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Loader helpers: prefer TMLoader, fallback to #globalLoader (no-op if missing)
function showLoader() {
  if (window.TMLoader && typeof window.TMLoader.show === 'function') {
    window.TMLoader.show('Loading your plan…', 'Fetching subscription details');
    return;
  }
  const el = document.getElementById('globalLoader');
  if (el) el.classList.remove('hidden');
}

function hideLoader() {
  if (window.TMLoader && typeof window.TMLoader.hide === 'function') {
    window.TMLoader.hide();
    return;
  }
  const el = document.getElementById('globalLoader');
  if (el) el.classList.add('hidden');
}

(async function initPlanPage() {
  showLoader();
  try {
    const res = await apiGet('/api/me');
    if (!res) {
      console.warn('[TM] /api/me returned empty response on plan page');
    }

    const u = (res && res.user) ? res.user : {};

    const email    = u.email || '—';
    const planKey  = (u.plan || u.tier || '').toLowerCase();
    const active   = !!u.planActive;

    const elEmail  = document.getElementById('pEmail');
    const elTier   = document.getElementById('pTier');
    const elStart  = document.getElementById('pStart');
    const elEnd    = document.getElementById('pEnd');
    const elActive = document.getElementById('pActive');
    const elQuota  = document.getElementById('pQuota');

    if (elEmail) elEmail.textContent = email;

    let label;
    if (!planKey || !active) {
      label = RULES.free.label;
    } else {
      label = RULES[planKey]?.label || planKey.toUpperCase();
    }
    if (elTier) elTier.textContent = label;

    if (elStart) elStart.textContent = fmt(u.planStart);
    if (elEnd)   elEnd.textContent   = fmt(u.planEnd);

    // Re-check activity against end date if present
    let isActive = active;
    if (active && u.planEnd) {
      const endTs = new Date(u.planEnd).getTime();
      if (!isNaN(endTs)) isActive = Date.now() <= endTs;
    }
    if (elActive) elActive.textContent = isActive ? 'Active' : 'Inactive';

    const quotaRuleKey = (!planKey || !isActive) ? 'free' : planKey;
    const quota = RULES[quotaRuleKey]?.dailyCap ?? 0;
    if (elQuota) elQuota.textContent = quota ? `${quota} / day` : '—';
  } catch (err) {
    console.error('[TM] Failed to load plan status', err);
    // Optional: mag-display ka ng error message dito kung magdadagdag ka ng element sa plan.html
  } finally {
    hideLoader();
  }
})();
// -------------------------------------------------------------------