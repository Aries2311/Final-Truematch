// tm-session.js — shared helpers for localStorage state
// Safe gamitin from any front-end module (auth, preferences, tier, dashboard, pay).

export const PREFS_KEY = 'tm_prefs';
export const PREFS_MAP_KEY = 'tm_prefs_by_user';

// -------- User helpers --------

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('tm_user') || 'null');
  } catch {
    return null;
  }
}

export function getCurrentUserEmail() {
  try {
    const u = getCurrentUser();
    const email = u && u.email;
    return email ? String(email).toLowerCase() : null;
  } catch {
    return null;
  }
}

// Same spirit as saveLocalUser() sa auth.js
export function saveLocalUser(u) {
  const minimal = {
    id:    u?.id    || 'local-demo',
    email: u?.email || 'user@truematch.app',
    name:  u?.name  || 'User',
  };

  if (u && u.plan) minimal.plan = u.plan;

  try {
    localStorage.setItem('tm_user', JSON.stringify(minimal));
    if (u && u.plan) {
      localStorage.setItem('tm_plan_override', u.plan);
    }
  } catch {
    // ignore storage errors
  }

  return minimal;
}

// -------- Plan helpers (Tier 1/2/3) --------

export function getLocalPlan() {
  try {
    return (
      localStorage.getItem('tm_plan_override') ||
      (JSON.parse(localStorage.getItem('tm_user') || '{}').plan || null)
    );
  } catch {
    return null;
  }
}

export function setLocalPlan(plan) {
  if (!plan) return;

  try {
    localStorage.setItem('tm_plan_override', plan);

    const raw = JSON.parse(localStorage.getItem('tm_user') || '{}');
    raw.plan = plan;
    localStorage.setItem('tm_user', JSON.stringify(raw));
  } catch {
    // ignore
  }
}

export function clearPlanOverride() {
  try {
    localStorage.removeItem('tm_plan_override');
  } catch {
    // ignore
  }
}

// -------- Preferences helpers --------

export function getRawPrefsForCurrentUser() {
  try {
    const email = getCurrentUserEmail();
    if (email) {
      const rawMap = localStorage.getItem(PREFS_MAP_KEY);
      if (rawMap) {
        const map = JSON.parse(rawMap) || {};
        if (map && typeof map === 'object' && map[email]) {
          return map[email];
        }
      }
    }

    const legacy = localStorage.getItem(PREFS_KEY);
    if (legacy) {
      return JSON.parse(legacy) || null;
    }

    return null;
  } catch {
    return null;
  }
}

export function savePrefsForCurrentUser(prefs) {
  try {
    const email = getCurrentUserEmail();
    if (email) {
      let map = {};
      const rawMap = localStorage.getItem(PREFS_MAP_KEY);
      if (rawMap) {
        try {
          map = JSON.parse(rawMap) || {};
        } catch {
          map = {};
        }
      }
      map[email] = prefs;
      localStorage.setItem(PREFS_MAP_KEY, JSON.stringify(map));
    }

    // Legacy slot para sa ibang scripts (same as now)
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function hasLocalPrefs() {
  return !!getRawPrefsForCurrentUser();
}
// -------- Generic JSON helpers + auth clear (used by dashboard) --------

export function readJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function clearAuth() {
  try {
    localStorage.removeItem('tm_user');
    localStorage.removeItem('tm_plan_override');
    localStorage.removeItem(PREFS_KEY);
    localStorage.removeItem(PREFS_MAP_KEY);
  } catch {
    // ignore
  }
}
