// admin-login.js

// Call to backend using dedicated admin username + password
async function loginAdmin(username, password) {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password })
  });

  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    data = null;
  }

  return {
    ok: res.ok && data?.ok,
    message: data?.message || (res.ok ? '' : 'Login failed'),
    adminKey: data?.adminKey || ''
  };
}

const form = document.getElementById('form-admin-login');
const statusEl = document.getElementById('login-status');
// Allow both #admin-username (preferred) or fallback to #admin-email
const usernameEl =
  document.getElementById('admin-username') ||
  document.getElementById('admin-email');
const passEl = document.getElementById('admin-pass');

form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = (usernameEl?.value || '').trim();
  const pass = (passEl?.value || '').trim();

  // UI feedback
  statusEl.textContent = 'Signing in…';
  statusEl.style.color = '';

  if (!username || !pass) {
    statusEl.textContent = 'Please enter username and password.';
    statusEl.style.color = '#ff7b8a';
    return;
  }

  const out = await loginAdmin(username, pass);

  if (!out.ok) {
    statusEl.textContent = out.message || 'Invalid admin credentials.';
    statusEl.style.color = '#ff7b8a';
    return;
  }

  // Save admin key locally so admin.js can send it as x-admin-key
  try {
    const keyToStore = out.adminKey || '';
    localStorage.setItem('tm_admin_key', keyToStore);
  } catch (err) {
    console.error('Failed to store admin key in localStorage', err);
  }

  // Go to admin space
  location.replace('/admin.html');
});
