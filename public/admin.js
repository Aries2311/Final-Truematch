/* admin.js - Unified Admin Logic */

// Base API helpers (can also import from tm-api.js if preferred)
const API_BASE = window.API_BASE || '';

async function apiCall(endpoint, method = 'GET', body = null) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API_BASE + endpoint, opts);
    return await res.json();
  } catch (err) {
    console.error(err);
    return { ok: false, message: 'Network error' };
  }
}

/* =========================================
   1. NAVIGATION TABS
   ========================================= */
const tabs = document.querySelectorAll('.nav-btn');
const panels = document.querySelectorAll('.admin-panel');

function switchTab(tabId) {
  // Update buttons
  tabs.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  // Update panels
  panels.forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== `panel-${tabId}`);
  });

  // Lazy load data based on tab
  if (tabId === 'users') loadUsers();
  if (tabId === 'creators') loadPendingCreators();
  if (tabId === 'overview') loadOverviewStats();
}

tabs.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

/* =========================================
   2. OVERVIEW STATS
   ========================================= */
async function loadOverviewStats() {
  // In a real app, you'd have a specific stats endpoint.
  // For now, we fetch lists and count.
  
  // Count Users
  const userRes = await apiCall('/api/admin/users');
  const userCount = userRes.users ? Object.keys(userRes.users).length : 0;
  document.getElementById('stat-users-count').textContent = userCount;

  // Count Pending Creators
  const creatorRes = await apiCall('/api/admin/creators/pending');
  const pendingCount = creatorRes.applicants ? creatorRes.applicants.length : 0;
  document.getElementById('stat-creators-pending').textContent = pendingCount;

  // Mock Dates (No endpoint yet)
  document.getElementById('stat-dates-active').textContent = '0'; 
}

/* =========================================
   3. USER MANAGEMENT
   ========================================= */
const usersBody = document.getElementById('users-table-body');
document.getElementById('btn-refresh-users').addEventListener('click', loadUsers);

async function loadUsers() {
  usersBody.innerHTML = '<p class="muted p-4">Loading...</p>';
  const data = await apiCall('/api/admin/users');
  
  if (!data.users || Object.keys(data.users).length === 0) {
    usersBody.innerHTML = '<p class="muted p-4">No users found.</p>';
    return;
  }

  usersBody.innerHTML = '';
  Object.values(data.users).forEach(u => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div>
        <strong style="display:block; color:#fff;">${u.email}</strong>
        <span class="tiny muted">${u.id || ''}</span>
      </div>
      <div><span class="tiny" style="border:1px solid #444; padding:2px 6px; border-radius:4px;">${u.plan || 'free'}</span></div>
      <div>${u.emailVerified ? '✅ Verified' : '❌ Unverified'}</div>
      <div style="text-align:right;">
        <button class="btn btn--sm btn--ghost" onclick="alert('Manage user: ${u.email}')">Edit</button>
      </div>
    `;
    usersBody.appendChild(row);
  });
}

/* =========================================
   4. CREATOR APPLICATIONS
   ========================================= */
const creatorsBody = document.getElementById('creators-list-body');
document.getElementById('btn-refresh-creators').addEventListener('click', loadPendingCreators);

async function loadPendingCreators() {
  creatorsBody.innerHTML = '<p class="muted p-4">Checking...</p>';
  const data = await apiCall('/api/admin/creators/pending');

  if (!data.applicants || data.applicants.length === 0) {
    creatorsBody.innerHTML = '<p class="muted p-4">No pending applications.</p>';
    return;
  }

  creatorsBody.innerHTML = '';
  data.applicants.forEach(user => {
    const app = user.creatorApplication || {};
    const row = document.createElement('div');
    row.className = 'row';
    // Override grid columns for this specific table
    row.style.gridTemplateColumns = '1fr 1fr 2fr 100px'; 
    
    row.innerHTML = `
      <div>
        <strong style="color:#fff; display:block;">${app.handle}</strong>
        <span class="tiny muted">${user.email}</span>
      </div>
      <div class="tiny">
        <div>Price: $${app.price}</div>
        <div>Gender: ${app.gender}</div>
      </div>
      <div class="tiny muted" style="font-style:italic;">"${app.contentStyle}"</div>
      <div style="text-align:right; display:flex; flex-direction:column; gap:4px;">
        <button class="btn btn--sm btn--primary btn-decide" data-email="${user.email}" data-type="approve">Approve</button>
        <button class="btn btn--sm btn--ghost text-danger btn-decide" data-email="${user.email}" data-type="reject">Reject</button>
      </div>
    `;
    creatorsBody.appendChild(row);
  });

  // Bind buttons
  document.querySelectorAll('.btn-decide').forEach(btn => {
    btn.addEventListener('click', () => handleCreatorDecision(btn.dataset.email, btn.dataset.type));
  });
}

async function handleCreatorDecision(email, type) {
  if (!confirm(`Are you sure you want to ${type.toUpperCase()} ${email}?`)) return;
  
  const res = await apiCall(`/api/admin/creators/${type}`, 'POST', { email });
  if (res.ok) {
    alert(`Success: User ${type}d.`);
    loadPendingCreators(); // Refresh list
    loadOverviewStats();   // Refresh counts
  } else {
    alert(res.message || 'Action failed.');
  }
}

/* =========================================
   5. MATCHMAKING (Shortlist Serving)
   ========================================= */
const profilesInput = document.getElementById('profiles-input');
const emailInput = document.getElementById('admin-email');
const previewBox = document.getElementById('admin-list-body');

// Live Preview
profilesInput.addEventListener('input', () => {
  try {
    const raw = profilesInput.value;
    const parsed = JSON.parse(raw);
    previewBox.innerHTML = Array.isArray(parsed) 
      ? `<p class="tiny text-accent">${parsed.length} profiles ready.</p>`
      : `<p class="tiny text-danger">Invalid JSON format (must be array).</p>`;
  } catch (e) {
    // If not JSON, assume raw text parsing (if supported) or error
    previewBox.innerHTML = `<p class="tiny muted">Typing...</p>`;
  }
});

// Load Default Mock
document.getElementById('btn-load').addEventListener('click', () => {
  const mock = [
    { name: "Mock 1", age: 24, city: "Makati", bio: "Test Bio", photoUrl: "https://i.pravatar.cc/300?u=1" },
    { name: "Mock 2", age: 28, city: "BGC", bio: "Test Bio 2", photoUrl: "https://i.pravatar.cc/300?u=2" }
  ];
  profilesInput.value = JSON.stringify(mock, null, 2);
  profilesInput.dispatchEvent(new Event('input'));
});

// Serve
document.getElementById('btn-serve').addEventListener('click', async () => {
  const email = emailInput.value.trim();
  let profiles = [];
  try { profiles = JSON.parse(profilesInput.value); } catch(e) { return alert('Invalid JSON profiles'); }

  if (!email || !profiles.length) return alert('Email and Profiles required');

  const res = await apiCall('/api/admin/shortlist', 'POST', { email, profiles });
  if (res.ok) {
    document.getElementById('admin-status').textContent = 'Shortlist Served Successfully!';
    document.getElementById('admin-status').style.color = '#7a9dff';
  } else {
    document.getElementById('admin-status').textContent = 'Error: ' + res.message;
    document.getElementById('admin-status').style.color = 'red';
  }
});

/* =========================================
   6. CONCIERGE (Confirmed Dates)
   ========================================= */
document.getElementById('form-confirmed').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('cd-email').value;
  // In real implementation, gather all fields and POST to /api/admin/dates/create
  
  // For now, mock success
  const statusEl = document.getElementById('cd-status');
  statusEl.textContent = `Date saved for ${email} (Mock).`;
  statusEl.style.color = '#7a9dff';
});

/* =========================================
   INIT
   ========================================= */
// Logout
document.getElementById('btn-logout-admin').addEventListener('click', async () => {
  await apiCall('/api/auth/logout', 'POST');
  window.location.href = '/index.html';
});

// Initial Load
loadOverviewStats();
/* =========================================
   7. PREMIUM SOCIETY MANAGEMENT
   ========================================= */
// Note: Siguraduhing may button ka sa admin.html na may id="btn-refresh-premium" 
// at container na id="premium-list-body" kung gusto mo itong makita.

async function loadPremiumApplicants() {
  const container = document.getElementById('premium-list-body');
  if (!container) return; // Skip kung wala sa HTML

  container.innerHTML = '<p class="muted p-4">Checking...</p>';
  const data = await apiCall('/api/admin/premium/pending');

  if (!data.applicants || data.applicants.length === 0) {
    container.innerHTML = '<p class="muted p-4">No pending premium applications.</p>';
    return;
  }

  container.innerHTML = '';
  data.applicants.forEach(user => {
    const app = user.premiumApplication || {};
    const row = document.createElement('div');
    row.className = 'row';
    // Custom grid for premium info
    row.style.gridTemplateColumns = '1fr 1fr 2fr 100px'; 
    
    row.innerHTML = `
      <div>
        <strong style="color:#fff; display:block;">${app.fullName} (${app.age})</strong>
        <span class="tiny muted">${user.email}</span>
      </div>
      <div class="tiny">
        <div>Occ: ${app.occupation}</div>
      </div>
      <div class="tiny muted" style="font-style:italic;">Finances: "${app.finance}"</div>
      <div style="text-align:right; display:flex; flex-direction:column; gap:4px;">
        <button class="btn btn--sm btn--primary btn-prem-decide" data-email="${user.email}" data-dec="approved">Approve</button>
        <button class="btn btn--sm btn--ghost text-danger btn-prem-decide" data-email="${user.email}" data-dec="rejected">Reject</button>
      </div>
    `;
    container.appendChild(row);
  });

  // Bind buttons
  document.querySelectorAll('.btn-prem-decide').forEach(btn => {
    btn.addEventListener('click', async () => {
      if(!confirm(`Confirm ${btn.dataset.dec}?`)) return;
      await apiCall('/api/admin/premium/decision', 'POST', { 
        email: btn.dataset.email, 
        decision: btn.dataset.dec 
      });
      loadPremiumApplicants(); // Refresh
    });
  });
}

// I-expose globally or tawagin sa switchTab kung may tab na
window.loadPremiumApplicants = loadPremiumApplicants;