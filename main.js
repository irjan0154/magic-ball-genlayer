import { createClient } from 'genlayer-js';
import { testnetAsimov } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';

const CONTRACT_ADDRESS = '0x87be8D5C2D45B8Eb7a8eFDC8e5829c97d05bA1c7';
const GEN_PRICE = BigInt('1000000000000000000'); // 1 GEN in wei
const REQUIRED_CHAIN_ID = 4221;
const REQUIRED_CHAIN_HEX = '0x107d';

const GENLAYER_NETWORK = {
  chainId: REQUIRED_CHAIN_HEX,
  chainName: 'GenLayer Testnet Chain',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: ['https://zksync-os-testnet-genlayer.zksync.dev'],
  blockExplorerUrls: ['https://zksync-os-testnet-genlayer.explorer.zksync.dev'],
};

// ── STATE ──
let walletConnected = false;
let walletAddress = null;
let isAsking = false;
let glClient = null;
let provider = null;

// ── WAIT FOR WALLET ──
function waitForProvider(timeout = 3000) {
  return new Promise((resolve) => {
    if (typeof window.ethereum !== 'undefined') { resolve(window.ethereum); return; }
    const iv = setInterval(() => {
      if (typeof window.ethereum !== 'undefined') { clearInterval(iv); resolve(window.ethereum); }
    }, 100);
    setTimeout(() => { clearInterval(iv); resolve(null); }, timeout);
  });
}

// ── INIT READ CLIENT (только для чтения ответа) ──
function initClient(account) {
  glClient = createClient({
    chain: testnetAsimov,
    account: account || undefined,
  });
}

// ── NETWORK CHECK — читаем прямо из провайдера ──
async function getCurrentChainId() {
  if (!provider) return null;
  try {
    const hex = await provider.request({ method: 'eth_chainId' });
    return parseInt(hex, 16);
  } catch { return null; }
}

async function isOnCorrectNetwork() {
  const id = await getCurrentChainId();
  return id === REQUIRED_CHAIN_ID;
}

// ── SWITCH NETWORK ──
window.switchNetwork = async function () {
  if (!provider) { showToastMsg('Connect your wallet first.'); return; }

  const btn = document.querySelector('#networkBanner button');
  if (btn) { btn.textContent = 'Switching...'; btn.disabled = true; }

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: REQUIRED_CHAIN_HEX }],
    });
  } catch (err) {
    if (err.code === 4902 || err.message?.includes('Unrecognized chain')) {
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [GENLAYER_NETWORK],
        });
      } catch {
        showToastMsg('Please add GenLayer Testnet Chain manually in your wallet.');
        if (btn) { btn.textContent = 'Switch Network'; btn.disabled = false; }
        return;
      }
    } else if (err.code === 4001) {
      showToastMsg('Rejected. Please switch to GenLayer Testnet Chain manually.');
      if (btn) { btn.textContent = 'Switch Network'; btn.disabled = false; }
      return;
    }
  }

  // Опрашиваем каждые 300мс пока сеть не сменится
  let attempts = 0;
  const poll = setInterval(async () => {
    attempts++;
    if (await isOnCorrectNetwork()) {
      clearInterval(poll);
      hideNetworkWarning();
      if (walletAddress) initClient(walletAddress);
      showToastMsg('✓ Connected to GenLayer Testnet Chain');
    } else if (attempts >= 30) {
      clearInterval(poll);
      if (btn) { btn.textContent = 'Switch Network'; btn.disabled = false; }
      showToastMsg('Please switch to GenLayer Testnet Chain manually in your wallet.');
    }
  }, 300);
};

// ── BANNERS ──
function showNetworkWarning() {
  let b = document.getElementById('networkBanner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'networkBanner';
    b.style.cssText = `
      position:fixed;top:70px;left:50%;transform:translateX(-50%);
      background:rgba(15,8,35,.97);border:1px solid rgba(239,68,68,.6);
      border-radius:12px;padding:14px 24px;z-index:500;text-align:center;
      font-family:'Rajdhani',Arial,sans-serif;font-size:13px;
      box-shadow:0 8px 32px rgba(0,0,0,.8);
      max-width:420px;width:calc(100% - 40px);`;
    document.body.appendChild(b);
  }
  b.innerHTML = `
    <div style="margin-bottom:8px;font-size:11px;letter-spacing:.2em;color:#f87171;">⚠ WRONG NETWORK</div>
    <div style="color:#e2c97e;margin-bottom:12px;">
      Switch to <strong>GenLayer Testnet Chain</strong> to use the oracle
    </div>
    <button onclick="window.switchNetwork()" style="
      background:linear-gradient(135deg,#7c3aed,#a855f7);border:none;color:white;
      font-family:'Rajdhani',Arial,sans-serif;font-size:13px;font-weight:600;
      letter-spacing:.06em;padding:8px 22px;border-radius:8px;cursor:pointer;">
      Switch Network
    </button>`;
  b.style.display = 'block';
}

function hideNetworkWarning() {
  const b = document.getElementById('networkBanner');
  if (b) b.style.display = 'none';
}

// ── WALLET: CONNECT / DISCONNECT ──
window.connectWallet = async function () {
  if (walletConnected) { disconnectWallet(); return; }

  provider = await waitForProvider(3000);
  if (!provider) {
    showToastMsg('No wallet found. Please install MetaMask, Rabby, OKX or any EVM wallet.');
    return;
  }

  try {
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts?.length) { showToastMsg('No accounts found. Unlock your wallet.'); return; }

    walletAddress = accounts[0];
    walletConnected = true;

    const btn = document.getElementById('connectBtn');
    btn.textContent = walletAddress.slice(0,6) + '...' + walletAddress.slice(-4);
    btn.classList.add('connected');
    btn.title = 'Click to disconnect';

    initClient(walletAddress);

    // Проверка сети сразу при подключении
    if (!await isOnCorrectNetwork()) showNetworkWarning();

    provider.on('chainChanged', async () => {
      if (await isOnCorrectNetwork()) {
        hideNetworkWarning();
        if (walletAddress) initClient(walletAddress);
        showToastMsg('✓ GenLayer Testnet Chain connected');
      } else if (walletConnected) {
        showNetworkWarning();
      }
    });

    provider.on('accountsChanged', (accs) => {
      if (!accs.length) { disconnectWallet(); return; }
      walletAddress = accs[0];
      initClient(walletAddress);
      document.getElementById('connectBtn').textContent =
        walletAddress.slice(0,6) + '...' + walletAddress.slice(-4);
    });

  } catch (e) {
    if (e.code === 4001) showToastMsg('Connection rejected.');
    else { console.error(e); showToastMsg('Failed to connect. Try again.'); }
  }
};

function disconnectWallet() {
  walletConnected = false; walletAddress = null; glClient = null; provider = null;
  const btn = document.getElementById('connectBtn');
  btn.textContent = 'Connect Wallet'; btn.classList.remove('connected'); btn.title = '';
  hideNetworkWarning(); initClient(null); showToastMsg('Wallet disconnected');
}

window.openFaucet = function () {
  window.open('https://testnet-faucet.genlayer.foundation/', '_blank');
};

// ── ORACLE ──
window.askOracle = async function () {
  if (isAsking) return;
  const input = document.getElementById('questionInput');
  const q = input.value.trim();
  if (!q) { input.focus(); return; }

  if (!walletConnected) {
    showToastMsg('Connect your wallet to consult the oracle — 1 GEN per question');
    return;
  }

  // Жёсткая проверка сети ПЕРЕД запросом
  if (!await isOnCorrectNetwork()) {
    showNetworkWarning();
    showToastMsg('⚠ Switch to GenLayer Testnet Chain first!');
    return;
  }

  isAsking = true;
  document.getElementById('sendBtn').disabled = true;
  input.disabled = true;
  document.getElementById('inputLabel').style.opacity = '0';
  hideToast(); setTriangleText('...'); shakeOrb();
  showValidators(); await animateValidators();

  const answer = await getAnswer(q);

  setTriangleText(answer); playRevealSound(); showToast(answer); hideValidators();
  document.getElementById('inputLabel').style.opacity = '1';
  isAsking = false;
  document.getElementById('sendBtn').disabled = false;
  input.disabled = false; input.value = ''; input.focus();
};

window.handleOrbClick = function () {
  const q = document.getElementById('questionInput').value.trim();
  if (!walletConnected) {
    showToastMsg('Connect your wallet — 1 GEN per question'); return;
  }
  if (q && !isAsking) window.askOracle();
  else document.getElementById('questionInput').focus();
};

// ── GET ANSWER ──
async function getAnswer(question) {
  // Последняя проверка сети
  if (!await isOnCorrectNetwork()) {
    showNetworkWarning();
    showToastMsg('⚠ Wrong network! Switch to GenLayer Testnet Chain.');
    return '...';
  }

  if (!walletConnected || !glClient) { showToastMsg('Connect wallet first!'); return '...'; }

  try {
    console.log('Sending tx with 1 GEN to GenLayer contract...');

    const txHash = await glClient.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: 'ask_oracle',
      args: [question],
      value: GEN_PRICE,
    });
    console.log('TX sent:', txHash);

    await glClient.waitForTransactionReceipt({
      hash: txHash,
      status: TransactionStatus.FINALIZED,
      fullTransaction: false,
    });

    const result = await glClient.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_answer',
      args: [],
    });
    console.log('Answer:', result);

    if (result?.trim()) return result;
    return localAnswer();

  } catch (e) {
    console.warn('TX error:', e.message);
    if (e.code === 4001 || e.message?.includes('rejected') || e.message?.includes('denied')) {
      showToastMsg('Transaction rejected. No GEN spent.');
      return '...';
    }
    if (e.message?.includes('insufficient')) {
      showToastMsg('Not enough GEN. Get tokens from the faucet!');
      return '...';
    }
    return localAnswer();
  }
}

function localAnswer() {
  const a = [
    'Validators say yes!','Big brain move!','Yes! Consensus reached!',
    'Validators approve!','Epic win!','Yes! LFG!',
    'The network whispers yes','Blockchain agrees','Heck yeah!',
    'Error 404: Answer not found','Maybe… or maybe not','Meh… who knows',
    'Validators are unsure','Ask the oracle later','Check the nodes',
    'Validators say NO!','The test fails',"That's a fail",
    'Nah, not today','Sadge','Blockchain magic guides you',
    'Nodes will help you','Oracle nods','GenLayer knows the answer',
  ];
  return a[Math.floor(Math.random() * a.length)];
}

// ── AUDIO ──
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playShakeSound() {
  const ctx = getAudioCtx(), now = ctx.currentTime, dur = 1.3;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1)*.7 + Math.sin(i*.003)*.3;
  const noise = ctx.createBufferSource(); noise.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = .8;
  bp.frequency.setValueAtTime(80,now); bp.frequency.linearRampToValueAtTime(120,now+.6);
  bp.frequency.linearRampToValueAtTime(70,now+dur);
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(0,now); mg.gain.linearRampToValueAtTime(.3,now+.1);
  mg.gain.setValueAtTime(.3,now+.6); mg.gain.linearRampToValueAtTime(0,now+dur);
  noise.connect(bp); bp.connect(mg); mg.connect(ctx.destination);
  noise.start(now); noise.stop(now+dur);
}

function playRevealSound() {
  if (window.REVEAL_SOUND_B64) {
    new Audio(window.REVEAL_SOUND_B64).play().catch(()=>{});
    return;
  }
  const ctx = getAudioCtx(), now = ctx.currentTime;
  [{t:0,f:2637,v:.055},{t:.07,f:3136,v:.04},{t:.15,f:2794,v:.032},
   {t:.24,f:3520,v:.025},{t:.34,f:2637,v:.018},{t:.46,f:3136,v:.013}]
  .forEach(({t,f,v}) => {
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type='sine'; o.frequency.value=f;
    g.gain.setValueAtTime(0,now+t);
    g.gain.linearRampToValueAtTime(v,now+t+.006);
    g.gain.exponentialRampToValueAtTime(.001,now+t+.22);
    o.connect(g); g.connect(ctx.destination);
    o.start(now+t); o.stop(now+t+.25);
  });
}

function shakeOrb() {
  const orb = document.getElementById('orb');
  orb.classList.remove('shaking'); void orb.offsetWidth; orb.classList.add('shaking');
  orb.addEventListener('animationend', ()=>orb.classList.remove('shaking'), {once:true});
  spawnParticles(); playShakeSound();
}

function setTriangleText(text) {
  const el = document.getElementById('triangleText');
  el.style.opacity = '0';
  setTimeout(() => {
    el.textContent = text;
    const n = text.length;
    el.style.fontSize = n<=8?'13px':n<=14?'11px':n<=20?'10px':n<=28?'9px':'7.5px';
    el.style.transition = 'opacity .5s ease'; el.style.opacity = '1';
  }, 280);
}

function showValidators() { document.getElementById('validatorsStatus').classList.add('visible'); }
function hideValidators()  { document.getElementById('validatorsStatus').classList.remove('visible'); }

async function animateValidators() {
  const dots = [1,2,3,4,5].map(i=>document.getElementById('vd'+i));
  const text = document.getElementById('validatorText');
  for (const [m, msg] of ['RECEIVING QUERY','VALIDATORS DELIBERATING','REACHING CONSENSUS','CONSENSUS REACHED'].entries()) {
    text.textContent = msg;
    for (let i=0; i<=Math.min(m+1,4); i++) dots[i].classList.add('active');
    await sleep(900);
  }
}

function spawnParticles() {
  const r = document.querySelector('.orb-container').getBoundingClientRect();
  const cx=r.left+r.width/2, cy=r.top+r.height/2;
  for (let i=0; i<16; i++) {
    const p=document.createElement('div'); p.className='particle';
    const a=Math.random()*Math.PI*2, d=70+Math.random()*140;
    p.style.cssText=`left:${cx}px;top:${cy}px;--dx:${Math.cos(a)*d}px;--dy:${Math.sin(a)*d}px;animation-delay:${Math.random()*.2}s;background:${Math.random()>.5?'#a855f7':'#e2c97e'}`;
    document.body.appendChild(p); setTimeout(()=>p.remove(),1500);
  }
}

function showToast(msg) {
  document.getElementById('answerText').textContent = msg;
  document.getElementById('answerToast').classList.add('show');
  setTimeout(()=>document.getElementById('answerToast').classList.remove('show'), 7000);
}
function hideToast() { document.getElementById('answerToast').classList.remove('show'); }
function showToastMsg(msg) {
  document.getElementById('answerText').textContent = msg;
  document.getElementById('answerToast').classList.add('show');
  setTimeout(()=>document.getElementById('answerToast').classList.remove('show'), 4000);
}
function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }

// ── BOOT ──
document.addEventListener('DOMContentLoaded', () => {
  initClient(null);
  document.getElementById('validatorsStatus').addEventListener('transitionend', function() {
    if (!this.classList.contains('visible'))
      [1,2,3,4,5].forEach(i=>document.getElementById('vd'+i).classList.remove('active'));
  });
  document.getElementById('questionInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') window.askOracle();
  });
});
