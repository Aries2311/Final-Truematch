// creators.js — Logic for the Creator Space

import { apiGet, apiPost } from './tm-api.js';

const DOM = {
  // Loading & Access Screens
  denied: document.getElementById('access-denied'),
  
  // Feed Screens
  feed: document.getElementById('creator-feed'),
  feedContainer: document.getElementById('feed-container'),
  
  // Buttons
  btnBack: document.getElementById('btnBack'),
  btnSubscribe: document.getElementById('btnSubscribe'),
  
  // Payment Modal Elements
  paymentModal: document.getElementById('payment-modal'),
  btnPayConfirm: document.getElementById('btnPayConfirm'),
  btnPayCancel: document.getElementById('btnPayCancel')
};

// --- Mock Data ---
const MOCK_POSTS = [
  { id: 1, author: 'fit_master', avatar: 'assets/images/sample1.jpg', time: '2 hours ago', text: 'Morning stretch routine! 💪✨', image: 'assets/images/sample2.jpg', locked: false },
  { id: 2, author: 'fit_master', avatar: 'assets/images/sample1.jpg', time: '5 hours ago', text: 'Full 30-min workout routine (Uncut).', image: 'assets/images/sample3.jpg', locked: true, price: 5.00 },
  { id: 3, author: 'fit_master', avatar: 'assets/images/sample1.jpg', time: '1 day ago', text: 'Healthy meal prep ideas 🥗', image: 'assets/images/sample4.jpg', locked: false }
];

async function init() {
  if (DOM.btnBack) DOM.btnBack.onclick = () => window.location.href = 'dashboard.html';
  
  // OPEN MODAL: Use classList logic
  if (DOM.btnSubscribe) DOM.btnSubscribe.onclick = openPaymentModal; 
  
  // CLOSE/PROCEED Logic
  if (DOM.btnPayCancel) DOM.btnPayCancel.onclick = closePaymentModal;
  if (DOM.btnPayConfirm) DOM.btnPayConfirm.onclick = processPayment;

  await checkAccess();
}

async function checkAccess() {
  try {
    const res = await apiGet('/api/me');
    
    if (res.ok && res.user && res.user.hasCreatorAccess) {
      if (DOM.feed) DOM.feed.hidden = false;
      if (DOM.denied) DOM.denied.hidden = true;
      renderFeed(MOCK_POSTS);
    } else {
      if (DOM.denied) DOM.denied.hidden = false;
      if (DOM.feed) DOM.feed.hidden = true;
    }
  } catch (err) {
    console.error(err);
    if (DOM.denied) DOM.denied.hidden = false;
  }
}

function renderFeed(posts) {
  if (!DOM.feedContainer) return;
  DOM.feedContainer.innerHTML = '';

  posts.forEach(post => {
    const article = document.createElement('article');
    article.className = 'post-card';
    
    let mediaContent = '';
    if (post.locked) {
      mediaContent = `
        <div class="locked-container">
          <div class="locked-overlay">
            <span style="font-size:24px; margin-bottom:10px;">🔒</span>
            <button class="btn btn--primary" onclick="alert('Unlock feature coming soon!')">Unlock for $${post.price.toFixed(2)}</button>
          </div>
          <img src="${post.image}" class="post-img locked-blur">
        </div>
      `;
    } else {
      mediaContent = `<img src="${post.image}" class="post-img">`;
    }

    article.innerHTML = `
      <div class="post-header">
        <div style="display:flex; align-items:center; gap:12px;">
          <img src="${post.avatar}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
          <div>
            <strong>@${post.author}</strong>
            <div class="tiny muted">${post.time}</div>
          </div>
        </div>
      </div>
      <p style="margin: 12px 0;">${post.text}</p>
      ${mediaContent}
      <div class="post-actions" style="margin-top:16px; display:flex; gap:16px; font-size:1.2rem; opacity:0.7;">
        <i class="fa-regular fa-heart" style="cursor:pointer;"></i>
        <i class="fa-regular fa-comment" style="cursor:pointer;"></i>
      </div>
    `;
    DOM.feedContainer.appendChild(article);
  });
}

// --- Payment Logic (Class-based Toggling) ---

function openPaymentModal() {
  if (DOM.paymentModal) {
    DOM.paymentModal.classList.add('is-visible');
  }
}

function closePaymentModal() {
  if (DOM.paymentModal) {
    DOM.paymentModal.classList.remove('is-visible');
  }
}

async function processPayment() {
  if (!DOM.btnPayConfirm) return;
  DOM.btnPayConfirm.disabled = true;
  DOM.btnPayConfirm.textContent = 'Processing...';

  try {
    const res = await apiPost('/api/coinbase/create-charge', { planKey: 'creator_access' });
    
    if (res.ok && res.url) {
      window.location.href = res.url;
    } else {
      alert(res.message || "Payment initialization failed.");
      closePaymentModal();
    }
  } catch (e) {
    console.error(e);
    alert("Network error. Please try again.");
    closePaymentModal();
  } finally {
    DOM.btnPayConfirm.disabled = false;
    DOM.btnPayConfirm.textContent = 'Proceed';
  }
}

document.addEventListener('DOMContentLoaded', init);