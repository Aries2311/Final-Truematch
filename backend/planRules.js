// planRules.js — Central plan rules
// Internal Mapping:
//   free  = Free (no curated shortlist, swipe-only)
//   tier1 = Plus ($28.12)
//   tier2 = Elite ($95)
//   tier3 = Concierge ($485)

// NOTE:
// These rules are used by the backend for:
// - computing daily shortlist caps
// - computing plan duration (planStart/planEnd)
// Front-end display (plan.js) is already aligned to these caps.

const PLAN_RULES = {
  // Free: no curated shortlist, swipe-only experience
  free: {
    dailyCap: 0,       // 0 curated profiles/day
    durationDays: 0,   // no paid plan window
    swipeCap: 20,      // Unlimited swipes
  },

  // Plus (tier1)
  tier1: {
    dailyCap: 20,      // 20 curated profiles/day
    durationDays: 30,  // Monthly
    swipeCap: null     // Unlimited swipes
  },

  // Elite (tier2)
  tier2: {
    dailyCap: 20,      // Keep same curated cap, but more features (Approved etc.)
    durationDays: 30,
    swipeCap: null     // Unlimited swipes
  },

  // Concierge (tier3)
  tier3: {
    dailyCap: 20,
    durationDays: 30,
    swipeCap: null     // Unlimited swipes
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * todayKey()
 * Returns a compact 'YYYY-MM-DD' string used by the server
 * to group shortlist activity "per day".
 */
function todayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

module.exports = { PLAN_RULES, DAY_MS, todayKey };
