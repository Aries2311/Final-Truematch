// server.js – TrueMatch backend using Firebase Firestore (no MongoDB)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });


const express = require('express');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');


// Google OAuth token verifier (lazy)
let OAuth2Client = null;
try { OAuth2Client = require('google-auth-library').OAuth2Client; } catch (e) { OAuth2Client = null; }

// ---------------- Basic server setup ----------------
const app = express();

// serve frontend (public folder) — server.js is inside /backend
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = Number(process.env.PORT) || 3000;

// NEW: single source of truth for public base URL (works in local & deploy)
const APP_BASE_URL = (process.env.APP_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');


// CORS: limit to local dev origins + allow credentials & x-admin-key
const CORS_ALLOWLIST = String(process.env.CORS_ALLOWLIST || '')
  .split(',')
  .map(s => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || origin === 'null') return cb(null, true);

    const o = String(origin || '').trim().replace(/\/+$/, '');
    if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o)) return cb(null, true);

    if (CORS_ALLOWLIST.includes(o)) return cb(null, true);

    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'x-admin-key'],
  methods: ['GET', 'POST', 'OPTIONS']
};

app.use(cors(corsOptions));

// body parsers (before routes)
app.use(express.json({
  limit: '5mb',
  verify: (req, res, buf) => {
    // Keep raw body for Coinbase Commerce webhook signature verification
    if (req.originalUrl && req.originalUrl.startsWith('/api/coinbase/webhook')) {
      req.rawBody = buf;
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));


app.use(cookieParser());
// static files

// ---------------- In-memory "DB" (demo + cache) ----------------
const DB = {
  user: {
    id: 'demo-1',
    email: '',
    name: '',
    city: '—',
    plan: null,
    planStart: null,
    planEnd: null,
    avatarUrl: '',
    prefsSaved: false,
    planActive: false,
    emailVerified: false
  },
  // prefs: { city, ageMin, ageMax, lookingFor }
  prefs: null,
  
  // per-user caches (for multi-user sessions)
  users: {},
  prefsByEmail: {},
  // Idagdag ang mga ito:  
  swipes: {}, // { "me@email.com": { "them@email.com": "like" } }
  matches: {}, // { "me@email.com": ["them@email.com"] }

  // shortlistState & datesState are per-email for demo mode
  shortlistState: {},
  datesState: {},
  approvedState: {},
  emailVerify: {}
};
const SERVER_SWIPE_COUNTS = {}; 
const STRICT_DAILY_LIMIT = 20;
// ---------------- Disk persistence (fallback when Firebase is OFF) ----------------
// NOTE: In real production, you should rely on Firestore. This file fallback is mainly for local/demo.
// It makes DB.prefsByEmail survive server restarts (so prefs persist after logout / new device tests).
const PREFS_STORE_PATH = process.env.PREFS_STORE_PATH || path.join(__dirname, '_prefs_store.json');

function loadPrefsStore() {
  try {
    if (!fs.existsSync(PREFS_STORE_PATH)) return;
    const raw = fs.readFileSync(PREFS_STORE_PATH, 'utf8');
    const obj = JSON.parse(raw || '{}');
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      DB.prefsByEmail = obj;
    }
  } catch (e) {
    // swallow; fallback is still in-memory
  }
}

function savePrefsStore() {
  try {
    fs.writeFileSync(PREFS_STORE_PATH, JSON.stringify(DB.prefsByEmail || {}, null, 2));
  } catch (e) {
    // swallow; some hosts have read-only FS
  }
}

// ---------------- PERMANENT STORAGE FIX ----------------
const USERS_STORE_PATH = path.join(__dirname, '_users_store.json');

function loadUsersStore() {
  try {
    if (!fs.existsSync(USERS_STORE_PATH)) return;
    const raw = fs.readFileSync(USERS_STORE_PATH, 'utf8');
    const obj = JSON.parse(raw || '{}');
    if (obj && typeof obj === 'object') {
      DB.users = obj;
      console.log(`[DB] Loaded ${Object.keys(DB.users).length} users from disk.`);
    }
  } catch (e) {
    console.error('[DB] Failed to load users store:', e.message);
  }
}

function saveUsersStore() {
  try {
    // Save the entire DB.users object to a file
    fs.writeFileSync(USERS_STORE_PATH, JSON.stringify(DB.users, null, 2));
  } catch (e) {
    console.error('[DB] Failed to save users store:', e.message);
  }
}

// ---------------- SWIPES PERSISTENCE (per-user swipe history) ----------------
const SWIPES_STORE_PATH = path.join(__dirname, '_swipes_store.json');

function loadSwipesStore() {
  try {
    if (!fs.existsSync(SWIPES_STORE_PATH)) return;
    const raw = fs.readFileSync(SWIPES_STORE_PATH, 'utf8');
    const obj = JSON.parse(raw || '{}');
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      DB.swipes = obj;
      console.log(`[DB] Loaded swipe history for ${Object.keys(DB.swipes).length} users from disk.`);
    }
  } catch (e) {
    console.error('[DB] Failed to load swipes store:', e.message);
  }
}

function saveSwipesStore() {
  try {
    fs.writeFileSync(
      SWIPES_STORE_PATH,
      JSON.stringify(DB.swipes || {}, null, 2)
    );
  } catch (e) {
    console.error('[DB] Failed to save swipes store:', e.message);
  }
}


// ---------------- Plan rules & date helpers ----------------
// Centralized in its own module so you can change plan logic in one place.
const { PLAN_RULES, DAY_MS, todayKey } = require('./planRules');

// 🔹 SPECIAL DEMO ACCOUNT (global constants)
const DEMO_EMAIL = 'aries.aquino@gmail.com';
const DEMO_PASSWORD = 'aries2311';


// 🔹 DEV-only bypass demo accounts (for multi-user testing)
// Enable with: ALLOW_TEST_BYPASS=true (and keep NODE_ENV != 'production')
const ALLOW_TEST_BYPASS = String(process.env.ALLOW_TEST_BYPASS || '').toLowerCase() === 'true';

const TEST_BYPASS_ACCOUNTS = {
  "demo1@truematch.app": {
    password: "Demo123!@#",
    name: "Demo One",
    city: "Manila",
    plan: "tier2",
    prefs: { city: "Manila", ageMin: 21, ageMax: 35, lookingFor: ["women"] }
  },
  "demo2@truematch.app": {
    password: "Demo123!@#",
    name: "Demo Two",
    city: "Cebu",
    plan: "tier1",
    prefs: { city: "Cebu", ageMin: 20, ageMax: 33, lookingFor: ["women"] }
  },
  "demo3@truematch.app": {
    password: "Demo123!@#",
    name: "Demo Three",
    city: "Davao",
    plan: "tier3",
    prefs: { city: "Davao", ageMin: 22, ageMax: 38, lookingFor: ["women"] }
  }
};

// 🔹 Cookie session (email-based) — simple & works for your current frontend
const SESSION_COOKIE = 'tm_email';

function setSession(res, email) {
  res.cookie(SESSION_COOKIE, email, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });
}

function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });
}

function getSessionEmail(req) {
  return ((req.cookies || {})[SESSION_COOKIE] || '').toString().trim().toLowerCase();
}

function setAnonState() {
  DB.user = {
    ...DB.user,
    email: '',
    name: '',
    plan: null,
    planStart: null,
    planEnd: null,
    prefsSaved: false,
    planActive: false,
    emailVerified: false
  };
  DB.prefs = null;
}

// Attach session user to this request (so /api/me and other routes read the right user)
app.use((req, _res, next) => {
  const email = getSessionEmail(req);
  if (!email) {
    setAnonState();
    return next();
  }
  // hydrate from cache (per-email); never carry plan/prefs from previous user
  if (DB.users[email]) {
    DB.user = { ...DB.users[email] };
  } else {
    DB.user = {
      id: 'demo-1',
      email,
      name: '',
      city: '—',
      plan: null,
      planStart: null,
      planEnd: null,
      avatarUrl: '',
      prefsSaved: false,
      planActive: false,
      emailVerified: false
    };
  }

  // load per-email prefs map (not the global DB.prefs)
  if (Object.prototype.hasOwnProperty.call(DB.prefsByEmail, email)) {
    DB.prefs = DB.prefsByEmail[email];
  } else {
    DB.prefs = null;
  }
  return next();
});
// ============================================================
// [INSERT 1] ADMIN MIDDLEWARE (Ilagay sa taas, bago ang routes)
// ============================================================
function requireAdmin(req, res, next) {
  // Siguraduhin na ang DB variable ay accessible. 
  // Kung iba ang variable name ng database mo, palitan ang 'DB'.
  const user = (typeof DB !== 'undefined' && DB.user) ? DB.user : null;
  
  if (user && user.isAdmin === true) {
    return next(); // Allowed
  }
  
  console.log('[AdminGuard] Blocked access attempt.');
  return res.status(403).json({ ok: false, message: 'Access denied: Admins only' });
}


// Public Config (Safe)
app.get('/api/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || ''
  });
});


// ---------------- Admin access (simple secret key) ----------------
// NOTE: palitan mo 'changeme-admin-key' sa .env gamit ADMIN_ACCESS_KEY
// para mas secure sa real deploy.
const ADMIN_ACCESS_KEY = process.env.ADMIN_ACCESS_KEY || 'changeme-admin-key';

// Dedicated admin login credentials (username + password)
const ADMIN_LOGIN_USERNAME =
  process.env.ADMIN_USERNAME || '@tmadmin2025!';
const ADMIN_LOGIN_PASSWORD =
  process.env.ADMIN_PASSWORD || 'truematchadminbyOS!';

function getProvidedAdminKey(req) {
  const headerKey = req.headers['x-admin-key'];
  const bodyKey = req.body && req.body.adminKey;
  const queryKey = req.query && req.query.adminKey;
  return headerKey || bodyKey || queryKey || '';
}

function isValidAdminKey(key) {
  if (!key) return false;
  return String(key) === String(ADMIN_ACCESS_KEY);
}

function extractIgUsername(igUrlOrUser) {
  if (!igUrlOrUser) return '';
  try {
    const s = String(igUrlOrUser).trim();
    if (s.startsWith('http://') || s.startsWith('https://')) {
      const u = new URL(s);
      const seg = (u.pathname || '').replace(/\/+$/, '').split('/').filter(Boolean)[0] || '';
      return seg.replace(/^@/, '');
    }
    return s.replace(/^@/, '').split(/[/?#]/)[0];
  } catch {
    const s = String(igUrlOrUser).trim();
    return s.replace(/^@/, '').split(/[/?#]/)[0];
  }
}



// ---------------- Firebase (Firestore) setup ----------------
let admin;
let firestore;
let usersCollection;
let hasFirebase = false;

try {
  admin = require('firebase-admin');

  let serviceAccount;

  // Option 1: ENV variable FIREBASE_SERVICE_ACCOUNT (JSON string)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    // Option 2: local JSON file (firebase-service-account.json)
    serviceAccount = require('./firebase-service-account.json');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  firestore = admin.firestore();
  usersCollection = firestore.collection('users');
  hasFirebase = true;

  console.log('✅ Firebase initialized — using Firestore as database');
} catch (err) {
  console.warn(
    '⚠️ Firebase not fully configured. Falling back to pure in-memory demo mode.\nReason:',
    err.message
  );
}

// Load persisted prefs cache at boot (only when Firebase is OFF)
if (!hasFirebase) {
  loadPrefsStore();
  loadUsersStore();
  loadSwipesStore();
} // <--- IMPORTANTE: Load users & swipes on boot



// ---------------- Helper functions ----------------
function toMillis(v) {
  if (!v) return NaN;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') return new Date(v).getTime();

  // Firestore Timestamp support (Admin SDK)
  if (v && typeof v.toDate === 'function') {
    try { return v.toDate().getTime(); } catch {}
  }
  // Some Timestamp-like shapes
  const sec = (typeof v.seconds === 'number') ? v.seconds
           : (typeof v._seconds === 'number') ? v._seconds
           : null;
  if (typeof sec === 'number') {
    const ns = (typeof v.nanoseconds === 'number') ? v.nanoseconds
             : (typeof v._nanoseconds === 'number') ? v._nanoseconds
             : 0;
    return (sec * 1000) + Math.floor(ns / 1e6);
  }

  return NaN;
}

// [UPDATED] Helper: Anong data ang makikita ng frontend
function publicUser(doc) {
  if (!doc) return null;

  const plan = typeof doc.plan !== 'undefined' ? doc.plan : null;
  const planStart = doc.planStart || null;
  const planEnd = doc.planEnd || null;

  let planActive = (typeof doc.planActive === 'boolean') ? doc.planActive : false;
  if (plan && planEnd) {
    const endTs = new Date(planEnd).getTime();
    if (!Number.isNaN(endTs) && Date.now() > endTs) {
      planActive = false;
    }
  }

  return {
    id: doc.id || 'demo-1',
    email: doc.email || '',
    name: doc.name || '',
    age: doc.age || '', // <--- IDAGDAG ITO (Para lumabas sa modal)
    city: doc.city || '', // Siguraduhing walang default na '—' para malinis sa input
    plan,
    planStart,
    planEnd,
    avatarUrl: doc.avatarUrl || '',
    prefsSaved: !!doc.prefsSaved,
    emailVerified: !!doc.emailVerified,
    planActive
  };
}

async function findUserByEmail(email) {
  if (!hasFirebase || !usersCollection) return null;
  const snap = await usersCollection.where('email', '==', email).limit(1).get();
  if (snap.empty) return null;

  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() };
}

async function createUserDoc(data) {
  if (!hasFirebase || !usersCollection) return null;

  const ref = await usersCollection.add({
    ...data,
    createdAt: admin
      ? admin.firestore.FieldValue.serverTimestamp()
      : new Date()
  });

  return { id: ref.id, ...data };
}

async function updateUserByEmail(email, fields) {
  if (!hasFirebase || !usersCollection) return null;

  const existing = await findUserByEmail(email);
  if (!existing) return null;

  await usersCollection.doc(existing.id).update(fields);
  return { ...existing, ...fields };
}

// ---------- Shortlist & dates helpers (plan-based serving) ----------
async function loadShortlistState(email) {
  if (!email) {
    return {
      shortlist: [],
      shortlistLastDate: null,
      plan: DB.user.plan || null,
      prefs: DB.prefs || null
    };
  }

  if (hasFirebase && usersCollection) {
    const doc = await findUserByEmail(email);
    if (!doc) {
      return { shortlist: [], shortlistLastDate: null, plan: null, prefs: null };
    }
    return {
      shortlist: doc.shortlist || [],
      shortlistLastDate: doc.shortlistLastDate || null,
      plan: doc.plan || null,
      prefs: doc.prefs || null
    };
  }

  if (!DB.shortlistState[email]) {
    DB.shortlistState[email] = {
      shortlist: [],
      shortlistLastDate: null
    };
  }

  return {
    shortlist: DB.shortlistState[email].shortlist || [],
    shortlistLastDate: DB.shortlistState[email].shortlistLastDate || null,
    plan: DB.user.plan || null,
    prefs: DB.prefs || null
  };
}

async function saveShortlistState(email, state) {
  if (!email) return;

  if (hasFirebase && usersCollection) {
    await updateUserByEmail(email, {
      shortlist: state.shortlist,
      shortlistLastDate: state.shortlistLastDate
    });
  } else {
    DB.shortlistState[email] = {
      shortlist: state.shortlist,
      shortlistLastDate: state.shortlistLastDate
    };
  }
}

function generateDemoProfiles(count, prefs = {}) {
  const city = prefs.city || 'Lagos';
  const base = Date.now();
  const out = [];

  for (let i = 0; i < count; i++) {
    const idx = i + 1;
    out.push({
      id: `p_${base}_${idx}`,
      name: `Candidate ${idx}`,
      username: `candidate_${idx}`,
      city,
      ageRange: `${20 + (idx % 10)}–${25 + (idx % 10)}`,
      score: 80 + (idx % 20),
      igUrl: `https://instagram.com/candidate_${idx}`,
      photoUrl: `https://i.pravatar.cc/240?img=${(idx % 70) + 1}`,
      avatar: `https://i.pravatar.cc/240?img=${(idx % 70) + 1}`,
      status: 'pending',
      servedAt: new Date().toISOString()
    });
  }

  return out;
}


async function serveShortlistForToday(email) {
  const state = await loadShortlistState(email);
  const plan = state.plan || DB.user.plan || 'tier1';
  const rule = PLAN_RULES[plan] || PLAN_RULES.tier1;

  // Check if plan is active (based on DB.user.planEnd if available)
  let isActive = false;
  if (typeof DB.user?.planActive === 'boolean') isActive = DB.user.planActive;
  if (DB.user && DB.user.plan && DB.user.planEnd) {
    const endTs = new Date(DB.user.planEnd).getTime();
    if (!Number.isNaN(endTs) && Date.now() > endTs) {
      isActive = false;
    }
  }

  const today = todayKey();

  if (!isActive) {
    return { items: [], plan, dailyCap: rule.dailyCap, date: today };
  }

  let shortlist = Array.isArray(state.shortlist) ? state.shortlist : [];
  const pending = shortlist.filter(p => p.status === 'pending' || !p.status);

  // If we already served today's batch, do NOT add new profiles again.
  if (state.shortlistLastDate === today) {
    shortlist = pending;
  } else {
    const pendingCount = pending.length;
    const slotsFree = Math.max(0, rule.dailyCap - pendingCount);

    shortlist = pending;
    if (slotsFree > 0) {
      const newOnes = generateDemoProfiles(slotsFree, state.prefs || DB.prefs || {});
      shortlist = pending.concat(newOnes);
    }
  }

  const nextState = {
    shortlist,
    shortlistLastDate: today
  };

  await saveShortlistState(email, nextState);

  return {
    items: shortlist,
    plan,
    dailyCap: rule.dailyCap,
    date: today
  };
}

async function addScheduledDate(email, profile) {
  if (!email || !profile) return;

  if (hasFirebase && usersCollection) {
    const existing = await findUserByEmail(email);
    if (!existing) return;
    const current = Array.isArray(existing.scheduledDates)
      ? existing.scheduledDates
      : [];
    current.push(profile);
    await usersCollection.doc(existing.id).update({ scheduledDates: current });
  } else {
    if (!DB.datesState[email]) DB.datesState[email] = [];
    DB.datesState[email].push(profile);
  }
}

async function loadScheduledDates(email) {
  if (!email) return [];

  if (hasFirebase && usersCollection) {
    const existing = await findUserByEmail(email);
    if (!existing || !Array.isArray(existing.scheduledDates)) return [];
    return existing.scheduledDates;
  }

  return DB.datesState[email] || [];
}


// ✅ Approved helpers (Firestore or demo memory)
async function addApprovedProfile(email, profile) {
  if (!email || !profile) return;

  if (hasFirebase && usersCollection) {
    const existing = await findUserByEmail(email);
    if (!existing) return;

    const current = Array.isArray(existing.approvedProfiles)
      ? existing.approvedProfiles
      : [];

    const exists = current.some((p) => String(p.id) === String(profile.id));
    if (!exists) current.push(profile);

    await usersCollection.doc(existing.id).update({ approvedProfiles: current });
  } else {
    if (!DB.approvedState[email]) DB.approvedState[email] = [];
    const exists = DB.approvedState[email].some((p) => String(p.id) === String(profile.id));
    if (!exists) DB.approvedState[email].push(profile);
  }
}


async function saveApprovedProfiles(email, list){
  if (!email) return;
  if (hasFirebase && usersCollection){
    const existing = await findUserByEmail(email);
    if (!existing) return;
    await usersCollection.doc(existing.id).update({ approvedProfiles: Array.isArray(list) ? list : [] });
  } else {
    DB.approvedState[email] = Array.isArray(list) ? list : [];
  }
}
async function loadApprovedProfiles(email) {
  if (!email) return [];

  if (hasFirebase && usersCollection) {
    const existing = await findUserByEmail(email);
    if (!existing || !Array.isArray(existing.approvedProfiles)) return [];
    return existing.approvedProfiles;
  }

  return DB.approvedState[email] || [];
}

// ---------------- Auth: REGISTER -------------------
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, city } = req.body || {};

    const emailNorm = (email || '').toString().trim().toLowerCase();
    const pass = (password || '').toString();
    const nameNorm = (name || '').toString().trim();

    if (!emailNorm || !pass) {
      return res.status(400).json({ ok: false, message: 'email & password required' });
    }

    // ❗ Demo mode kung walang Firebase
    if (!hasFirebase) {
      // fresh per-user state (do NOT inherit global DB.user/DB.prefs)
      DB.user = {
        id: 'demo-1',
        email: emailNorm,
        name: nameNorm || emailNorm.split('@')[0] || 'User',
        city: city ? String(city) : '',
        plan: 'free',
        planStart: new Date().toISOString(),
        planEnd: null,
        avatarUrl: '',
        prefsSaved: false,
        planActive: true
      };

      // reset per-email prefs to empty on first register
      DB.prefsByEmail[emailNorm] = null;
      DB.prefs = null;

      DB.shortlistState[emailNorm] = { shortlist: [], shortlistLastDate: null };
      DB.datesState[emailNorm] = [];

      // cache clean baseline user for middleware hydration
      DB.users[emailNorm] = { ...DB.user };

      return res.json({ ok: true, user: DB.user });
    }

    // Check kung existing na sa Firestore
    const existing = await findUserByEmail(emailNorm);
    if (existing) {
      return res.status(409).json({ ok: false, message: 'email already registered' });
    }

    const passwordHash = await bcrypt.hash(pass, 10);

    const docData = {
      email: emailNorm,
      passwordHash,
      name: nameNorm || emailNorm.split('@')[0] || 'User',
      city: city ? String(city) : '',
      plan: 'free',
      planStart: new Date().toISOString(),
      planEnd: null,
      avatarUrl: '',
      prefsSaved: false,
      emailVerified: false,
      prefs: null,
      planActive: true,
      shortlist: [],
      shortlistLastDate: null,
      scheduledDates: []
    };

    const newUser = await createUserDoc(docData);

    DB.user = publicUser(newUser);
    DB.prefs = null;


    DB.users[emailNorm] = { ...DB.user };
    DB.prefsByEmail[emailNorm] = DB.prefs;
    setSession(res, emailNorm);
    saveUsersStore();
    return res.json({ ok: true, user: DB.user });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ ok: false, message: 'server error' });
  }
});

// ---------------- Auth: LOGIN -------------------
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    const emailNorm = (email || '').toString().trim().toLowerCase();
    const pass = (password || '').toString();

    if (!emailNorm || !pass) {
      return res.status(400).json({ ok: false, message: 'email & password required' });
    }

    

    // ✅ DEV bypass accounts (demo1/demo2/demo3): auto-create + auto-activate tier/prefs
    if (ALLOW_TEST_BYPASS && process.env.NODE_ENV !== 'production') {
      const demo = TEST_BYPASS_ACCOUNTS[emailNorm];
      if (demo && pass === demo.password) {
        const now = new Date();
        const rule = PLAN_RULES[demo.plan] || PLAN_RULES.tier1;
        const planStart = now.toISOString();
        const planEnd = new Date(now.getTime() + rule.durationDays * DAY_MS).toISOString();

        if (hasFirebase) {
          let userDoc = await findUserByEmail(emailNorm);
          const passwordHash = await bcrypt.hash(pass, 10);

          if (!userDoc) {
            userDoc = await createUserDoc({
              email: emailNorm,
              passwordHash,
              name: demo.name,
              city: demo.city,
              plan: demo.plan,
              planStart,
              planEnd,
              avatarUrl: '',
              prefsSaved: true,
              prefs: demo.prefs,
              shortlist: [],
              shortlistLastDate: null,
              scheduledDates: [],
              approvedProfiles: []
            });
          } else {
            // If you previously created a broken demo doc (missing passwordHash), fix it here
            const fields = {
              name: demo.name,
              city: demo.city,
              plan: demo.plan,
              planStart,
              planEnd,
              prefsSaved: true,
              prefs: demo.prefs
            };
            if (!userDoc.passwordHash) fields.passwordHash = passwordHash;
            userDoc = await updateUserByEmail(emailNorm, fields);
          }

          DB.prefs = userDoc.prefs || demo.prefs;
          DB.user = publicUser(userDoc);
          DB.user.prefsSaved = true;
        } else {
          // fallback: in-memory demo mode
          DB.user.email = emailNorm;
          DB.user.name = demo.name;
          DB.user.city = demo.city;
          DB.user.plan = demo.plan;
          DB.user.planStart = planStart;
          DB.user.planEnd = planEnd;
          DB.user.planActive = true;
          DB.user.prefsSaved = true;

          DB.prefs = demo.prefs;
          DB.users[emailNorm] = { ...DB.user };
          DB.prefsByEmail[emailNorm] = DB.prefs;
        }

        // Cache + set session cookie so other pages show the right user
        DB.users[emailNorm] = { ...DB.user };
        DB.prefsByEmail[emailNorm] = DB.prefs;

        setSession(res, emailNorm);
        return res.json({ ok: true, user: DB.user, bypass: true });
      }
    }

// ❗ Demo mode fallback (no Firebase)
    if (!hasFirebase) {
      // hydrate clean per-user state (do NOT inherit previous DB.user)
      if (DB.users[emailNorm]) {
        DB.user = { ...DB.users[emailNorm] };
      } else {
        DB.user = {
          id: 'demo-1',
          email: emailNorm,
          name: emailNorm.split('@')[0] || 'User',
          city: '—',
          plan: null,
          planStart: null,
          planEnd: null,
          avatarUrl: '',
          prefsSaved: false,
          planActive: false
        };
      }

      // load per-email prefs (default null)
      DB.prefs = Object.prototype.hasOwnProperty.call(DB.prefsByEmail, emailNorm)
        ? DB.prefsByEmail[emailNorm]
        : null;
      if (emailNorm === DEMO_EMAIL && pass === DEMO_PASSWORD) {
        // SPECIAL DEMO ACCOUNT IN PURE IN-MEMORY MODE
        const now  = new Date();
        const rule = PLAN_RULES['tier3'];

        DB.user.name       = 'Aries Aquino (Demo)';
        DB.user.city       = DB.user.city || 'Manila';
        DB.user.plan       = 'tier3';
        DB.user.planStart  = now.toISOString();
        DB.user.planEnd    = new Date(now.getTime() + rule.durationDays * DAY_MS).toISOString();
        DB.user.planActive = true;

        // Default prefs so preferences step is already done
        DB.prefs = DB.prefs || {
          city: 'Manila',
          ageMin: 21,
          ageMax: 35,
          lookingFor: ['women']
        };
        DB.user.prefsSaved = true;
      } else {
        DB.user.prefsSaved = Boolean(DB.prefs);

        // recompute planActive based on planEnd if present
        if (DB.user.plan && DB.user.planEnd) {
          const endTs = new Date(DB.user.planEnd).getTime();
          DB.user.planActive = !Number.isNaN(endTs) && Date.now() <= endTs;
        } else {
          DB.user.planActive = false;
        }
      }

      if (!DB.shortlistState[emailNorm]) {
        DB.shortlistState[emailNorm] = { shortlist: [], shortlistLastDate: null };
      }
      if (!DB.datesState[emailNorm]) {
        DB.datesState[emailNorm] = [];
      }

      DB.users[emailNorm] = { ...DB.user };
      DB.prefsByEmail[emailNorm] = DB.prefs;
      setSession(res, emailNorm);

      return res.json({ ok: true, user: DB.user, demo: emailNorm === DEMO_EMAIL });
    }

    // ---------- Firebase mode ----------
    let userDoc = await findUserByEmail(emailNorm);

    // SPECIAL DEMO ACCOUNT (auto-create if missing)
    if (!userDoc && emailNorm === DEMO_EMAIL && pass === DEMO_PASSWORD) {
      const passwordHash = await bcrypt.hash(pass, 10);
      const now          = new Date();
      const rule         = PLAN_RULES['tier3'];
      const planStart    = now.toISOString();
      const planEnd      = new Date(now.getTime() + rule.durationDays * DAY_MS).toISOString();

      const docData = {
        email: emailNorm,
        passwordHash,
        name: 'Aries Aquino (Demo)',
        city: 'Manila',
        plan: 'tier3',
        planStart,
        planEnd,
        avatarUrl: '',
        prefsSaved: true,
        prefs: {
          city: 'Manila',
          ageMin: 21,
          ageMax: 35,
          lookingFor: ['women']
        },
        planActive: true,
        shortlist: [],
        shortlistLastDate: null,
        scheduledDates: []
      };

      const newUser = await createUserDoc(docData);

      DB.prefs = docData.prefs;
      DB.user  = publicUser(newUser);
      DB.user.prefsSaved = true;

      return res.json({ ok: true, user: DB.user, demo: true });
    }

    if (!userDoc) {
      clearSession(res);
      return res.status(401).json({ ok: false, message: 'invalid credentials' });
    }

    if (!userDoc.passwordHash) {
      clearSession(res);
      return res.status(401).json({ ok: false, message: 'invalid credentials' });
    }

    const ok = await bcrypt.compare(pass, userDoc.passwordHash);
    if (!ok) {
      clearSession(res);
      return res.status(401).json({ ok: false, message: 'invalid credentials' });
    }

    // Ensure every logged-in user has at least the free plan
    if (!userDoc.plan) {
      userDoc.plan = 'free';
      userDoc.planActive = true;
      userDoc.planStart = userDoc.planStart || new Date().toISOString();
      userDoc.planEnd = null;

      if (hasFirebase) {
        try {
          await updateUserByEmail(emailNorm, {
            plan: 'free',
            planActive: true,
            planStart: userDoc.planStart,
            planEnd: null,
          });
        } catch (e) {
          console.warn('Failed to persist free plan on login:', e);
        }
      }
    }

    DB.prefs = userDoc.prefs || null;
    DB.user = publicUser(userDoc);
    DB.user.prefsSaved = Boolean(DB.prefs || userDoc.prefsSaved);


    DB.users[emailNorm] = { ...DB.user };
    DB.prefsByEmail[emailNorm] = DB.prefs;
    setSession(res, emailNorm);

    return res.json({ ok: true, user: DB.user });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ ok: false, message: 'server error' });
  }
});

// ---------------- Auth: LOGOUT (clears cookie session) -------------------
app.post('/api/auth/logout', (req, res) => {
  clearSession(res);
  setAnonState();
  return res.json({ ok: true });
});

// ---------------- Mock OAuth -------------------
app.post('/api/auth/oauth/mock', (_req, res) => {
  if (!DB.user) DB.user = {};
  if (!DB.user.email) {
    DB.user.email = 'oauth-demo@truematch.app';
    DB.user.name = DB.user.name || 'Demo User';
  }
  DB.user.prefsSaved = Boolean(DB.prefs);
  DB.user.planActive = false;
  return res.json({ ok: true, user: DB.user });
});

// ---------------- Current user -------------------
// GET /api/me - Current User Session (cookie-based)
// This uses the same email cookie + in-memory DB that login / logout already maintain.
// Firestore is still the source of truth on login; here we only read the cached user.
app.get('/api/me', (req, res) => {
  try {
    const email = getSessionEmail(req);
    if (!email) {
      return res.json({ ok: false, user: null, demo: false });
    }

    // Prefer per-email cache, then fallback to global DB.user if same email
    let user = DB.users[email] || null;
    if (!user && DB.user && DB.user.email === email) {
      user = { ...DB.user };
    }

    if (!user) {
      return res.json({ ok: false, user: null, demo: false });
    }

    // Attach prefs from cache (populated at login and when saving preferences)
    const prefs = DB.prefsByEmail[email] || DB.prefs || null;
    const prefsSaved = Boolean(prefs || user.prefsSaved);

    // Keep central DB pointers in sync
    DB.user = { ...user, prefsSaved };
    DB.prefs = prefs || null;
    DB.users[email] = { ...DB.user };
    if (prefs) {
      DB.prefsByEmail[email] = prefs;
    }

    const responseUser = {
      ...DB.user,
      prefsSaved,
      preferences: prefs || null
    };

    return res.json({
      ok: true,
      user: responseUser,
      prefs,
      demo: email === DEMO_EMAIL || Boolean(TEST_BYPASS_ACCOUNTS[email])
    });
  } catch (err) {
    console.error('error in /api/me:', err);
    return res.status(500).json({ ok: false, user: null, message: 'internal error' });
  }
});


/**
 * Preferences endpoints live below.
 */
// ---------------- Preferences -------------------

app.post('/api/me/preferences', async (req, res) => {
  try {
    const body = req.body || {};

    const cityRaw = body.city;
    const ageMinRaw = (typeof body.ageMin !== 'undefined') ? body.ageMin : body.minAge;
    const ageMaxRaw = (typeof body.ageMax !== 'undefined') ? body.ageMax : body.maxAge;
    const lookingRaw = (typeof body.lookingFor !== 'undefined') ? body.lookingFor : body.looking_for;
    const ethRaw = body.ethnicity;

    const city = (cityRaw || '').toString().trim();
    const min = Number(ageMinRaw);
    const max = Number(ageMaxRaw);

    if (!city) {
      return res.status(400).json({ ok: false, message: 'city required' });
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 18 || max < min) {
      return res.status(400).json({ ok: false, message: 'invalid age range' });
    }

    // normalize + validate ethnicity (optional)
    const allowedEth = new Set(['african','asian','caucasian','hispanic','middle-eastern','mixed','other']);
    let eth = undefined;
    if (typeof ethRaw !== 'undefined' && ethRaw !== null) {
      const cand = String(ethRaw).trim().toLowerCase();
      if (allowedEth.has(cand)) eth = cand;
    }

    // normalize lookingFor to an array of strings
    let lf = [];
    if (Array.isArray(lookingRaw)) {
      lf = lookingRaw.map(v => String(v).trim()).filter(Boolean);
    } else if (typeof lookingRaw === 'string') {
      if (lookingRaw.includes(',')) {
        lf = lookingRaw.split(',').map(s => s.trim()).filter(Boolean);
      } else if (lookingRaw.trim()) {
        lf = [lookingRaw.trim()];
      }
    }

    if (!lf.length) {
      return res.status(400).json({ ok: false, message: 'lookingFor required' });
    }

    // Save in memory
    DB.prefs = {
      city,
      ageMin: min,
      ageMax: max,
      lookingFor: lf,
      ...(eth ? { ethnicity: eth } : {})
    };
    DB.user.prefsSaved = true;

    // IMPORTANT: persist to per-email cache so next requests keep it
    const email = DB.user?.email || getSessionEmail(req);
    if (email) {
      DB.prefsByEmail[email] = DB.prefs;
      if (DB.users[email]) {
        DB.users[email].prefsSaved = true;
      } else {
        DB.users[email] = { ...(DB.user || {}), email, prefsSaved: true };
      }

      // Persist to disk only when Firebase is OFF (demo/local fallback)
      if (!hasFirebase) {
        try {
          savePrefsStore();
        } catch (err) {
          console.warn('error saving prefs store:', err);
        }
      }
    }

    // Push to Firestore if available
    if (hasFirebase && email) {
      try {
        await updateUserByEmail(email, { prefs: DB.prefs, prefsSaved: true });
      } catch (err) {
        console.error('error saving prefs to Firestore:', err);
      }
    }

    return res.json({ ok: true, prefs: DB.prefs });
  } catch (err) {
    console.error('error in /api/me/preferences:', err);
    return res.status(500).json({ ok: false, message: 'server error' });
  }
});
// ---------------- Update Profile (name/email/password/avatar) ----------------
// [UPDATED] Update Profile (Handles EVERYTHING: Info, Avatar, Password, Age, City)
app.post('/api/me/profile', async (req, res) => {
  try {
    if (!DB.user || !DB.user.email) {
      return res.status(401).json({ ok: false, message: 'not logged in' });
    }

    // 1. Kunin LAHAT ng data galing sa request
    let { name, email, password, avatarDataUrl, age, city } = req.body || {};

    // Basic sanitization
    name = (name || '').toString().trim();
    email = (email || '').toString().trim().toLowerCase();
    city = (city || '').toString().trim();
    age = age ? Number(age) : null;
    avatarDataUrl = (avatarDataUrl || '').toString();

    // Validate Email
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, message: 'invalid email' });
    }

    const oldEmail = DB.user.email;

    // 2. Build Update Fields (Kung ano lang ang binigay, yun lang ang ia-update)
    const fields = {};
    if (name) fields.name = name;
    if (email) fields.email = email;
    if (age) fields.age = age;
    if (city) fields.city = city;
    if (avatarDataUrl) fields.avatarUrl = avatarDataUrl;

    // Handle Password Update (Only if provided)
    if (password && password.trim().length > 0) {
      const hash = await bcrypt.hash(password, 10);
      fields.passwordHash = hash;
    }

    // 3. Update Database (Firestore & Memory)
    if (hasFirebase && usersCollection) {
      const existing = await findUserByEmail(oldEmail);
      if (!existing) return res.status(404).json({ ok: false, message: 'user not found' });

      // Update Firestore
      await usersCollection.doc(existing.id).update(fields);

      // Refresh Memory Data
      const updatedData = { ...existing, ...fields };
      
      // Kung nagbago ang email, ayusin ang mapping
      if (email && email !== oldEmail) {
        // Ilipat ang data sa bagong email key
        DB.users[email] = { ...updatedData, id: existing.id };
        DB.prefsByEmail[email] = DB.prefsByEmail[oldEmail];
        
        // Burahin ang luma
        delete DB.users[oldEmail];
        delete DB.prefsByEmail[oldEmail];
      } else {
        // Update lang yung existing key
        DB.users[oldEmail] = { ...updatedData, id: existing.id };
      }
      
      // Update Current Session User
      DB.user = publicUser({ id: existing.id, ...updatedData });

    } else {
      // LOCAL DEMO MODE UPDATE
      Object.assign(DB.user, fields); // Update session user
      
      // Update Global Store
      if (DB.users[oldEmail]) {
        Object.assign(DB.users[oldEmail], fields);
        
        // Handle Email Change in Local Mode
        if (email && email !== oldEmail) {
          DB.users[email] = DB.users[oldEmail];
          DB.users[email].email = email;
          delete DB.users[oldEmail];
        }
      }
      saveUsersStore(); // Save to _users_store.json immediately
    }

    console.log(`[Profile] Updated details for ${email || oldEmail}`);
    return res.json({ ok: true, user: DB.user });

  } catch (err) {
    console.error('update profile error:', err);
    return res.status(500).json({ ok: false, message: 'server error' });
  }
});

// ---------------- KPIs demo (optional) -------------------
app.get('/api/kpis', (_req, res) => {
  // You can update this later to use real counters if needed
  res.json({ ok: true, today: 20, approved: 5, dates: 0 });
});

// ---------------- Shortlist (plan logic) -------------------
app.get('/api/shortlist', async (_req, res) => {
  try {
    const email = DB.user && DB.user.email;
    if (!email) {
      return res.status(401).json({ ok: false, message: 'not logged in' });
    }

    const data = await serveShortlistForToday(email);
    return res.json({ ok: true, ...data });
  } catch (err) {
    console.error('shortlist error:', err);
    return res.status(500).json({ ok: false, message: 'server error' });
  }
});

// ✅ Approved list (persisted per user)

// ✅ Approved list (persisted per user)
app.get('/api/shortlist/approved', async (_req, res) => {
  try {
    const email = DB.user && DB.user.email;
    if (!email) {
      return res.status(401).json({ ok: false, message: 'not logged in' });
    }

    const approved = await loadApprovedProfiles(email);
    return res.json({ ok: true, approved });
  } catch (err) {
    console.error('approved error:', err);
    return res.status(500).json({ ok: false, message: 'server error' });
  }
});

// Request a date from an APPROVED profile (moves from approved -> scheduledDates)
app.post('/api/approved/date', async (req, res) => {
  try {
    const email = DB.user && DB.user.email;
    if (!email) {
      return res.status(401).json({ ok: false, message: 'not logged in' });
    }

    const { profileId } = req.body || {};
    if (!profileId) {
      return res.status(400).json({ ok: false, message: 'profileId required' });
    }

    const approved = await loadApprovedProfiles(email);
    const idx = approved.findIndex((p) => String(p.id) === String(profileId));
    if (idx === -1) {
      return res
        .status(404)
        .json({ ok: false, message: 'profile not in approved list' });
    }

    const profile = approved[idx];
    approved.splice(idx, 1);
    await saveApprovedProfiles(email, approved);

    const scheduled = {
      ...profile,
      status: 'scheduled',
      scheduledAt: new Date().toISOString()
    };
    await addScheduledDate(email, scheduled);

    return res.json({ ok: true });
  } catch (err) {
    console.error('approved/date error:', err);
    return res.status(500).json({ ok: false, message: 'server error' });
  }
});

// User decisions: approve, pass, request date (Tier 3)

// User decisions: approve, pass, request date (Tier 3)
app.post('/api/shortlist/decision', async (req, res) => {
  try {
    const email = DB.user && DB.user.email;
    if (!email) {
      return res.status(401).json({ ok: false, message: 'not logged in' });
    }

    const { profileId, action } = req.body || {};
    if (!profileId || !['approve', 'pass', 'date'].includes(action)) {
      return res.status(400).json({ ok: false, message: 'invalid action' });
    }

    const state = await loadShortlistState(email);
    let shortlist = Array.isArray(state.shortlist) ? state.shortlist : [];

    const idx = shortlist.findIndex(p => String(p.id) === String(profileId));
    if (idx === -1) {
      return res.json({ ok: true }); // already removed / not found
    }

    const profile = shortlist[idx];

    // remove from shortlist once may decision na
    shortlist.splice(idx, 1);

    if (action === 'date') {
      const scheduled = {
        ...profile,
        status: 'scheduled',
        scheduledAt: new Date().toISOString()
      };
      await addScheduledDate(email, scheduled);
    } else if (action === 'approve') {
      await addApprovedProfile(email, profile);
    }

    const nextState = { ...state, shortlist };
    await saveShortlistState(email, nextState);

    return res.json({ ok: true });
  } catch (err) {
    console.error('decision error:', err);
    return res.status(500).json({ ok: false, message: 'server error' });
  }
});

// ---------------- Admin auth (username + password login) -------------------
app.post('/api/admin/login', (req, res) => {
  try {
    const { username, password, email } = req.body || {};

    // Allow either explicit username field or fallback to email field
    const userInput = (username || email || '').toString().trim();
    const pass = (password || '').toString();

    let ok = false;

    if (
      userInput === ADMIN_LOGIN_USERNAME &&
      pass === ADMIN_LOGIN_PASSWORD
    ) {
      ok = true;
    }

    if (!ok) {
      return res
        .status(401)
        .json({ ok: false, message: 'invalid_admin_credentials' });
    }

    // Frontend will store this key in localStorage and send as x-admin-key
    return res.json({ ok: true, adminKey: ADMIN_ACCESS_KEY });
  } catch (err) {
    console.error('admin login error:', err);
    return res.status(500).json({ ok: false, message: 'server error' });
  }
});

// Simple “who am I” check for admin
app.get('/api/admin/me', (req, res) => {
  try {
    const providedKey = getProvidedAdminKey(req);
    if (!isValidAdminKey(providedKey)) {
      return res
        .status(401)
        .json({ ok: false, message: 'admin_unauthorized' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('admin me error:', err);
    return res.status(500).json({ ok: false, message: 'server error' });
  }
});

// Stateless logout – frontend lang maglilinis ng localStorage
app.post('/api/admin/logout', (req, res) => {
  return res.json({ ok: true });
});

// ---------------- Admin helpers (secured by admin key) -------------------

// 1) List active users per tier
app.get('/api/admin/users', async (req, res) => {
  try {
    const providedKey = getProvidedAdminKey(req);
    if (!isValidAdminKey(providedKey)) {
      return res
        .status(401)
        .json({ ok: false, message: 'admin_unauthorized' });
    }

    let { tier } = req.query || {};
    const allowed = ['tier1', 'tier2', 'tier3'];
    tier = String(tier || 'tier1').toLowerCase();
    if (!allowed.includes(tier)) tier = 'tier1';

    const items = [];

    if (hasFirebase && usersCollection) {
      const snap = await usersCollection
        .where('plan', '==', tier)
        .get();

      snap.forEach((docSnap) => {
        const user = publicUser({ id: docSnap.id, ...docSnap.data() });
        if (user && user.planActive) {
          items.push(user);
        }
      });
    } else {
      // Demo / fallback: only DB.user
      if (
        DB.user &&
        DB.user.plan === tier &&
        Boolean(DB.user.planActive)
      ) {
        items.push(publicUser(DB.user));
      }
    }

    return res.json({ ok: true, tier, items });
  } catch (err) {
    console.error('admin users error:', err);
    return res.status(500).json({ ok: false, message: 'server error' });
  }
});

// 2) Load shortlist state for a given user
app.get('/api/admin/state', async (req, res) => {
  try {
    const providedKey = getProvidedAdminKey(req);
    if (!isValidAdminKey(providedKey)) {
      return res
        .status(401)
        .json({ ok: false, message: 'admin_unauthorized' });
    }

    let { email } = req.query || {};
    if (!email) {
      return res
        .status(400)
        .json({ ok: false, message: 'email required' });
    }

    const emailNorm = String(email).trim().toLowerCase();
    if (!emailNorm) {
      return res
        .status(400)
        .json({ ok: false, message: 'invalid email' });
    }

    // If Firebase mode, make sure user exists
    if (hasFirebase && usersCollection) {
      const existing = await findUserByEmail(emailNorm);
      if (!existing) {
        return res
          .status(404)
          .json({ ok: false, message: 'user_not_found' });
      }
    }

    const state = await loadShortlistState(emailNorm);
    const plan =
      state.plan || (DB.user && DB.user.plan) || null;
    const rule =
      plan && PLAN_RULES[plan]
        ? PLAN_RULES[plan]
        : PLAN_RULES.tier1;
    const today = todayKey();

    const shortlist = Array.isArray(state.shortlist)
      ? state.shortlist
      : [];
    const todayShortlist =
      state.shortlistLastDate === today ? shortlist : [];

    return res.json({
      ok: true,
      email: emailNorm,
      plan,
      dailyCap: rule.dailyCap,
      shortlistLastDate: state.shortlistLastDate,
      today,
      totalShortlist: shortlist.length,
      todayShortlist
    });
  } catch (err) {
    console.error('admin state error:', err);
    return res.status(500).json({ ok: false, message: 'server error' });
  }
});

// 3) Serve shortlist for today (STRICT: one batch per user per day, plan-based cap)
app.post('/api/admin/shortlist', async (req, res) => {
  try {
    const providedKey = getProvidedAdminKey(req);
    if (!isValidAdminKey(providedKey)) {
      return res
        .status(401)
        .json({ ok: false, message: 'admin_unauthorized' });
    }

    let { email, profiles } = req.body || {};
    if (!email || !Array.isArray(profiles)) {
      return res.status(400).json({
        ok: false,
        message: 'email and profiles[] required'
      });
    }

    const emailNorm = String(email).trim().toLowerCase();
    if (!emailNorm) {
      return res
        .status(400)
        .json({ ok: false, message: 'invalid email' });
    }

    // ✅ Load state first so we can enforce "once per day"
    const today = todayKey();
    const state = await loadShortlistState(emailNorm);

    if (state.shortlistLastDate === today) {
      const existingCount = Array.isArray(state.shortlist) ? state.shortlist.length : 0;
      return res.status(409).json({
        ok: false,
        message: 'already_served_today',
        email: emailNorm,
        date: today,
        existingCount
      });
    }

    // If Firebase mode, make sure user exists (and optionally use doc for plan)
    let userDoc = null;
    if (hasFirebase && usersCollection) {
      userDoc = await findUserByEmail(emailNorm);
      if (!userDoc) {
        return res
          .status(404)
          .json({ ok: false, message: 'user_not_found' });
      }
    }

    // ✅ Determine plan + cap server-side (do not trust frontend)
    const planCandidate =
      state.plan ||
      (userDoc && userDoc.plan) ||
      (DB.users[emailNorm] && DB.users[emailNorm].plan) ||
      'tier1';

    const plan = (planCandidate && PLAN_RULES[planCandidate]) ? planCandidate : 'tier1';
    const rule = PLAN_RULES[plan] || PLAN_RULES.tier1;
    const dailyCap = Number(rule.dailyCap || 20);

    // Limit profiles based on plan cap (default 20)
    const maxCount = dailyCap;
    const input = profiles.slice(0, maxCount);

    const base = Date.now();
    const nowIso = new Date().toISOString();

    const normalized = input.map((p, idx) => {
      const name =
        p && p.name ? String(p.name).trim() : `Candidate ${idx + 1}`;
      const city =
        p && p.city ? String(p.city).trim() : 'Lagos';
      const igUrl =
        p && p.igUrl ? String(p.igUrl).trim() : '';

      const username =
        p && p.username
          ? String(p.username).trim().replace(/^@/, '')
          : (() => {
              const m = String(igUrl || '').match(/instagram\.com\/([^/?#]+)/i);
              return m ? m[1] : '';
            })();

      const ageRange =
        p && (p.ageRange || p.age)
          ? String(p.ageRange || p.age).trim()
          : '';

      const photoUrl =
        p && (p.photoUrl || p.avatar)
          ? String(p.photoUrl || p.avatar).trim()
          : '';

      return {
        id: p && p.id ? p.id : `admin_${base}_${idx + 1}`,
        name,
        username,
        city,
        ageRange,
        igUrl,
        photoUrl,
        avatar: photoUrl, // backward-compatible
        score:
          p && typeof p.score === 'number'
            ? p.score
            : 80 + (idx % 20),
        status: 'pending',
        servedAt: nowIso
      };
    });

    const nextState = {
      ...state,
      shortlist: normalized,
      shortlistLastDate: today
    };

    await saveShortlistState(emailNorm, nextState);

    return res.json({
      ok: true,
      email: emailNorm,
      plan,
      dailyCap,
      date: today,
      count: normalized.length
    });
  } catch (err) {
    console.error('admin shortlist error:', err);
    return res.status(500).json({ ok: false, message: 'server error' });
  }
});


// 4) Save confirmed date (Tier 3)
app.post('/api/admin/confirmed-date', async (req, res) => {
  try {
    const providedKey = getProvidedAdminKey(req);
    if (!isValidAdminKey(providedKey)) {
      return res
        .status(401)
        .json({ ok: false, message: 'admin_unauthorized' });
    }

    let {
      email,
      candidateName,
      igUrl,
      city,
      scheduledAt,
      location,
      notes
    } = req.body || {};

    const emailNorm = String(email || '').trim().toLowerCase();
    if (!emailNorm || !candidateName || !scheduledAt) {
      return res.status(400).json({
        ok: false,
        message: 'email, candidateName & scheduledAt required'
      });
    }

    const profile = {
      id: `date_${Date.now()}`,
      name: String(candidateName).trim(),
      igUrl: igUrl ? String(igUrl).trim() : '',
      city: city ? String(city).trim() : '',
      location: location ? String(location).trim() : '',
      notes: notes ? String(notes).trim() : '',
      status: 'scheduled',
      scheduledAt: String(scheduledAt)
    };

    await addScheduledDate(emailNorm, profile);

    return res.json({ ok: true });
  } catch (err) {
    console.error('admin confirmed-date error:', err);
    return res.status(500).json({ ok: false, message: 'server error' });
  }
});

// ---------------- Dates (Tier 3 scheduling) -------------------
app.get('/api/dates', async (_req, res) => {
  try {
    const email = DB.user && DB.user.email;
    if (!email) {
      return res.status(401).json({ ok: false, message: 'not logged in' });
    }

    const items = await loadScheduledDates(email);
    return res.json({ ok: true, items });
  } catch (err) {
    console.error('dates error:', err);
    return res.status(500).json({ ok: false, message: 'server error' });
  }
});

// ---------------- Plan selection -------------------
app.post('/api/plan/choose', async (req, res) => {
  try {
    const { plan } = req.body || {};

    if (!plan || !['tier1', 'tier2', 'tier3'].includes(plan)) {
      return res.status(400).json({ ok: false, message: 'invalid plan' });
    }

    const rule = PLAN_RULES[plan];
    const now = new Date();
    const planStart = now.toISOString();
    const planEnd = new Date(now.getTime() + rule.durationDays * DAY_MS).toISOString();

    if (!DB.user) DB.user = {};
    DB.user.plan = String(plan);
    DB.user.planStart = planStart;
    DB.user.planEnd = planEnd;
    DB.user.planActive = true;

    if (hasFirebase && DB.user.email) {
      try {
        await updateUserByEmail(DB.user.email, {
          plan: DB.user.plan,
          planStart,
          planEnd,
          planActive: true
        });
      } catch (err) {
        console.error('error saving plan to Firestore:', err);
      }
    }

    return res.json({ ok: true, user: DB.user });
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'server error' });
  }
});

// ---------------- Coinbase Commerce (crypto) checkout -------------------
// We removed Stripe entirely. Coinbase Commerce is the ONLY subscription payment provider.
//
// Env needed:
// - COINBASE_COMMERCE_API_KEY        (API Keys page in Coinbase Commerce)
// - COINBASE_COMMERCE_WEBHOOK_SECRET (Webhook subscription "Shared Secret")
//
// Optional:
// - COINBASE_FULFILL_AT = PENDING | COMPLETED   (default: PENDING)

const crypto = require('crypto');

const COINBASE_API_BASE = 'https://api.commerce.coinbase.com';
const COINBASE_API_KEY =
  process.env.COINBASE_COMMERCE_API_KEY ||
  process.env.COINBASE_API_KEY ||
  '';

const COINBASE_WEBHOOK_SECRET =
  process.env.COINBASE_COMMERCE_WEBHOOK_SECRET ||
  process.env.COINBASE_WEBHOOK_SHARED_SECRET ||
  process.env.COINBASE_WEBHOOK_SECRET ||
  '';

const COINBASE_API_VERSION = process.env.COINBASE_COMMERCE_API_VERSION || '2018-03-22';
const COINBASE_FULFILL_AT = String(process.env.COINBASE_FULFILL_AT || 'PENDING').toUpperCase(); // PENDING or COMPLETED

// Match your current pricing (same values used in pay.js)
// [FIXED] Match Coinbase API requirements (amount + currency)
const COINBASE_PLANS = {
  tier1: {
    name: 'Plus',
    amount: '28.12',  // Changed from 'price' to 'amount'
    currency: 'USD'   // Added currency
  },
  tier2: {
    name: 'Elite',
    amount: '95.00',
    currency: 'USD'
  },
  tier3: {
    name: 'Concierge',
    amount: '485.00',
    currency: 'USD'
  },
  creator_access: {
    name: 'Creator Access',
    amount: '9.99',
    currency: 'USD'
  }
};
function safeEqualHex(sigA, sigB) {
  try {
    const a = Buffer.from(String(sigA || '').trim(), 'hex');
    const b = Buffer.from(String(sigB || '').trim(), 'hex');
    if (!a.length || !b.length) return false;
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function coinbaseRequest(path, { method = 'GET', body } = {}) {
  if (!COINBASE_API_KEY) throw new Error('coinbase_not_configured');

  const url = `${COINBASE_API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-CC-Api-Key': COINBASE_API_KEY,
    'X-CC-Version': COINBASE_API_VERSION
  };

  const r = await fetch(url, {
    method,
    headers,
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
  });

  let json = null;
  try { json = await r.json(); } catch {}
  if (!r.ok) {
  const errInfo = json && (json.error || json.message || json.error_message);
  let msg = errInfo ? errInfo : `coinbase_http_${r.status}`;

  // Coinbase sometimes returns objects like {type, message}
  if (msg && typeof msg === 'object') {
    msg = msg.message || msg.error || JSON.stringify(msg);
  }

  const err = new Error(String(msg || 'coinbase_error'));
  err.status = r.status;
  err.payload = json;
  throw err;
}
  return json;
}

function unwrapCharge(response) {
  // Response can be { data: {...} } depending on endpoint/version
  return (response && response.data) ? response.data : response;
}

function getChargeStatus(charge) {
  // Latest status is the last entry in timeline (per Coinbase docs)
  const tl = charge && charge.timeline;
  if (Array.isArray(tl) && tl.length) {
    return String(tl[tl.length - 1].status || '').toUpperCase();
  }
  return '';
}

function isFulfilledStatus(status) {
  const s = String(status || '').toUpperCase();
  if (COINBASE_FULFILL_AT === 'COMPLETED') return s === 'COMPLETED';
  // default: fulfill at PENDING or COMPLETED (fast + safe enough for most digital goods)
  return s === 'PENDING' || s === 'COMPLETED';
}

// server.js (Updated activatePlanForEmail)

async function activatePlanForEmail(email, planKey, extra = {}) {
  const key = String(planKey || '').trim();
  const e = String(email || '').toLowerCase();
  
  if (!email) return null;

  // --- CASE A: CREATOR ACCESS (ADD-ON) ---
  if (key === 'creator_access') {
    console.log(`[Payment] Activating CREATOR ACCESS for ${e}`);
    
    // 1. Update Memory DB
    if (DB.user && DB.user.email === e) {
      DB.user.hasCreatorAccess = true;
    }
    if (DB.users[e]) {
      DB.users[e].hasCreatorAccess = true;
      saveUsersStore();
    }

    // 2. Update Firestore
    if (hasFirebase) {
      try {
        await updateUserByEmail(e, { hasCreatorAccess: true });
      } catch (err) {
        console.error('Firestore update error (creator_access):', err);
      }
    }
    return { hasCreatorAccess: true };
  }

  // --- CASE B: MEMBERSHIP TIERS (EXISTING LOGIC) ---
  if (!PLAN_RULES[key]) return null;

  const rule = PLAN_RULES[key];
  const now = new Date();
  const planStart = now.toISOString();
  const planEnd = new Date(now.getTime() + rule.durationDays * DAY_MS).toISOString();

  // Update In-Memory
  if (DB.user && DB.user.email === e) {
    DB.user.plan = key;
    DB.user.planStart = planStart;
    DB.user.planEnd = planEnd;
    DB.user.planActive = true;
    DB.user.paymentProvider = 'coinbase_commerce';
    Object.assign(DB.user, extra || {});
  }

// Update Cache
if (DB.users[e]) {
  const prev = DB.users[e] || {};
  DB.users[e] = {
    ...prev,
    email: e,
    plan: key,
    planStart,
    planEnd,
    planActive: true,
    paymentProvider: 'coinbase_commerce',
    ...(extra || {})
  };

  // Clear shortlist/swipe/match state on upgrade
  try {
    if (DB.shortlistState && DB.shortlistState[e]) {
      delete DB.shortlistState[e];
    }
    if (DB.datesState && DB.datesState[e]) {
      delete DB.datesState[e];
    }
    if (DB.approvedState && DB.approvedState[e]) {
      delete DB.approvedState[e];
    }
    if (DB.swipes && DB.swipes[e]) {
      delete DB.swipes[e];
    }
    if (DB.matches && DB.matches[e]) {
      delete DB.matches[e];
    }
    if (typeof SERVER_SWIPE_COUNTS === 'object' &&
        SERVER_SWIPE_COUNTS &&
        SERVER_SWIPE_COUNTS[e] != null) {
      delete SERVER_SWIPE_COUNTS[e];
    }

    if (!hasFirebase) {
      saveUsersStore();
      saveSwipesStore();
    }
  } catch (err) {
    console.error('Error clearing swipe state on plan upgrade for', e, err);
  }
}



// Update Firestore
  if (hasFirebase) {
    try {
      await updateUserByEmail(e, {
        plan: key,
        planStart,
        planEnd,
        planActive: true,
        paymentProvider: 'coinbase_commerce',
        ...extra
      });
    } catch (err) {
      console.error('error saving plan to Firestore:', err);
    }
  }

  return { plan: key, planStart, planEnd, planActive: true };
}

async function createCoinbaseCharge(planKey, email) {
  const key = String(planKey || '').trim();
  const plan = COINBASE_PLANS[key];
  if (!plan) throw new Error('invalid_plan');

  const body = {
    pricing_type: 'fixed_price',
    local_price: { amount: plan.amount, currency: plan.currency },
    metadata: {
      plan: key,
      email: String(email || '').trim(),
      app: 'truematch'
    },
    // We cannot pass the charge code via redirect_url (Coinbase doesn't append extra params),
    // so we use a cookie-based return handler on our own server.
    redirect_url: `${APP_BASE_URL}/api/coinbase/return`,
    cancel_url: `${APP_BASE_URL}/api/coinbase/cancel?plan=${encodeURIComponent(key)}`
  };

  const resp = await coinbaseRequest('/charges', { method: 'POST', body });
  const c = unwrapCharge(resp);

  const hosted = c.hosted_url || c.url;
  if (!c || !hosted || !c.code) throw new Error('coinbase_bad_response');
  return { hosted_url: hosted, code: c.code, charge: c };
}

function setCoinbaseCheckoutCookies(res, { code, plan }) {
  const isHttps = String(APP_BASE_URL || '').startsWith('https://');
  const opts = {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    maxAge: 1000 * 60 * 60 // 1 hour
  };
  res.cookie('tm_cc_code', String(code || ''), opts);
  res.cookie('tm_cc_plan', String(plan || ''), opts);
}

// After Coinbase redirects back (success), we read cookies and go straight to dashboard.
// Dashboard will finalize/confirm using the session_id (Coinbase charge code).
app.get('/api/coinbase/return', (req, res) => {
  const code = String(req.cookies?.tm_cc_code || '').trim();
  const plan = String(req.cookies?.tm_cc_plan || '').trim();

  // clear cookies ASAP
  res.clearCookie('tm_cc_code');
  res.clearCookie('tm_cc_plan');

  // If we somehow lost the charge code, return user to tier (they can retry)
  if (!code) {
    const qs = new URLSearchParams();
    qs.set('onboarding', '1');
    qs.set('error', 'missing_charge_code');
    if (plan) qs.set('prePlan', plan);
    return res.redirect(`/tier.html?${qs.toString()}`);
  }

  // ✅ Send the user back to the pay page; pay.html will confirm
  // the Coinbase charge and decide where to send them next (advanced
  // preferences onboarding vs dashboard).
  const qs = new URLSearchParams();
  if (plan) qs.set('plan', plan);
  qs.set('session_id', code);
  qs.set('from', 'coinbase');
  return res.redirect(`/pay.html?${qs.toString()}`);
});

app.get('/api/coinbase/cancel', (req, res) => {
  const plan = String(req.query?.plan || '').trim();
  const qs = new URLSearchParams();
  qs.set('cancelled', '1');
  if (plan) qs.set('prePlan', plan);
  return res.redirect(`/tier.html?${qs.toString()}`);
});

// ---- New Coinbase endpoints (preferred) ----

// Create a charge and return hosted_url
app.post('/api/coinbase/create-charge', async (req, res) => {
  try {
    const { plan, planKey } = req.body || {};
    const key = String(planKey || plan || '').trim();

    const email = (DB && DB.user && DB.user.email) ? DB.user.email : '';
    if (!email) return res.status(401).json({ ok: false, message: 'not_authenticated' });

    const { hosted_url, code } = await createCoinbaseCharge(key, email);
    setCoinbaseCheckoutCookies(res, { code, plan: key });

    return res.json({ ok: true, url: hosted_url, code });
    } catch (err) {
    console.error('coinbase create-charge error', err);
    const status = err.status || 500;
   return res.status(status).json({
    ok: false,
    message: err.message || 'coinbase_error',
    details: err.payload || null
  });
}

});

// Poll a charge by code (useful if webhook isn't set up yet)
app.get('/api/coinbase/charge/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim();
    if (!code) return res.status(400).json({ ok: false, message: 'code_required' });

    const resp = await coinbaseRequest(`/charges/${encodeURIComponent(code)}`, { method: 'GET' });
    const c = unwrapCharge(resp);
    const status = getChargeStatus(c);

    return res.json({ ok: true, status, charge: c });
  } catch (err) {
    console.error('coinbase charge fetch error', err);
    return res.status(500).json({ ok: false, message: err.message || 'coinbase_error' });
  }
});

// Coinbase webhook (charge:pending, charge:confirmed, etc.)
// IMPORTANT: set COINBASE_COMMERCE_WEBHOOK_SECRET in your .env
app.post('/api/coinbase/webhook', async (req, res) => {
  try {
    if (!COINBASE_WEBHOOK_SECRET) {
      return res.status(500).json({ ok: false, message: 'webhook_secret_not_configured' });
    }

    const signature = req.get('X-CC-Webhook-Signature') || '';
    const rawBuf = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');

    const expected = crypto.createHmac('sha256', COINBASE_WEBHOOK_SECRET).update(rawBuf).digest('hex');
    if (!safeEqualHex(expected, signature)) {
      return res.status(400).json({ ok: false, message: 'invalid_signature' });
    }

    // Coinbase Commerce webhook payload typically includes { event: { type, data } }
    const payload = req.body || {};
    const ev = payload.event || payload;
    const type = String(ev.type || '').toLowerCase();
    const data = unwrapCharge(ev.data || payload.data || {});
    const meta = (data.metadata || {});
    const email = meta.email || meta.customer_email || '';
    const plan = meta.plan || meta.planKey || meta.plan_id || '';

    // Option A: Fulfill via webhook events (fastest)
    if ((type === 'charge:pending' || type === 'charge:confirmed') && email && plan) {
      // Optional stricter fulfillment:
      // - If COINBASE_FULFILL_AT=COMPLETED, we only activate when timeline shows COMPLETED
      if (COINBASE_FULFILL_AT === 'COMPLETED') {
        const status = getChargeStatus(data);
        if (status !== 'COMPLETED') {
          return res.json({ ok: true, ignored: true, reason: `status_${status}` });
        }
      }

      await activatePlanForEmail(email, plan, {
        lastCoinbaseChargeCode: data.code || null,
        lastPaymentEvent: type
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('coinbase webhook error', err);
    return res.status(500).json({ ok: false, message: 'webhook_error' });
  }
});

// ---- Backward-compatible aliases (so your current pay.js keeps working) ----
// pay.js currently calls /api/stripe/create-checkout-session and expects { url }.
// We keep the same endpoint, but it now creates a Coinbase charge (NO Stripe used).
app.post('/api/stripe/create-checkout-session', async (req, res) => {
  try {
    const { plan, planKey } = req.body || {};
    const key = String(planKey || plan || '').trim();

    const email = (DB && DB.user && DB.user.email) ? DB.user.email : '';
    if (!email) return res.status(401).json({ ok: false, message: 'not_authenticated' });

    const { hosted_url, code } = await createCoinbaseCharge(key, email);
    setCoinbaseCheckoutCookies(res, { code, plan: key });

    // Still return { url } to avoid changing frontend right now
    return res.json({ ok: true, url: hosted_url, code });
  } catch (err) {
    console.error('legacy checkout alias error', err);
    return res.status(500).json({ ok: false, message: err.message || 'coinbase_error' });
  }
});

// pay.js currently calls /api/stripe/confirm with { session_id }.
// We interpret session_id as Coinbase "charge code" and confirm via GET /charges/{code}.
app.post('/api/stripe/confirm', async (req, res) => {
  try {
    const { session_id } = req.body || {};
    const code = String(session_id || '').trim();
    if (!code) return res.status(400).json({ ok: false, message: 'session_id required' });

    const resp = await coinbaseRequest(`/charges/${encodeURIComponent(code)}`, { method: 'GET' });
    const c = unwrapCharge(resp);
    const status = getChargeStatus(c);

    if (!isFulfilledStatus(status)) {
      return res.json({ ok: false, message: 'not_paid_yet', status });
    }

    const meta = c.metadata || {};
    const email = meta.email || (DB && DB.user && DB.user.email) || '';
    const plan = meta.plan || meta.planKey || '';

    if (!email || !plan) {
      return res.json({ ok: false, message: 'missing_metadata', status });
    }

    await activatePlanForEmail(email, plan, {
      lastCoinbaseChargeCode: c.code || code,
      lastPaymentEvent: `poll_${status}`
    });

    return res.json({ ok: true, status, plan });
  } catch (err) {
    console.error('legacy confirm alias error', err);
    return res.status(500).json({ ok: false, message: err.message || 'coinbase_error' });
  }
});

// ---------------- Creator Application ----------------
app.post('/api/me/creator/apply', async (req, res) => {
  try {
    if (!DB.user || !DB.user.email) {
      return res.status(401).json({ ok: false, message: 'not logged in' });
    }

    const { handle, gender, contentStyle, price, links } = req.body || {};

    // Basic validation
    if (!handle || !price) {
      return res.status(400).json({ ok: false, message: 'Handle and price are required' });
    }

    const applicationData = {
      handle: String(handle).trim(),
      gender: String(gender || 'woman'),
      contentStyle: String(contentStyle || ''),
      price: Number(price),
      links: String(links || ''),
      appliedAt: new Date().toISOString(),
      status: 'pending' // pending | approved | rejected
    };

    // Update Memory DB
    DB.user.creatorStatus = 'pending';
    DB.user.creatorApplication = applicationData;

    // [FIX START] Update Cache / Global DB
    // Siguraduhing naka-save ang user sa main listahan (DB.users) bago mag-update
    const email = DB.user.email;
    
    // Kung wala sa listahan (halimbawa: kakarestart lang), idagdag muna
    if (!DB.users[email]) {
       DB.users[email] = { ...DB.user };
    }
    
    // Ngayon, i-update ang status at application data
    Object.assign(DB.users[email], {
        creatorStatus: 'pending',
        creatorApplication: applicationData
    });
      saveUsersStore();
    // [FIX END]

    // Update Firestore (if active)
    if (hasFirebase && DB.user.email) {
      try {
        await updateUserByEmail(DB.user.email, {
          creatorStatus: 'pending',
          creatorApplication: applicationData
        });
      } catch (err) {
        console.error('Firestore update failed', err);
      }
    }

    return res.json({ ok: true, creatorStatus: 'pending' });
  } catch (err) {
    console.error('Creator apply error:', err);
    return res.status(500).json({ ok: false, message: 'server error' });
  }
});
// ---------------- Creator Subscription (ILIPAT MO DITO SA LABAS) ----------------
app.post('/api/me/creator/subscribe', async (req, res) => {
  try {
    if (!DB.user || !DB.user.email) {
      return res.status(401).json({ ok: false, message: 'Not logged in' });
    }

    const email = DB.user.email;

    // Ensure user exists in Global DB
    if (!DB.users[email]) {
       DB.users[email] = { ...DB.user };
    }

    // Activate Creator Access
    DB.users[email].hasCreatorAccess = true;
    
    // Update Session User
    DB.user.hasCreatorAccess = true;
    saveUsersStore();
    // Optional: Save to Firestore/Disk if needed
    if (hasFirebase) {
      try { await updateUserByEmail(email, { hasCreatorAccess: true }); } catch (e) {}
    }
    
    return res.json({ ok: true, message: 'Subscription active' });
  } catch (err) {
    console.error('Subscribe error:', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});
// server.js

// ---------------- Premium Society Application ----------------
app.post('/api/me/premium/apply', async (req, res) => {
  try {
    if (!DB.user || !DB.user.email) {
      return res.status(401).json({ ok: false, message: 'Not logged in' });
    }

    const { fullName, age, occupation, finance } = req.body || {};

    // Basic validation
    if (!fullName || !occupation) {
      return res.status(400).json({ ok: false, message: 'Please complete the form.' });
    }

    const applicationData = {
      fullName: String(fullName).trim(),
      age: Number(age),
      occupation: String(occupation).trim(),
      finance: String(finance).trim(),
      appliedAt: new Date().toISOString(),
      status: 'pending'
    };

    const email = DB.user.email;

    // Ensure user exists in Global DB
    if (!DB.users[email]) {
       DB.users[email] = { ...DB.user };
    }

    // Update Status
    Object.assign(DB.users[email], {
      premiumStatus: 'pending',
      premiumApplication: applicationData
    });

    // Save to Disk
    if (typeof saveUsersStore === 'function') saveUsersStore();

    // Update Firestore (Optional)
    if (hasFirebase) {
      try {
        await updateUserByEmail(email, {
          premiumStatus: 'pending',
          premiumApplication: applicationData
        });
      } catch (e) {}
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('Premium apply error:', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});
// ------------------------------------------------------------------
// ADMIN ROUTES (Simple Implementation)
// ------------------------------------------------------------------

// 1. Get ALL Pending Applications
app.get('/api/admin/creators/pending', (req, res) => {
  // NOTE: Sa real app, maglagay ka ng security check dito (e.g. require admin password)
  
  // Hanapin lahat ng users na 'pending' ang creatorStatus
  // Dahil memory DB lang gamit natin sa example (DB.users), iterate natin:
  const pendingUsers = Object.values(DB.users).filter(u => u.creatorStatus === 'pending');
  
  res.json({ count: pendingUsers.length, applicants: pendingUsers });
});

// 2. Approve a Creator
app.post('/api/admin/creators/approve', async (req, res) => {
  const { email } = req.body;
  if (!email || !DB.users[email]) return res.json({ ok: false, message: 'User not found' });

  const user = DB.users[email];
  
  // Update status
  user.creatorStatus = 'approved';
  user.creatorSince = new Date().toISOString();
  saveUsersStore();
  // Optional: Update Firestore if connected
  if (hasFirebase) {
     await updateUserByEmail(email, { creatorStatus: 'approved' });
  }

  res.json({ ok: true, message: `User ${email} is now a Creator!` });
});

// 3. Reject a Creator
app.post('/api/admin/creators/reject', async (req, res) => {
  const { email } = req.body;
  if (!email || !DB.users[email]) return res.json({ ok: false, message: 'User not found' });

  const user = DB.users[email];
  
  // Update status back to none or rejected
  user.creatorStatus = 'rejected';
  saveUsersStore();
  if (hasFirebase) {
     await updateUserByEmail(email, { creatorStatus: 'rejected' });
  }

  res.json({ ok: true, message: `User ${email} application rejected.` });
});

// ---------------- ADMIN: PREMIUM SOCIETY ----------------

// 1. Get Pending Premium Applications
app.get('/api/admin/premium/pending', (req, res) => {
  // Kunin lahat ng users na 'pending' ang premiumStatus
  const applicants = Object.values(DB.users).filter(u => u.premiumStatus === 'pending');
  res.json({ count: applicants.length, applicants });
});

// 2. Decide on Premium Application (Approve/Reject)
app.post('/api/admin/premium/decision', async (req, res) => {
  const { email, decision } = req.body; // decision = 'approved' or 'rejected'
  
  if (!email || !DB.users[email]) return res.json({ ok: false, message: 'User not found' });
  if (!['approved', 'rejected'].includes(decision)) return res.json({ ok: false, message: 'Invalid decision' });

  const user = DB.users[email];
  user.premiumStatus = decision;
  
  if (decision === 'approved') {
    // Kung approved, set na rin natin ang plan nila sa tier3 (Concierge) bilang bonus/setup
    user.plan = 'tier3';
    user.planActive = true;
    user.planStart = new Date().toISOString();
  }

  saveUsersStore(); // Save to disk

  // Optional: Update Firestore
  if (hasFirebase) {
     try { await updateUserByEmail(email, { premiumStatus: decision, plan: user.plan }); } catch(e){}
  }

  res.json({ ok: true, message: `User ${email} marked as ${decision}.` });
});
// [UPDATED] Get Matches Route
// [UPDATED] Get Real Matches
app.get('/api/matches', (req, res) => {
  if (!DB.user || !DB.user.email) return res.status(401).json({ ok: false });
  
  const myEmail = DB.user.email;
  const matchEmails = DB.matches[myEmail] || [];

  // Kunin ang profile details ng mga ka-match
  const matches = matchEmails.map(email => {
    const u = DB.users[email];
    if (!u) return null;
    return {
      id: u.email,
      name: u.name,
      age: 25, 
      photoUrl: u.avatarUrl || 'assets/images/truematch-mark.png'
    };
  }).filter(Boolean);

  res.json({ ok: true, matches });
});
// Public config to expose client IDs (safe values only)
app.get('/api/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || ''
  });
});

// ---------------- Email Verification (OTP) -------------------
let _mailer = null;

async function getMailer() {
  if (_mailer !== null) return _mailer;
  try {
    const nodemailer = require('nodemailer');
    const host = process.env.SMTP_HOST || '';
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';

    if (host && user && pass) {
      _mailer = nodemailer.createTransport({
        host,
        port,
        secure: (port === 465),
        auth: { user, pass }
      });
      // sanity ping: log once at boot whether transport looks OK
      _mailer.verify().then(() => {
        console.log(`[mail] SMTP transport ready → ${host}:${port} as ${user}`);
      }).catch(err => {
        console.error('[mail] SMTP verify failed:', err?.message || err);
      });
    } else {
      _mailer = false;
      console.warn('[mail] SMTP disabled (missing SMTP_HOST/SMTP_USER/SMTP_PASS)');
    }
  } catch (e) {
    _mailer = false;
    console.error('[mail] Nodemailer init failed:', e?.message || e);
  }
  return _mailer;
}

function generateCode() {
  return '' + Math.floor(100000 + Math.random() * 900000);
}

const CODE_TTL_MS = 10 * 60 * 1000;   // 10 minutes
const RESEND_GAP_MS = 60 * 1000;      // 60 seconds
if (!DB.emailVerify) DB.emailVerify = {};

async function sendVerificationEmail(toEmail, code) {
  const mailer = await getMailer();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@truematch.local';
  const subj = 'Your TrueMatch verification code';
  const html = `<p>Hello,</p><p>Your verification code is:</p><p style="font-size:22px;letter-spacing:3px;"><b>${code}</b></p><p>This code expires in 10 minutes.</p>`;
  const text = `Your TrueMatch verification code: ${code} (expires in 10 minutes)`;

  // If SMTP is off, keep your current DEV behavior
  if (!mailer) {
    console.log('[DEV] Verification code for', toEmail, '→', code);
    return true;
  }

  try {
    await mailer.sendMail({ from, to: toEmail, subject: subj, text, html });
    return true;
  } catch (err) {
    console.error('Email send failed:', err?.message || err);

    // Fallback: send the code to ADMIN_EMAIL so you still receive it immediately
    const admin = (process.env.ADMIN_EMAIL || '').trim();
    if (admin) {
      try {
        await mailer.sendMail({
          from,
          to: admin,
          subject: `[BOUNCE/FALLBACK] ${subj}`,
          text: `Original TO: ${toEmail}\n\n${text}`,
          html: `<p><b>Original TO:</b> ${toEmail}</p>${html}`
        });
        console.warn(`[mail] Fallback sent to admin ${admin}`);
      } catch (e2) {
        console.error('[mail] Fallback to admin failed:', e2?.message || e2);
      }
    }
    return false; // route will surface the failure to the client
  }
}
// ---------------- SWIPE & MATCHING ENGINE ----------------

// 1. Get Candidates (Real Users)
// 1. Get Candidates (Global + Cap 20)
// [UPDATED] Get Candidates (Supports Firestore & Local)
// [UPDATED] Get Candidates with Daily Limit Check
// =======================================================================
// [PALITAN ANG BUONG "app.get('/api/swipe/candidates'...)"]
// =======================================================================
app.get('/api/swipe/candidates', async (req, res) => {
  // 1. Basic Auth Check
  if (!DB.user || !DB.user.email) return res.status(401).json({ ok: false });
  
  const myEmail = DB.user.email;
  const planName = DB.user.plan || 'free';

  // 2. CHECK STRICT LIMIT (Server Memory)
  if (planName === 'free') {
    // Kung wala pang record, simulan sa 0
    if (!SERVER_SWIPE_COUNTS[myEmail]) {
      SERVER_SWIPE_COUNTS[myEmail] = 0;
    }

    const currentCount = SERVER_SWIPE_COUNTS[myEmail];

    // Kung umabot na sa 20, BLOCK NA AGAD.
    if (currentCount >= STRICT_DAILY_LIMIT) {
      console.log(`[Limit Block] User ${myEmail} has reached ${currentCount}/${STRICT_DAILY_LIMIT}`);
      return res.json({ 
        ok: true, 
        candidates: [], 
        limitReached: true, 
        message: "Server limit reached. Restart server to reset." 
      });
    }
  }

  // 3. Load Candidates (Kapag hindi pa limit reached)
  let candidates = [];
  try {
    // (A) Kung may Firebase
    if (hasFirebase && usersCollection) {
      const snap = await usersCollection.limit(50).get();
      snap.forEach(doc => {
        const u = doc.data();
        if (u.email === myEmail) return;
        // Check kung na-swipe na dati (optional history check)
        const mySwipes = DB.swipes[myEmail] || {};
        if (mySwipes[u.email]) return;
        
        candidates.push({
          id: u.email,
          name: u.name || 'Member',
          age: u.age || 25,
          city: u.city || 'Global',
          photoUrl: u.avatarUrl || 'assets/images/truematch-mark.png'
        });
      });
    } 
    // (B) Kung Local Demo Mode
    else {
      const allUsers = Object.values(DB.users);
      const mySwipes = DB.swipes[myEmail] || {};
      
      candidates = allUsers
        .filter(u => u.email !== myEmail && !mySwipes[u.email])
        .map(u => ({
          id: u.email,
          name: u.name || 'Member',
          age: 25,
          city: u.city || 'Global',
          photoUrl: u.avatarUrl || 'assets/images/truematch-mark.png'
        }));
    }

    // Limitahan ang ibibigay na cards base sa natitirang swipes
    let limitReached = false;

    if (planName === 'free') {
      const remaining = STRICT_DAILY_LIMIT - (SERVER_SWIPE_COUNTS[myEmail] || 0);
      if (remaining <= 0) {
        candidates = [];
        limitReached = true;
      } else {
        candidates = candidates.slice(0, remaining);
      }
    }

    res.json({ ok: true, candidates, limitReached });


  } catch (err) {
    console.error('Swipe candidate error:', err);
    res.status(500).json({ ok: false });
  }
});
// 2. Swipe Action (Like/Pass)
// [UPDATED] Swipe Action (Saves Timestamp)
// =======================================================================
// [PALITAN ANG BUONG "app.post('/api/swipe/action'...)"]
// =======================================================================
app.post('/api/swipe/action', (req, res) => {
  if (!DB.user || !DB.user.email) return res.status(401).json({ ok: false });

  const myEmail = DB.user.email;
  const { targetId, type } = req.body; 
  const planName = DB.user.plan || 'free';

  // 1. UPDATE SERVER COUNTER (Strict)
  if (planName === 'free') {
    if (!SERVER_SWIPE_COUNTS[myEmail]) SERVER_SWIPE_COUNTS[myEmail] = 0;

    // Check ulit bago mag-process (Security)
    if (SERVER_SWIPE_COUNTS[myEmail] >= STRICT_DAILY_LIMIT) {
      return res.json({ ok: false, limitReached: true });
    }

    // DAGDAGAN ANG BILANG!
    SERVER_SWIPE_COUNTS[myEmail]++;
    console.log(`[Swipe Action] ${myEmail} Count: ${SERVER_SWIPE_COUNTS[myEmail]}`);
  }

  // 2. Record Swipe Logic (Tulad ng dati)
  if (!DB.swipes[myEmail]) DB.swipes[myEmail] = {};
  DB.swipes[myEmail][targetId] = { type, ts: Date.now() };

    // Persist swipe history to disk in local/demo mode
    if (!hasFirebase) {
    saveSwipesStore();
  }

  // 3. Match Logic
  let isMatch = false;
  if (type === 'like') {
    const theirSwipes = DB.swipes[targetId] || {};
    const theirAction = theirSwipes[myEmail];
    // Check match (support object or string format)
    const theyLiked = (typeof theirAction === 'string' && theirAction === 'like') ||
                      (typeof theirAction === 'object' && theirAction.type === 'like');

    if (theyLiked) {
      isMatch = true;
      if (!DB.matches[myEmail]) DB.matches[myEmail] = [];
      if (!DB.matches[myEmail].includes(targetId)) DB.matches[myEmail].push(targetId);
      
      if (!DB.matches[targetId]) DB.matches[targetId] = [];
      if (!DB.matches[targetId].includes(myEmail)) DB.matches[targetId].push(myEmail);
    }
  }

  // 4. Return Remaining Count
  const currentCount = SERVER_SWIPE_COUNTS[myEmail] || 0;
  const remaining = Math.max(0, STRICT_DAILY_LIMIT - currentCount);

  res.json({ 
    ok: true, 
    match: isMatch,
    remaining: remaining,
    // Sabihin sa frontend kung limit reached na para mag-stop ang UI
    limitReached: planName === 'free' && remaining === 0 
  });
});

// ---------------- Google Sign-In (GIS ID token) ----------------
app.post('/api/auth/oauth/google', async (req, res) => {
  try {
    const idToken = (req.body && req.body.idToken) || '';
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    if (!idToken || !clientId) {
      return res.status(400).json({ ok:false, message: 'missing_token_or_client_id' });
    }
    if (!OAuth2Client) {
      return res.status(500).json({ ok:false, message: 'google_library_missing' });
    }
    const oclient = new OAuth2Client(clientId);
    const ticket = await oclient.verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload() || {};
    const email = String(payload.email || '').toLowerCase().trim();
    const name  = payload.name || email.split('@')[0] || 'Google User';
    const emailVerifiedClaim = !!payload.email_verified;

    if (!email) {
      return res.status(400).json({ ok:false, message:'no_email_in_token' });
    }

    // Find or create user
    const emailNorm = email;
    let userDoc = null;
    if (hasFirebase) {
      userDoc = await findUserByEmail(emailNorm);
      if (!userDoc) {
        userDoc = await createUserDoc({ email: emailNorm, name, emailVerified: false, provider: 'google' });
      }
    }

    // Build in-memory user
    DB.user = DB.user || {};
    DB.user.email = emailNorm;
    DB.user.name = name;
    DB.user.emailVerified = Boolean((userDoc && userDoc.emailVerified) || (DB.users[emailNorm] && DB.users[emailNorm].emailVerified) || false);

    // Cache user by email and set session cookie
    DB.users[emailNorm] = { ...DB.user };
    setSession(res, emailNorm);

    // Decide if OTP is needed (one-time verification)
    let needVerification = !DB.user.emailVerified;
    if (!needVerification && emailVerifiedClaim && !DB.user.emailVerified) {
      // If Google's email_verified claim is true, you could trust it; but we stick to your own OTP policy.
      needVerification = false;
    }

    if (needVerification) {
      // Auto-send OTP code
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const bcrypt = require('bcryptjs');
      const codeHash = await bcrypt.hash(code, 10);
      const now = Date.now();
      const expiresAt = now + CODE_TTL_MS;

      DB.emailVerify[emailNorm] = { codeHash, expiresAt, lastSentAt: now, attempts: 0 };

      // mark user as not verified persistently
      if (hasFirebase && userDoc) {
        try { await updateUserByEmail(emailNorm, { emailVerified: false }); } catch {}
      }

      await sendVerificationEmail(emailNorm, code);

      return res.json({ ok:true, user: publicUser(userDoc || DB.user), needVerification: true });
    }

    return res.json({ ok:true, user: publicUser(userDoc || DB.user), needVerification: false });
  } catch (err) {
    console.error('oauth/google error:', err && (err.message || err));
    return res.status(500).json({ ok:false, message:'server_error' });
  }
});

app.post('/api/auth/send-verification-code', async (req, res) => {
  try{
    const email = (req.body?.email || getSessionEmail(req) || DB.user?.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ ok:false, message:'email required' });

    // rate limit
    const info = DB.emailVerify[email] || {};
    const now = Date.now();
    if (info.lastSentAt && (now - info.lastSentAt) < RESEND_GAP_MS){
      const secs = Math.ceil((RESEND_GAP_MS - (now - info.lastSentAt))/1000);
      return res.status(429).json({ ok:false, message:`Please wait ${secs}s before requesting again.` });
    }

    // generate and store hashed code
    const code = generateCode();
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(code, 8);
    DB.emailVerify[email] = {
      codeHash: hash,
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      lastSentAt: now
    };

    const ok = await sendVerificationEmail(email, code);
    if (!ok){
      return res.status(500).json({ ok:false, message:'failed_to_send_email' });
    }

    // Persist a flag in Firestore that user exists + not verified yet
    if (hasFirebase){
      try{
        const doc = await findUserByEmail(email);
        if (doc){
          await updateUserByEmail(email, { emailVerified: false });
        }else{
          await createUserDoc({ email, emailVerified:false });
        }
      }catch(err){ console.warn('verify email: firestorm persist warn', err?.message||err); }
    }

    return res.json({ ok:true, message:'code_sent' });
  }catch(err){
    console.error(err);
    return res.status(500).json({ ok:false, message:'server_error' });
  }
});

app.post('/api/auth/verify-email-code', async (req, res) => {
  try{
    const email = (req.body?.email || getSessionEmail(req) || DB.user?.email || '').toLowerCase().trim();
    const code  = String(req.body?.code || '').trim();
    if (!email || !code) return res.status(400).json({ ok:false, message:'email and code required' });

    const info = DB.emailVerify[email];
    if (!info) return res.status(400).json({ ok:false, message:'code_not_requested' });

    const now = Date.now();
    if (info.expiresAt && now > info.expiresAt){
      return res.status(400).json({ ok:false, message:'code_expired' });
    }

    const bcrypt = require('bcryptjs');
    const match = await bcrypt.compare(code, info.codeHash || '');
    info.attempts = (info.attempts||0)+1;
    if (!match){
      return res.status(400).json({ ok:false, message:'invalid_code', attempts: info.attempts });
    }

    // mark verified
    DB.user = DB.user || {};
    if (DB.user && (DB.user.email || '').toLowerCase() === email){
      DB.user.emailVerified = true;
    }
    // also persist
// keep per-email cache in sync (prevents redirect loops on next page)
if (email) {
  if (DB.users[email]) {
    DB.users[email].emailVerified = true;
  } else {
    // minimal seed so subsequent middleware hydration keeps verified=true
    DB.users[email] = { ...(DB.user || {}), email, emailVerified: true };
  }
}

    if (hasFirebase){
      try{ await updateUserByEmail(email, { emailVerified: true }); }catch{}
    }
    // clear code
    delete DB.emailVerify[email];

    return res.json({ ok:true, message:'email_verified' });
  }catch(err){
    console.error(err);
    return res.status(500).json({ ok:false, message:'server_error' });
  }
});



// =============== NEW HELPERS + IMAGE/AVATAR ENDPOINTS (non-breaking) ===============

// Simple remote image streamer to avoid CORS issues on the client.
async function _streamRemoteImage(res, url) {
  try {
    const r = await fetch(url, { method: 'GET' });
    if (!r.ok) {
      res.status(r.status).end();
      return;
    }
    const ct = r.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    const buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);
  } catch (err) {
    console.error('proxy image error:', err.message || err);
    res.status(500).end();
  }
}

// Proxy any remote image (use with care; we still restrict to http/https)
app.get('/api/proxy-image', async (req, res) => {
  const raw = (req.query && req.query.url) ? String(req.query.url) : '';
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) {
      return res.status(400).json({ ok:false, message:'invalid_protocol' });
    }
    return _streamRemoteImage(res, url.toString());
  } catch {
    return res.status(400).json({ ok:false, message:'invalid_url' });
  }
});

// Instagram avatar helper using the public unavatar.io service as a lightweight fallback.
// This avoids scraping Instagram directly and keeps things simple for admin previews.
app.get('/api/ig/avatar/:username', async (req, res) => {
  const username = String(req.params.username || '').trim().replace(/^@/, '');
  if (!username) return res.status(400).json({ ok:false, message:'username_required' });

  const jsonUrl = `https://unavatar.io/instagram/${encodeURIComponent(username)}?json`;
  try {
    const jr = await fetch(jsonUrl);
    if (jr.ok) {
      const data = await jr.json();
      if (data && data.url) {
        return _streamRemoteImage(res, data.url);
      }
    }
  } catch {}
  const imgUrl = `https://unavatar.io/instagram/${encodeURIComponent(username)}`;
  return _streamRemoteImage(res, imgUrl);
});
// ---------------- Start server -------------------
app.listen(PORT, () => {
  console.log(`TrueMatch server running at ${APP_BASE_URL}`);
});