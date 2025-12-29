// preferences.js
// Handles onboarding + preference form for TrueMatch

(function () {
  'use strict';

  const TM = window.TM || {};
  const SESSION = window.TM_SESSION;
  const API = window.TM_API;

  // Base URL for API calls (supports optional window.API_BASE override)
  const API_BASE = (window.API_BASE || '').toString().trim().replace(/\/$/, '');
  const ADV_ONBOARD_LS_KEY = 'tm_advOnboardingByEmail';
  let PREFS_ONBOARDING_MODE = null;
  let PREFS_FROM_PARAM = null;

  function readAdvancedOnboardingMap() {
    try {
      const raw = localStorage.getItem(ADV_ONBOARD_LS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      console.warn('[prefs] failed to read advanced onboarding map', err);
      return {};
    }
  }

  function writeAdvancedOnboardingMap(map) {
    try {
      localStorage.setItem(ADV_ONBOARD_LS_KEY, JSON.stringify(map || {}));
    } catch (err) {
      console.warn('[prefs] failed to write advanced onboarding map', err);
    }
  }

  function markAdvancedOnboardingDone(email) {
    if (!email) return;
    const key = String(email || '').toLowerCase();
    const map = readAdvancedOnboardingMap();
    if (!map[key]) return;
    map[key].done = true;
    map[key].completedAt = Date.now();
    writeAdvancedOnboardingMap(map);
  }

  // ---- Plan helpers for advanced filters ----
  function normalizePlanKey(plan) {
    const raw = (plan || '').toString().toLowerCase();
    if (!raw) return 'free';
    if (raw === 'plus' || raw === 'tier1' || raw === 'tier-1') return 'tier1';
    if (raw === 'elite' || raw === 'tier2' || raw === 'tier-2') return 'tier2';
    if (raw === 'concierge' || raw === 'tier3' || raw === 'tier-3') return 'tier3';
    return raw;
  }

  function planHasAdvancedFilters(plan) {
    const key = normalizePlanKey(plan);
    // All paid tiers get advanced filters
    return key === 'tier1' || key === 'tier2' || key === 'tier3';
  }

  function toggleAdvancedSection(plan) {
    const section = document.getElementById('advancedPrefsSection');
    if (!section) return;

    const show = planHasAdvancedFilters(plan);
    if (show) {
      section.classList.remove('hidden');
    } else {
      section.classList.add('hidden');
    }
  }

  function buildLiveApiClient() {
    const buildUrl = (path) => (API_BASE ? `${API_BASE}${path}` : path);

    async function getMe() {
      const res = await fetch(buildUrl('/api/me'), {
        method: 'GET',
        credentials: 'include'
      });

      if (!res.ok) {
        return { ok: false, status: res.status };
      }

      const json = await res.json().catch(() => null);
      if (!json || typeof json !== 'object') {
        return { ok: false, status: res.status || 500 };
      }

      return json;
    }

    async function getPreferences() {
      const res = await fetch(buildUrl('/api/me/preferences'), {
        method: 'GET',
        credentials: 'include'
      });

      if (!res.ok) {
        return { ok: false, status: res.status };
      }

      const json = await res.json().catch(() => null);
      if (!json || typeof json !== 'object') {
        return { ok: false, status: res.status || 500 };
      }

      return json;
    }

    async function savePreferences(prefs) {
      const res = await fetch(buildUrl('/api/me/preferences'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(prefs)
      });

      const json = await res.json().catch(() => null);
      if (!json || typeof json !== 'object') {
        return {
          ok: res.ok,
          status: res.status
        };
      }

      return json;
    }

    return {
      getMe,
      getPreferences,
      savePreferences
    };
  }

  function ensureApiClient() {
    if (API && typeof API.buildApiClient === 'function') {
      return API.buildApiClient();
    }
    return buildLiveApiClient();
  }

  // ---- Local storage helpers ----
  const PREFS_KEY = 'tm_prefs';
  const PREFS_PER_USER_KEY = 'tm_prefs_by_email';

  function log(...args) {
    console.log('[prefs]', ...args);
  }

  function getLocalPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return null;
      const prefs = JSON.parse(raw);
      if (!prefs || typeof prefs !== 'object') return null;
      return prefs;
    } catch (err) {
      console.warn('[prefs] failed to parse local prefs', err);
      return null;
    }
  }

  function saveLocalPrefs(prefs) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs || {}));
    } catch (err) {
      console.warn('[prefs] failed to save local prefs', err);
    }
  }

  function getStoredPrefsForUser(email) {
    if (!email) return null;
    try {
      const raw = localStorage.getItem(PREFS_PER_USER_KEY);
      if (!raw) return null;
      const map = JSON.parse(raw);
      if (!map || typeof map !== 'object') return null;
      const key = email.toLowerCase();
      return map[key] || null;
    } catch (err) {
      console.warn('[prefs] failed to parse PREFS_PER_USER_KEY', err);
      return null;
    }
  }

  function saveStoredPrefsForUser(email, prefs) {
    if (!email) return;
    try {
      const raw = localStorage.getItem(PREFS_PER_USER_KEY);
      const map = raw ? JSON.parse(raw) : {};
      const key = email.toLowerCase();
      map[key] = prefs || {};
      localStorage.setItem(PREFS_PER_USER_KEY, JSON.stringify(map));
    } catch (err) {
      console.warn('[prefs] failed to save PREFS_PER_USER_KEY', err);
    }
  }

  function getStoredPrefs() {
    const user = getLocalUserFromSessionOrStorage();
    if (!user || !user.email) return getLocalPrefs();
    return getStoredPrefsForUser(user.email) || getLocalPrefs();
  }

  // ---- Form helpers ----
  function getFormValues() {
    const cityInput = qs('input[name="city"]');
    const ageMinInput = qs('input[name="ageMin"]');
    const ageMaxInput = qs('input[name="ageMax"]');
    const ethnicitySelect = qs('select[name="ethnicity"]');
    const lookingForSelect = qs('select[name="lookingFor"]');
    const intent = qs('select[name="intent"]')?.value || '';
    const dealbreakers =
      qs('textarea[name="dealbreakers"]')?.value?.trim() || '';
    const sharedValues = qsa('input[name="sharedValues"]:checked').map(
      (cb) => cb.value
    );

    const city = cityInput ? cityInput.value.trim() : '';
    const ageMin = ageMinInput ? Number(ageMinInput.value) : NaN;
    const ageMax = ageMaxInput ? Number(ageMaxInput.value) : NaN;
    const ethnicity = ethnicitySelect ? ethnicitySelect.value : '';
    const lookingFor = lookingForSelect ? lookingForSelect.value : '';

    return {
      city,
      ageMin,
      ageMax,
      ethnicity,
      lookingFor,
      intent,
      dealbreakers,
      sharedValues
    };
  }

  function validateFormValues(prefs) {
    if (!prefs) return false;

    const { city, ageMin, ageMax, lookingFor } = prefs;

    if (!city || typeof city !== 'string') {
      toast('Please enter your city.', 'error');
      return false;
    }

    if (!Number.isFinite(ageMin) || !Number.isFinite(ageMax)) {
      toast('Please enter a valid age range.', 'error');
      return false;
    }

    if (ageMin < 18 || ageMin > ageMax) {
      toast(
        'Please enter an age range starting at 18 where min is not greater than max.',
        'error'
      );
      return false;
    }

    if (!lookingFor) {
      toast('Please select who you are looking for.', 'error');
      return false;
    }

    return true;
  }

  function fillFormFromPrefs(prefs) {
    if (!prefs || typeof prefs !== 'object') return;

    if (prefs.city && qs('input[name="city"]')) {
      qs('input[name="city"]').value = prefs.city;
    }

    if (typeof prefs.ageMin === 'number' && qs('input[name="ageMin"]')) {
      qs('input[name="ageMin"]').value = String(prefs.ageMin);
    }

    if (typeof prefs.ageMax === 'number' && qs('input[name="ageMax"]')) {
      qs('input[name="ageMax"]').value = String(prefs.ageMax);
    }

    if (prefs.ethnicity && qs('select[name="ethnicity"]')) {
      qs('select[name="ethnicity"]').value = prefs.ethnicity;
    }

    if (prefs.lookingFor && qs('select[name="lookingFor"]')) {
      qs('select[name="lookingFor"]').value = prefs.lookingFor;
    }

    if (prefs.intent && qs('select[name="intent"]')) {
      qs('select[name="intent"]').value = prefs.intent;
    }

    if ('dealbreakers' in prefs && qs('textarea[name="dealbreakers"]')) {
      qs('textarea[name="dealbreakers"]').value = prefs.dealbreakers || '';
    }

    if (Array.isArray(prefs.sharedValues)) {
      qsa('input[name="sharedValues"]').forEach((cb) => {
        cb.checked = prefs.sharedValues.includes(cb.value);
      });
    }
  }

  // ---- Demo / local user helpers ----
  function ensureDemoOrLocalUser() {
    const existing =
      getLocalUserFromSessionOrStorage() ||
      (TM && TM.currentUser) ||
      null;

    if (existing && existing.email) {
      return existing;
    }

    // demo user as fallback
    const demoUser = {
      email: 'demo@truematch.test',
      name: 'Demo User',
      planKey: 'free',
      plan: 'free',
      prefsSaved: false
    };

    try {
      localStorage.setItem('tm_user', JSON.stringify(demoUser));
    } catch (err) {
      console.warn('[prefs] failed to persist demo user', err);
    }

    return demoUser;
  }

  function mergeUserWithPrefs(user, prefs) {
    const merged = Object.assign({}, user || {}, {
      preferences: Object.assign(
        {},
        (user && (user.preferences || user.prefs)) || {},
        prefs || {}
      ),
      prefsSaved: true
    });

    return merged;
  }

  function toast(message, type) {
    if (window.TM_TOAST && typeof window.TM_TOAST.show === 'function') {
      window.TM_TOAST.show(message, type);
      return;
    }

    // fallback
    alert(message);
  }

  function qs(selector) {
    return document.querySelector(selector);
  }

  function qsa(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function showLoader() {
    const el = qs('#prefs-loader');
    if (el) el.classList.remove('hidden');
  }

  function hideLoader() {
    const el = qs('#prefs-loader');
    if (el) el.classList.add('hidden');
  }

  function buildTierQS(opts) {
    const url = new URL(window.location.href);
    const params = url.searchParams;

    const within = params.get('within') || '';
    const plan = params.get('plan') || params.get('prePlan') || '';
    const from = params.get('from') || '';
    const ret = params.get('return') || '';

    const next = new URLSearchParams();
    if (within) next.set('within', within);
    if (plan) next.set('plan', plan);
    if (from) next.set('from', from);
    if (ret) next.set('return', ret);

    if (opts && opts.step) {
      next.set('step', opts.step);
    }
    if (opts && opts.dest) {
      next.set('dest', opts.dest);
    }

    const str = next.toString();
    return str || '';
  }

  async function getApiMe(api) {
    try {
      const me = await api.getMe();
      return me || null;
    } catch (err) {
      console.warn('[prefs] getApiMe failed', err);
      return null;
    }
  }

  async function getApiPrefs(api) {
    try {
      const res = await api.getPreferences();
      if (res && res.ok && (res.preferences || res.prefs)) {
        return res.preferences || res.prefs;
      }
      return null;
    } catch (err) {
      console.warn('[prefs] getApiPrefs failed', err);
      return null;
    }
  }

  function getLocalUserFromSessionOrStorage() {
    try {
      if (SESSION && typeof SESSION.getCurrentUser === 'function') {
        const user = SESSION.getCurrentUser();
        if (user && user.email) return user;
      }
    } catch (err) {
      console.warn('[prefs] SESSION.getCurrentUser threw', err);
    }

    try {
      const raw = localStorage.getItem('tm_user');
      if (!raw) return null;
      const user = JSON.parse(raw);
      if (!user || typeof user !== 'object') return null;
      return user;
    } catch (err) {
      console.warn(
        '[prefs] failed to parse tm_user in getLocalUserFromSessionOrStorage',
        err
      );
      return null;
    }
  }

  async function initPreferencesPage() {
    showLoader();

    const url = new URL(window.location.href);
    const params = url.searchParams;
    const onboardingParam = (params.get('onboarding') || '')
      .toString()
      .toLowerCase();
    const onboarding = onboardingParam === '1';
    PREFS_ONBOARDING_MODE = onboardingParam;
    PREFS_FROM_PARAM = (params.get('from') || '').toString().toLowerCase();

    // Keep initial plan from URL only as a fallback,
    // but do NOT toggle advanced section here anymore.
    const initialPlan =
      params.get('plan') ||
      params.get('prePlan') ||
      '';

    const api = ensureApiClient();
    let localUser = getLocalUserFromSessionOrStorage();

    if (!localUser) {
      localUser = ensureDemoOrLocalUser();
    }

    try {
      const userFromSession = getLocalUserFromSessionOrStorage();
      const user = userFromSession || localUser;

      if (!user || !user.email) {
        console.warn('[prefs] No local user/email, redirecting to auth');
        window.location.replace(
          '/auth.html?mode=signin&return=/preferences.html'
        );
        hideLoader();
        return;
      }

      let serverPrefs = null;

      try {
        const me = await getApiMe(api);

        if (me && me.user) {
          const userFromApi = me.user;
          const prefsFromUser =
            userFromApi.preferences ||
            userFromApi.prefs ||
            null;
          const prefsFromRoot =
            me.preferences || me.prefs || null;

          if (prefsFromUser || prefsFromRoot) {
            serverPrefs = prefsFromUser || prefsFromRoot;
          }

          const mergedUser = Object.assign({}, localUser, userFromApi, {
            prefsSaved: !!serverPrefs
          });

          SESSION?.setCurrentUser?.(mergedUser);
          localStorage.setItem('tm_user', JSON.stringify(mergedUser));

          // Update advanced section based on the latest plan from backend
          const userPlan =
            userFromApi.plan ||
            userFromApi.planKey ||
            initialPlan ||
            '';
          toggleAdvancedSection(userPlan || 'free');

          if (serverPrefs) {
            saveStoredPrefsForUser(mergedUser.email, serverPrefs);
          }

          // Optionally re-read prefs via api.getPreferences
          serverPrefs = await getApiPrefs(api);

          if (onboarding && serverPrefs) {
            console.log(
              '[prefs] onboarding + server prefs already exist → go dashboard'
            );
            const qsStr = buildTierQS({
              step: 'prefs-existing',
              dest: 'dashboard'
            });
            window.location.replace(
              `/dashboard.html${qsStr ? `?${qsStr}` : ''}`
            );
            hideLoader();
            return;
          }

          if (serverPrefs) {
            fillFormFromPrefs(serverPrefs);
          } else {
            const localPrefs = getStoredPrefs();
            if (localPrefs) fillFormFromPrefs(localPrefs);
          }
        } else {
          const localPrefs = getStoredPrefs();
          if (localPrefs) fillFormFromPrefs(localPrefs);
        }
      } catch (loadErr) {
        console.warn(
          '[prefs] non-fatal init load error, falling back to local prefs',
          loadErr
        );
        const localPrefs = getStoredPrefs();
        if (localPrefs) fillFormFromPrefs(localPrefs);
      }
    } finally {
      hideLoader();
    }

    attachFormHandler({
      api,
      localUser,
      mode: 'live'
    });
  }

  function attachFormHandler(ctx) {
    const form = qs('#preferencesForm');
    if (!form) return;

    const { api, localUser, mode } = ctx || {};
    const isLiveMode =
      mode === 'live' &&
      api &&
      typeof api.savePreferences === 'function';

    form.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const prefs = getFormValues();
      if (!validateFormValues(prefs)) return;

      const user = getLocalUserFromSessionOrStorage() || localUser;

      showLoader();

      try {
        if (isLiveMode) {
          const res = await api.savePreferences(prefs);

          if (!res || !res.ok) {
            console.warn('[prefs] savePreferences returned non-ok', res);
            toast(
              res && res.message
                ? res.message
                : 'Could not save preferences. Please try again.',
              'error'
            );
            return;
          }

          if (user && user.email) {
            saveStoredPrefsForUser(user.email, prefs);
          }

          const mergedUser = mergeUserWithPrefs(user, prefs);
          SESSION?.setCurrentUser?.(mergedUser);
          localStorage.setItem('tm_user', JSON.stringify(mergedUser));
        } else {
          saveLocalPrefs(prefs);
          if (user && user.email) {
            saveStoredPrefsForUser(user.email, prefs);
          }
          const updatedUser = mergeUserWithPrefs(user, prefs);
          SESSION?.setCurrentUser?.(updatedUser);
          localStorage.setItem(
            'tm_user',
            JSON.stringify(updatedUser)
          );
        }

        if (
          PREFS_ONBOARDING_MODE === 'advanced' ||
          PREFS_FROM_PARAM === 'upgrade'
        ) {
          if (user && user.email) {
            markAdvancedOnboardingDone(user.email);
          }
        }

        const qsStr = buildTierQS({
          step: 'prefs-saved',
          dest: 'dashboard'
        });
        window.location.replace(
          `/dashboard.html${qsStr ? `?${qsStr}` : ''}`
        );
      } catch (submitErr) {
        console.error(
          '[prefs] unexpected submit error',
          submitErr
        );
        toast(
          'Something went wrong while saving. Please try again.',
          'error'
        );
      } finally {
        hideLoader();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initPreferencesPage();
  });
})();
