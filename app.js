const API_URL = 'YOUR_RAILWAY_BACKEND_URL'; // REPLACE THIS WITH YOUR RAILWAY URL
const SUPPORTED_COINS = ['usdttrc20','usdterc20','usdc','btc','eth','sol','bnb','lite','tron'];
let slip = [];
let token = localStorage.getItem('betskale_token');
let currentSport = 'soccer_epl';
let kycStatus = 'none';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const closeModal = id => $(`#${id}`).classList.remove('open');
const openModal = id => $(`#${id}`).classList.add('open');

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
}

async function apiCall(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  try {
    const res = await fetch(API_URL + endpoint, { ...options, headers });
    if (res.status === 401) { logout(); throw new Error('Session expired'); }
    return res;
  } catch (e) {
    console.error('API Error:', e);
    throw e;
  }
}

// ===== AUTH =====
function updateAuthUI() {
  if (token) {
    $('#authBox').innerHTML = `<button onclick="openModal('walletModal');loadWallet()">Wallet</button><button onclick="logout()">Logout</button>`;
    $('#walletMini').style.display = 'block';
    loadWallet();
    checkKYC();
  } else {
    $('#authBox').innerHTML = `<button id="loginBtn">Login</button><button id="registerBtn" class="primary">Register</button>`;
    $('#loginBtn').onclick = () => openAuth(false);
    $('#registerBtn').onclick = () => openAuth(true);
    $('#walletMini').style.display = 'none';
  }
}

function openAuth(isReg = false) {
  openModal('authModal');
  $('#authTitle').textContent = isReg? 'Register' : 'Login';
  $('#authToggle').textContent = isReg? 'Have an account? Login' : 'Need an account? Register';
  $('#authSubmit').onclick = isReg? register : login;
  $('#authError').textContent = '';
}
$('#authToggle').onclick = () => openAuth($('#authTitle').textContent === 'Login');

async function login() {
  const email = $('#authEmail').value, password = $('#authPass').value;
  if (!email ||!password) return $('#authError').textContent = 'Fill all fields';
  const res = await apiCall('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  const data = await res.json();
  if (res.ok) { localStorage.setItem('betskale_token', data.token); token = data.token; closeModal('authModal'); updateAuthUI(); loadMatches(); }
  else $('#authError').textContent = data.error;
}

async function register() {
  const email = $('#authEmail').value, password = $('#authPass').value;
  if (!email || password.length < 6) return $('#authError').textContent = 'Password min 6 chars';
  const res = await apiCall('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
  const data = await res.json();
  if (res.ok) { localStorage.setItem('betskale_token', data.token); token = data.token; closeModal('authModal'); updateAuthUI(); loadMatches(); }
  else $('#authError').textContent = data.error;
}

function logout() { localStorage.clear(); token = null; slip = []; $('#slipCount').textContent = 0; updateAuthUI(); loadMatches(); }

// ===== MATCHES =====
async function loadMatches() {
  $('#matchList').innerHTML = '<div class="loader">Loading matches...</div>';
  try {
    const res = await apiCall(`/api/odds?sport=${currentSport}`);
    const data = await res.json();
    $('#modeBadge').textContent = data.mode === 'real'? 'REAL MONEY - CRYPTO' : 'DEMO MODE';
    if (!data.matches?.length) { $('#matchList').innerHTML = '<div class="loader">No matches available</div>'; return; }
    $('#matchList').innerHTML = data.matches.map(m => `
      <div class="match-card">
        <div class="match-meta"><span>⚽ ${m.league}</span><span>${formatDate(m.time)}</span></div>
        <div class="match-row">
          <div class="teams">${m.home}<br>${m.away}</div>
          <button class="odd-btn" onclick="addToSlip('${m.id}','${m.home}','${m.away}','${m.home}',${m.odds[0]||0})">${m.odds[0]?.toFixed(2) || '-'}</button>
          <button class="odd-btn" onclick="addToSlip('${m.id}','${m.home}','${m.away}','Draw',${m.odds[2]||0})">${m.odds[2]?.toFixed(2) || '-'}</button>
          <button class="odd-btn" onclick="addToSlip('${m.id}','${m.home}','${m.away}','${m.away}',${m.odds[1]||0})">${m.odds[1]?.toFixed(2) || '-'}</button>
        </div>
      </div>`).join('');
  } catch (e) {
    $('#matchList').innerHTML = '<div class="loader">Error loading matches. Check backend connection.</div>';
  }
}

$$('.filter-btn').forEach(btn => {
  btn.onclick = () => {
    $$('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSport = btn.dataset.sport;
    loadMatches();
  };
});

// ===== BET SLIP =====
window.addToSlip = (matchId, home, away, pick, odd) => {
  if (!odd) return;
  const id = `${matchId}_${pick}`;
  if (slip.find(s => s.id === id)) return;
  slip.push({ id, matchId, match: `${home} vs ${away}`, pick, odd });
  $('#slipCount').textContent = slip.length;
  event.target.classList.add('selected');
}

function renderSlip() {
  const totalOdds = slip.reduce((a, s) => a * s.odd, 1);
  const stake = Number($('#stakeInput').value) || 0;
  $('#slipCountModal').textContent = slip.length;
  $('#totalOdds').textContent = totalOdds.toFixed(2);
  $('#potentialWin').textContent = '$' + (stake * totalOdds).toFixed(2);
  $('#slipItems').innerHTML = slip.length? slip.map((s, i) => `
    <div class="slip-item">
      <div><b>${s.pick}</b><br><small>${s.match}</small></div>
      <div>${s.odd.toFixed(2)} <button class="remove" onclick="removeSlip(${i})">✕</button></div>
    </div>`).join('') : '<p style="text-align:center;color:#fff6">No selections</p>';
  $('#placeBetBtn').disabled = slip.length === 0 || stake <= 0;
}

window.removeSlip = i => { slip.splice(i, 1); renderSlip(); $('#slipCount').textContent = slip.length; }
$('#stakeInput').oninput = renderSlip;

async function placeBet() {
  if (!token) return openAuth();
  const stake = Number($('#stakeInput').value);
  if (!stake || slip.length === 0) return;
  const btn = $('#placeBetBtn');
  btn.disabled = true; btn.textContent = 'Placing...';
  try {
    const res = await apiCall('/api/bets/place', { method: 'POST', body: JSON.stringify({ stake, selections: slip }) });
    const data = await res.json();
    if (res.ok) {
      alert(`Bet placed! Potential win: $${data.bet.potential_win}`);
      slip = []; $('#stakeInput').value = ''; closeModal('slipModal'); renderSlip(); $('#slipCount').textContent = 0;
      loadWallet();
    } else alert(data.error);
  } catch (e) { alert('Error placing bet'); }
  btn.disabled = false; btn.textContent = 'Place Bet';
}

// ===== WALLET =====
async function loadWallet() {
  if (!token) return;
  try {
    const res = await apiCall('/api/wallet');
    const w = await res.json();
    $('#realBal').textContent = parseFloat(w.balance_usd).toFixed(2);
    $('#demoBal').textContent = parseFloat(w.demo_coins).toFixed(2);
    $('#balMini').textContent = parseFloat(w.balance_usd).toFixed(2);
  } catch (e) { console.error(e); }
}

async function checkKYC() {
  if (!token) return;
  try {
    const res = await apiCall('/api/kyc/status');
    const data = await res.json();
    kycStatus = data.status;
    $('#kycWarning').style.display = kycStatus === 'approved'? 'none' : 'block';
  } catch (e) { kycStatus = 'none'; }
}

function initWalletModal() {
  $('#depCoin').innerHTML = SUPPORTED_COINS.map(c => `<option value="${c}">${c.toUpperCase()}</option>`).join('');
  $('#withCoin').innerHTML = SUPPORTED_COINS.map(c => `<option value="${c}">${c.toUpperCase()}</option>`).join('');
  $$('.tab').forEach(t => t.onclick = () => {
    $$('.tab').forEach(x => x.classList.remove('active'));
    $$('.tab-content').forEach(x => x.style.display = 'none');
    t.classList.add('active');
    $(`#${t.dataset.tab}Tab`).style.display = 'block';
    if (t.dataset.tab === 'history') loadTxHistory();
    if (t.dataset.tab === 'withdraw') checkKYC();
  });
}

async function createDeposit() {
  const amount = $('#depAmount').value, currency = $('#depCoin').value;
  if (!amount || amount < 5) return alert('Min deposit $5');
  try {
    const res = await apiCall('/api/payments/crypto/deposit', { method: 'POST', body: JSON.stringify({ amount: Number(amount), currency }) });
    const data = await res.json();
    if (res.ok) $('#depResult').innerHTML = `<p style="margin-top:12px">Send <b>${data.pay_amount} ${data.pay_currency.toUpperCase()}</b> to:</p><p style="word-break:break-all;background:#1C2029;padding:8px;border-radius:8px;margin:8px 0;font-size:12px">${data.pay_address}</p><a href="${data.invoice_url}" target="_blank" style="display:block;text-align:center;background:#4CAF50;padding:12px;border-radius:8px;color:#fff;font-weight:700">Open Invoice Page</a>`;
    else alert(data.error);
  } catch (e) { alert('Error creating deposit'); }
}

async function createWithdraw() {
  if (kycStatus!== 'approved') return alert('KYC verification required');
  const amount = $('#withAmount').value, currency = $('#withCoin').value, address = $('#withAddr').value;
  if (!amount || amount < 20) return alert('Min withdrawal $20');
  if (!address) return alert('Enter wallet address');
  try {
    const res = await apiCall('/api/payments/crypto/withdraw', { method: 'POST', body: JSON.stringify({ amount: Number(amount), currency, address }) });
    const data = await res.json();
    alert(data.msg || data.error);
    if (res.ok) loadWallet();
  } catch (e) { alert('Error requesting withdrawal'); }
}

async function startKYC() {
  try {
    const res = await apiCall('/api/kyc/start', { method: 'POST' });
    const data = await res.json();
    if (res.ok) window.open(data.kyc_url, '_blank');
    else alert(data.error);
  } catch (e) { alert('Error starting KYC'); }
}

async function loadTxHistory() {
  try {
    const res = await apiCall('/api/transactions');
    const txs = await res.json();
    $('#txHistory').innerHTML = txs.length? txs.map(t => `
      <div class="tx-item">
        <span>${t.type.toUpperCase()} ${t.currency || ''}</span>
        <b style="color:${t.amount_usd > 0? '#4CAF50' : '#E63946'}">${t.amount_usd > 0? '+' : ''}$${Math.abs(t.amount_usd).toFixed(2)}</b>
        <br><small style="color:#fff6">${formatDate(t.created_at)} - ${t.status}</small>
      </div>`).join('') : '<p style="text-align:center;color:#fff6">No transactions</p>';
  } catch (e) { $('#txHistory').innerHTML = '<p style="color:#fff6">Error loading history</p>'; }
}

// ===== MY BETS =====
async function loadMyBets() {
  try {
    const res = await apiCall('/api/bets/my');
    const bets = await res.json();
    $('#myBetsList').innerHTML = bets.length? bets.map(b => `
      <div class="bet-history-item">
        <div class="bet-status ${b.status}">${b.status.toUpperCase()}</div>
        <b>$${b.stake_usd} @ ${b.odds}</b>
        <br><small>${JSON.parse(b.selections).map(s => s.match + ' - ' + s.pick).join(', ')}</small>
        <br><small style="color:#fff6">Potential: $${b.potential_win} | ${formatDate(b.placed_at)}</small>
      </div>`).join('') : '<p style="text-align:center;color:#fff6">No bets yet</p>';
  } catch (e) { $('#myBetsList').innerHTML = '<p style="color:#fff6">Error loading bets</p>'; }
}

// ===== NAV =====
$$('.nav-item').forEach(item => {
  item.onclick = () => {
    $$('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    const page = item.dataset.page;
    if (page === 'wallet') { if (!token) return openAuth(); openModal('walletModal'); loadWallet(); }
    if (page === 'bets') { if (!token) return openAuth(); openModal('betsModal'); loadMyBets(); }
    if (page === 'profile') alert('Profile coming soon');
    if (page === 'sports') closeModal('betsModal');
  };
});
$('.slip').onclick = () => { openModal('slipModal'); renderSlip(); };

window.openPage = (page) => window.open(API_URL + '/' + page, '_blank');

// ===== INIT =====
async function init() {
  updateAuthUI();
  initWalletModal();
  try {
    const licRes = await apiCall('/api/licenses');
    const lic = await licRes.json();
    $('#licenseFooter').textContent = `Licensed: ${lic.license}`;
  } catch (e) { console.error('License fetch failed'); }
  loadMatches();
}
init();
