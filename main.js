import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';

// ── CONSTANTS ──
const CONTRACT_ADDRESS   = '0x95D81D4fC7AaFa0653EbadD71A437693a85d644A';
const GEN_PRICE          = BigInt('1000000000000000000'); // 1 GEN
const REQUIRED_CHAIN_ID  = 4221;
const REQUIRED_CHAIN_HEX = '0x107d';

// Bradbury: SDK использует GenLayer RPC, MetaMask — ZKSync Chain RPC
// testnetBradbury уже содержит правильный consensusMainContract и ABI
const GENLAYER_CHAIN = {
  ...testnetBradbury,
  // GenLayer RPC уже правильный: rpc-bradbury.genlayer.com
  // Переопределяем только для MetaMask (ZKSync Chain RPC)
};

// Объект для wallet_addEthereumChain / wallet_switchEthereumChain (MetaMask формат)
// MetaMask использует ZKSync Chain RPC, SDK использует GenLayer RPC внутри
const GENLAYER_NETWORK = {
  chainId: REQUIRED_CHAIN_HEX,
  chainName: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: ['https://zksync-os-testnet-genlayer.zksync.dev'],
  blockExplorerUrls: ['https://explorer-bradbury.genlayer.com'],
};

// ── STATE ──
let walletConnected = false;
let walletAddress   = null;
let isAsking        = false;
let readClient      = null;  // для чтения — без кошелька
let writeClient     = null;  // для записи — с кошельком + provider
let provider        = null;

// ── WALLET DETECTION ──
function detectProvider() {
  if (typeof window.okxwallet !== 'undefined') return window.okxwallet;
  if (window.ethereum?.providers?.length) return window.ethereum.providers[0];
  if (typeof window.ethereum !== 'undefined') return window.ethereum;
  return null;
}

function waitForProvider(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const found = detectProvider();
    if (found) { resolve(found); return; }
    let elapsed = 0;
    const iv = setInterval(() => {
      const p = detectProvider();
      if (p) { clearInterval(iv); resolve(p); return; }
      elapsed += 100;
      if (elapsed >= timeoutMs) { clearInterval(iv); resolve(null); }
    }, 100);
  });
}

// ── CLIENTS ──
function initReadClient() {
  readClient = createClient({ chain: testnetBradbury });
}

function initWriteClient(address, walletProvider) {
  writeClient = createClient({
    chain: GENLAYER_CHAIN,
    account: address,
    provider: walletProvider,
  });
  console.log('[Client] writeClient initialized with provider:', !!walletProvider);
}

// ── NETWORK HELPERS ──
async function getCurrentChainId() {
  if (!provider) return null;
  try {
    const hex = await provider.request({ method: 'eth_chainId' });
    return parseInt(hex, 16);
  } catch { return null; }
}

async function isOnCorrectNetwork() {
  return (await getCurrentChainId()) === REQUIRED_CHAIN_ID;
}

// ── SWITCH NETWORK ──
window.switchNetwork = async function () {
  if (!provider) { showToastMsg('Connect your wallet first.'); return; }
  const btn = document.querySelector('#networkBanner button');
  if (btn) { btn.textContent = 'Switching…'; btn.disabled = true; }

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: REQUIRED_CHAIN_HEX }],
    });
  } catch (err) {
    if (err.code === 4902 || err.message?.includes('Unrecognized chain')) {
      try {
        await provider.request({ method: 'wallet_addEthereumChain', params: [GENLAYER_NETWORK] });
      } catch {
        showToastMsg('Add GenLayer Testnet Chain manually in your wallet.');
        if (btn) { btn.textContent = 'Try Auto-Switch'; btn.disabled = false; }
        return;
      }
    } else if (err.code === 4001) {
      showToastMsg('Rejected. Switch the network manually in your wallet.');
      if (btn) { btn.textContent = 'Try Auto-Switch'; btn.disabled = false; }
      return;
    }
  }

  let attempts = 0;
  const poll = setInterval(async () => {
    attempts++;
    const fp = detectProvider();
    if (fp) provider = fp;
    const id = await getCurrentChainId();
    if (id === REQUIRED_CHAIN_ID) {
      clearInterval(poll);
      hideNetworkBanner();
      if (walletAddress) initWriteClient(walletAddress, provider);
      showToastMsg('✓ Switched to GenLayer Bradbury Testnet');
      if (btn) { btn.textContent = 'Try Auto-Switch'; btn.disabled = false; }
    } else if (attempts >= 60) {
      clearInterval(poll);
      showToastMsg('Not switched. Please switch manually in your wallet.');
      if (btn) { btn.textContent = 'Try Auto-Switch'; btn.disabled = false; }
    }
  }, 500);
};

// ── NETWORK BANNER ──
function showNetworkBanner() {
  let b = document.getElementById('networkBanner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'networkBanner';
    b.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:500;' +
      'background:rgba(15,8,35,.97);border:1px solid rgba(239,68,68,.6);border-radius:12px;' +
      'padding:18px 24px;text-align:center;font-family:Rajdhani,Arial,sans-serif;font-size:13px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,.8);max-width:460px;width:calc(100% - 40px);';
    document.body.appendChild(b);
  }
  b.innerHTML = `
    <div style="font-size:11px;letter-spacing:.2em;color:#f87171;margin-bottom:8px;">⚠ WRONG NETWORK</div>
    <div style="color:#e2c97e;margin-bottom:4px;font-size:14px;font-weight:600;">
      Switch to <strong>GenLayer Bradbury Testnet</strong>
    </div>
    <div style="color:#94a3b8;font-size:11px;margin-bottom:12px;">
      Chain ID: <strong style="color:#c084fc;">4221</strong> &nbsp;|&nbsp;
      RPC: <strong style="color:#c084fc;">zksync-os-testnet-genlayer.zksync.dev</strong>
    </div>
    <div style="color:#64748b;font-size:11px;margin-bottom:14px;line-height:1.7;text-align:left;
      background:rgba(255,255,255,.03);border-radius:8px;padding:8px 12px;">
      <strong style="color:#94a3b8;">Как переключить вручную:</strong><br>
      Открой кошелёк → список сетей → найди или добавь<br>
      <em style="color:#c084fc;">GenLayer Testnet Chain</em>
    </div>
    <button onclick="window.switchNetwork()" style="
      background:linear-gradient(135deg,#7c3aed,#a855f7);border:none;color:#fff;
      font-family:Rajdhani,Arial,sans-serif;font-size:13px;font-weight:600;
      letter-spacing:.06em;padding:8px 22px;border-radius:8px;cursor:pointer;">
      Try Auto-Switch</button>`;
  b.style.display = 'block';
}

function hideNetworkBanner() {
  const b = document.getElementById('networkBanner');
  if (b) b.style.display = 'none';
}

// ── CONNECT / DISCONNECT ──
window.connectWallet = async function () {
  if (walletConnected) { disconnectWallet(); return; }

  provider = await waitForProvider(4000);
  if (!provider) {
    showToastMsg('No wallet found. Install MetaMask, Rabby or OKX Wallet.');
    return;
  }

  try {
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts?.length) { showToastMsg('No accounts found. Unlock your wallet.'); return; }

    walletAddress   = accounts[0];
    walletConnected = true;

    const btn = document.getElementById('connectBtn');
    btn.textContent = walletAddress.slice(0, 6) + '…' + walletAddress.slice(-4);
    btn.classList.add('connected');
    btn.title = 'Click to disconnect';

    if (await isOnCorrectNetwork()) {
      initWriteClient(walletAddress, provider);
      hideNetworkBanner();
    } else {
      writeClient = null;
      showNetworkBanner();
    }

    provider.on('chainChanged', async () => {
      const fp = detectProvider();
      if (fp) provider = fp;
      const id = await getCurrentChainId();
      if (id === REQUIRED_CHAIN_ID) {
        hideNetworkBanner();
        initWriteClient(walletAddress, provider);
        showToastMsg('✓ GenLayer Bradbury Testnet connected');
      } else if (walletConnected) {
        writeClient = null;
        showNetworkBanner();
      }
    });

    provider.on('accountsChanged', (accs) => {
      if (!accs.length) { disconnectWallet(); return; }
      walletAddress = accs[0];
      initWriteClient(walletAddress, provider);
      document.getElementById('connectBtn').textContent =
        walletAddress.slice(0, 6) + '…' + walletAddress.slice(-4);
    });

  } catch (e) {
    if (e.code === 4001) showToastMsg('Connection rejected.');
    else { console.error('connectWallet error:', e); showToastMsg('Failed to connect. Try again.'); }
  }
};

function disconnectWallet() {
  walletConnected = false; walletAddress = null;
  writeClient = null; provider = null;
  const btn = document.getElementById('connectBtn');
  btn.textContent = 'Connect Wallet'; btn.classList.remove('connected'); btn.title = '';
  hideNetworkBanner(); showToastMsg('Wallet disconnected');
}

window.openFaucet = function () {
  window.open('https://testnet-faucet.genlayer.foundation/', '_blank');
};

// ── ASK ORACLE ──
window.askOracle = async function () {
  if (isAsking) return;

  const input = document.getElementById('questionInput');
  const q = input.value.trim();
  if (!q) { input.focus(); return; }

  if (!walletConnected) {
    showToastMsg('Connect your wallet to consult the oracle — 1 GEN per question');
    return;
  }

  if (!await isOnCorrectNetwork()) {
    showNetworkBanner();
    showToastMsg('⚠ Wrong network! Switch to GenLayer Testnet Chain. No GEN will be spent.');
    return;
  }

  if (!writeClient) {
    showToastMsg('Reconnect your wallet and make sure you are on GenLayer Testnet Chain.');
    return;
  }

  isAsking = true;
  document.getElementById('sendBtn').disabled = true;
  input.disabled = true;
  document.getElementById('inputLabel').style.opacity = '0';
  hideToast(); setTriangleText('…'); shakeOrb();
  showValidators(); await animateValidators();

  const answer = await getAnswer(q);

  setTriangleText(answer);
  if (answer !== '…' && answer !== '...') { playRevealSound(); showToast(answer); }
  hideValidators();
  document.getElementById('inputLabel').style.opacity = '1';
  isAsking = false;
  document.getElementById('sendBtn').disabled = false;
  input.disabled = false; input.value = ''; input.focus();
};

window.handleOrbClick = function () {
  if (!walletConnected) { showToastMsg('Connect your wallet — 1 GEN per question'); return; }
  const q = document.getElementById('questionInput').value.trim();
  if (q && !isAsking) window.askOracle();
  else document.getElementById('questionInput').focus();
};

// ── GET ANSWER ──
async function getAnswer(question) {
  if (!await isOnCorrectNetwork()) {
    showNetworkBanner();
    showToastMsg('⚠ Wrong network!');
    return '...';
  }
  if (!writeClient) {
    showToastMsg('Wallet not ready. Reconnect.');
    return '...';
  }

  try {
    console.log('[Oracle] Sending TX:', question);
    console.log('[Oracle] Contract:', CONTRACT_ADDRESS);
    console.log('[Oracle] Value: 1 GEN =', GEN_PRICE.toString());

    const txHash = await writeClient.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: 'ask_oracle',
      args: [question],
      value: GEN_PRICE,
    });

    console.log('[Oracle] TX sent:', txHash);
    showToastMsg('Transaction sent! Validators are deliberating…');

    // Поллинг через getTransaction — waitForTransactionReceipt падает с
    // «no NewTransaction event found» на этой версии сети
    let attempts = 0;
    let txData = null;
    while (attempts < 120) {
      await sleep(3000);
      attempts++;
      try {
        txData = await readClient.getTransaction({ hash: txHash });
        console.log('[Oracle] TX status:', txData?.statusName, '| result:', txData?.result_name);
        // status: 5=ACCEPTED, 7=FINALIZED
        if (txData?.status >= 5) break;
      } catch (pollErr) {
        console.warn('[Oracle] Poll attempt', attempts, ':', pollErr.message);
      }
    }

    console.log('[Oracle] Final TX data:', txData);

    if (!txData || txData.status < 5) {
      showToastMsg('Validators are still deliberating… Check back later.');
      return '...';
    }

    if (txData?.result_name === 'ERROR' || txData?.result === 3) {
      showToastMsg('❌ Contract execution failed.');
      return '...';
    }

    const result = await readClient.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_answer',
      args: [],
    });

    console.log('[Oracle] Answer:', result);
    if (result?.trim()) return result;

    showToastMsg('No answer yet. Validators may need more time.');
    return '...';

  } catch (e) {
    console.error('[Oracle] Full error:', e);

    if (e.code === 4001 || e.message?.includes('rejected') || e.message?.includes('denied')) {
      showToastMsg('Transaction rejected. No GEN was spent.');
      return '...';
    }
    if (e.message?.includes('insufficient') || e.message?.includes('not enough')) {
      showToastMsg('Not enough GEN. Get tokens from the faucet!');
      return '...';
    }
    if (e.message?.includes('reverted') || e.message?.includes('execution reverted')) {
      showToastMsg('❌ Transaction reverted. See console (F12) for details.');
      return '...';
    }

    showToastMsg('Something went wrong. Open console (F12) for details.');
    return '...';
  }
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
  if (window.REVEAL_SOUND_B64) { new Audio(window.REVEAL_SOUND_B64).play().catch(()=>{}); return; }
  const ctx = getAudioCtx(), now = ctx.currentTime;
  [{t:0,f:2637,v:.055},{t:.07,f:3136,v:.04},{t:.15,f:2794,v:.032},
   {t:.24,f:3520,v:.025},{t:.34,f:2637,v:.018},{t:.46,f:3136,v:.013}]
  .forEach(({t,f,v}) => {
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type='sine'; o.frequency.value=f;
    g.gain.setValueAtTime(0,now+t); g.gain.linearRampToValueAtTime(v,now+t+.006);
    g.gain.exponentialRampToValueAtTime(.001,now+t+.22);
    o.connect(g); g.connect(ctx.destination); o.start(now+t); o.stop(now+t+.25);
  });
}

// ── UI HELPERS ──
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
  for (const [m,msg] of ['RECEIVING QUERY','VALIDATORS DELIBERATING','REACHING CONSENSUS','CONSENSUS REACHED'].entries()) {
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
    const a=Math.random()*Math.PI*2, dist=70+Math.random()*140;
    p.style.cssText=`left:${cx}px;top:${cy}px;--dx:${Math.cos(a)*dist}px;--dy:${Math.sin(a)*dist}px;` +
      `animation-delay:${Math.random()*.2}s;background:${Math.random()>.5?'#a855f7':'#e2c97e'}`;
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
  setTimeout(()=>document.getElementById('answerToast').classList.remove('show'), 4500);
}
function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }

// ── BOOT ──
document.addEventListener('DOMContentLoaded', () => {
  initReadClient();
  document.getElementById('validatorsStatus').addEventListener('transitionend', function() {
    if (!this.classList.contains('visible'))
      [1,2,3,4,5].forEach(i=>document.getElementById('vd'+i).classList.remove('active'));
  });
  document.getElementById('questionInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') window.askOracle();
  });
  document.getElementById('sendBtn').addEventListener('click', () => window.askOracle());
});
