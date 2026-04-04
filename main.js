import { createClient } from 'genlayer-js';
import { testnetAsimov } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';

// ── ЗАМЕНИ НА НОВЫЙ АДРЕС ПОСЛЕ ДЕПЛОЯ ──
const CONTRACT_ADDRESS = '0x87be8D5C2D45B8Eb7a8eFDC8e5829c97d05bA1c7';

const GEN_PRICE = BigInt('1000000000000000000'); // 1 GEN в wei

// ── STATE ──
let walletConnected = false;
let walletAddress = null;
let isAsking = false;
let glClient = null;

// ── INIT SDK CLIENT ──
function initClient(account) {
  glClient = createClient({
    chain: testnetAsimov,
    account: account || undefined,
  });
  console.log('GenLayer client initialized on testnetAsimov');
}

// ── WALLET: CONNECT / DISCONNECT ──
window.connectWallet = async function () {
  // Если уже подключён — дисконнект
  if (walletConnected) {
    disconnectWallet();
    return;
  }

  if (typeof window.ethereum === 'undefined') {
    showToastMsg('Please install MetaMask');
    return;
  }

  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    walletAddress = accounts[0];
    walletConnected = true;

    const btn = document.getElementById('connectBtn');
    btn.textContent = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);
    btn.classList.add('connected');
    btn.title = 'Click to disconnect';

    initClient(walletAddress);
    console.log('Wallet connected:', walletAddress);
  } catch (e) {
    console.error('Wallet connection failed:', e);
  }
};

function disconnectWallet() {
  walletConnected = false;
  walletAddress = null;
  glClient = null;

  const btn = document.getElementById('connectBtn');
  btn.textContent = 'Connect Wallet';
  btn.classList.remove('connected');
  btn.title = '';

  // Re-init read-only client
  initClient(null);
  showToastMsg('Wallet disconnected');
  console.log('Wallet disconnected');
}

// Следим за сменой аккаунта в MetaMask
if (typeof window.ethereum !== 'undefined') {
  window.ethereum.on('accountsChanged', (accounts) => {
    if (accounts.length === 0) {
      disconnectWallet();
    } else if (walletConnected) {
      walletAddress = accounts[0];
      initClient(walletAddress);
      const btn = document.getElementById('connectBtn');
      btn.textContent = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);
    }
  });
}

window.openFaucet = function () {
  window.open('https://testnet-faucet.genlayer.foundation/', '_blank');
};

// ── MAIN ORACLE FUNCTION ──
window.askOracle = async function () {
  if (isAsking) return;

  const input = document.getElementById('questionInput');
  const q = input.value.trim();
  if (!q) { input.focus(); return; }

  // Если кошелёк не подключён — показываем сообщение
  if (!walletConnected) {
    showToastMsg('Connect your wallet to consult the oracle — 1 GEN per question');
    return;
  }

  isAsking = true;
  document.getElementById('sendBtn').disabled = true;
  input.disabled = true;
  document.getElementById('inputLabel').style.opacity = '0';
  hideToast();
  setTriangleText('...');
  shakeOrb();
  showValidators();
  await animateValidators();

  const answer = await getAnswer(q);

  setTriangleText(answer);
  playRevealSound();
  showToast(answer);
  hideValidators();

  document.getElementById('inputLabel').style.opacity = '1';
  isAsking = false;
  document.getElementById('sendBtn').disabled = false;
  input.disabled = false;
  input.value = '';
  input.focus();
};

window.handleOrbClick = function () {
  const q = document.getElementById('questionInput').value.trim();
  if (!walletConnected) {
    showToastMsg('Connect your wallet to consult the oracle — 1 GEN per question');
    return;
  }
  if (q && !isAsking) window.askOracle();
  else document.getElementById('questionInput').focus();
};

// ── GET ANSWER FROM BLOCKCHAIN (с оплатой 1 GEN) ──
async function getAnswer(question) {
  if (!walletConnected || !glClient) {
    showToastMsg('Connect your wallet first!');
    return localAnswer();
  }

  try {
    console.log('Sending question to GenLayer contract with 1 GEN payment...');

    // Вызов контракта с оплатой 1 GEN (value передаётся в wei)
    const txHash = await glClient.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: 'ask_oracle',
      args: [question],
      value: GEN_PRICE,   // ← 1 GEN оплата
    });
    console.log('Transaction sent:', txHash);

    // Ждём финализации (валидаторы достигают консенсуса)
    const receipt = await glClient.waitForTransactionReceipt({
      hash: txHash,
      status: TransactionStatus.FINALIZED,
      fullTransaction: false,
    });
    console.log('Transaction finalized:', receipt);

    // Читаем ответ из контракта
    const result = await glClient.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_answer',
      args: [],
    });
    console.log('Answer from contract:', result);

    if (result && result.trim()) return result;
    return localAnswer();

  } catch (e) {
    console.warn('Contract call failed. Error:', e.message);

    // Если пользователь отклонил транзакцию в MetaMask
    if (e.message?.includes('rejected') || e.message?.includes('denied') || e.code === 4001) {
      showToastMsg('Transaction rejected. No GEN was spent.');
      return '...';
    }

    // Если недостаточно средств
    if (e.message?.includes('insufficient')) {
      showToastMsg('Insufficient GEN balance. Get tokens from the faucet!');
      return '...';
    }

    return localAnswer();
  }
}

function localAnswer() {
  const answers = [
    'Validators say yes!', 'Big brain move!', 'Yes! Consensus reached!',
    'Validators approve!', 'Epic win!', 'Infinite loop of yes',
    'Yes! LFG!', 'The network whispers yes', 'Blockchain agrees', 'Heck yeah!',
    'Error 404: Answer not found', 'Maybe… or maybe not', 'Meh… who knows',
    'Hold up, think again', 'IDK fam, maybe', 'Validators are unsure',
    'Validators say NO!', 'The test fails', '0% chance, 100% regret',
    "That's a fail", 'Nah, not today', 'Sadge', 'Lmao nope',
    'Blockchain magic guides you', 'Nodes will help you', 'Oracle nods',
  ];
  return answers[Math.floor(Math.random() * answers.length)];
}

// ── AUDIO ──
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playShakeSound() {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  const duration = 1.3;
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.7 + Math.sin(i * 0.003) * 0.3;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.setValueAtTime(80, now);
  bandpass.frequency.linearRampToValueAtTime(120, now + 0.6);
  bandpass.frequency.linearRampToValueAtTime(70, now + duration);
  bandpass.Q.value = 0.8;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(0.3, now + 0.1);
  masterGain.gain.setValueAtTime(0.3, now + 0.6);
  masterGain.gain.linearRampToValueAtTime(0, now + duration);
  noise.connect(bandpass);
  bandpass.connect(masterGain);
  masterGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + duration);
}

function playRevealSound() {
  if (window.REVEAL_SOUND_B64) {
    const audio = new Audio(window.REVEAL_SOUND_B64);
    audio.volume = 1.0;
    audio.play().catch(e => console.warn('Audio play failed:', e));
    return;
  }
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  const sparkles = [
    { t: 0.00, f: 2637, v: 0.055 },
    { t: 0.07, f: 3136, v: 0.040 },
    { t: 0.15, f: 2794, v: 0.032 },
    { t: 0.24, f: 3520, v: 0.025 },
    { t: 0.34, f: 2637, v: 0.018 },
    { t: 0.46, f: 3136, v: 0.013 },
  ];
  sparkles.forEach(({ t, f, v }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0, now + t);
    gain.gain.linearRampToValueAtTime(v, now + t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + t);
    osc.stop(now + t + 0.25);
  });
}

// ── ORB ──
function shakeOrb() {
  const orb = document.getElementById('orb');
  orb.classList.remove('shaking');
  void orb.offsetWidth;
  orb.classList.add('shaking');
  orb.addEventListener('animationend', () => orb.classList.remove('shaking'), { once: true });
  spawnParticles();
  playShakeSound();
}

function setTriangleText(text) {
  const el = document.getElementById('triangleText');
  el.style.opacity = '0';
  setTimeout(() => {
    el.textContent = text;
    const len = text.length;
    let size;
    if (len <= 8)       size = '13px';
    else if (len <= 14) size = '11px';
    else if (len <= 20) size = '10px';
    else if (len <= 28) size = '9px';
    else                size = '7.5px';
    el.style.fontSize = size;
    el.style.transition = 'opacity 0.5s ease';
    el.style.opacity = '1';
  }, 280);
}

function showValidators() {
  document.getElementById('validatorsStatus').classList.add('visible');
}
function hideValidators() {
  document.getElementById('validatorsStatus').classList.remove('visible');
}

async function animateValidators() {
  const dots = [1, 2, 3, 4, 5].map(i => document.getElementById('vd' + i));
  const text = document.getElementById('validatorText');
  const msgs = ['RECEIVING QUERY', 'VALIDATORS DELIBERATING', 'REACHING CONSENSUS', 'CONSENSUS REACHED'];
  for (let m = 0; m < msgs.length; m++) {
    text.textContent = msgs[m];
    for (let i = 0; i <= Math.min(m + 1, dots.length - 1); i++) dots[i].classList.add('active');
    await sleep(900);
  }
}

function spawnParticles() {
  const rect = document.querySelector('.orb-container').getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  for (let i = 0; i < 16; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 140;
    p.style.cssText = `left:${cx}px;top:${cy}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;animation-delay:${Math.random() * 0.2}s;background:${Math.random() > .5 ? '#a855f7' : '#e2c97e'}`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1500);
  }
}

function showToast(msg) {
  document.getElementById('answerText').textContent = msg;
  document.getElementById('answerToast').classList.add('show');
  setTimeout(() => document.getElementById('answerToast').classList.remove('show'), 7000);
}
function hideToast() { document.getElementById('answerToast').classList.remove('show'); }
function showToastMsg(msg) {
  document.getElementById('answerText').textContent = msg;
  document.getElementById('answerToast').classList.add('show');
  setTimeout(() => document.getElementById('answerToast').classList.remove('show'), 4000);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── BOOT ──
document.addEventListener('DOMContentLoaded', () => {
  initClient(null);

  document.getElementById('validatorsStatus').addEventListener('transitionend', function () {
    if (!this.classList.contains('visible'))
      [1, 2, 3, 4, 5].forEach(i => document.getElementById('vd' + i).classList.remove('active'));
  });

  document.getElementById('questionInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') window.askOracle();
  });
});
