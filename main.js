import { createClient } from 'genlayer-js';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT || '0x87be8D5C2D45B8Eb7a8eFDC8e5829c97d05bA1c7';
const REQUIRED_CHAIN_ID = '0x107d'; // 4221
const GEN_PRICE = BigInt(import.meta.env.VITE_PRICE || '1000000000000000000');

let client;
let account;
let isAsking = false;

// ---------- WALLET ----------
async function waitForProvider(timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (window.ethereum) return window.ethereum;
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('Wallet not found');
}

async function connectWallet() {
  try {
    const ethereum = await waitForProvider();

    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    account = accounts[0];

    client = createClient({ provider: ethereum });

    listenWalletEvents(ethereum);
    await ensureCorrectNetwork();

    updateUI();
    setStatus('Wallet connected');
  } catch (e) {
    setStatus(e.message);
  }
}

function listenWalletEvents(ethereum) {
  ethereum.on('chainChanged', () => window.location.reload());

  ethereum.on('accountsChanged', (accounts) => {
    account = accounts[0] || null;
    updateUI();
  });
}

// ---------- NETWORK ----------
async function getChainId() {
  return await window.ethereum.request({ method: 'eth_chainId' });
}

async function ensureCorrectNetwork() {
  const chainId = await getChainId();
  if (chainId !== REQUIRED_CHAIN_ID) {
    showSwitchNetworkButton();
    throw new Error('Wrong network');
  }
}

async function switchNetwork() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: REQUIRED_CHAIN_ID }]
    });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: REQUIRED_CHAIN_ID,
          chainName: 'GenLayer Testnet',
          rpcUrls: [import.meta.env.VITE_RPC || 'https://rpc.genlayer.com'],
          nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 }
        }]
      });
    } else {
      throw err;
    }
  }
}

// ---------- HELPERS ----------
async function checkBalance() {
  const balance = await window.ethereum.request({
    method: 'eth_getBalance',
    params: [account, 'latest']
  });

  return BigInt(balance);
}

function withTimeout(promise, ms = 30000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
  ]);
}

// ---------- CONTRACT ----------
async function askQuestion(question) {
  if (isAsking) return;
  isAsking = true;

  try {
    await ensureCorrectNetwork();

    if (!question || question.length > 200) {
      throw new Error('Invalid question');
    }

    const balance = await checkBalance();
    if (balance < GEN_PRICE) {
      throw new Error('Not enough GEN');
    }

    disableAskButton(true);
    setStatus('Sending transaction...');

    const tx = await client.writeContract({
      address: CONTRACT_ADDRESS,
      method: 'ask',
      args: [question],
      value: GEN_PRICE
    });

    setStatus('Waiting confirmation...');

    const receipt = await withTimeout(tx.wait(), 60000);

    if (receipt.status !== 1) {
      throw new Error('Transaction failed');
    }

    setStatus('Waiting for oracle...');

    await new Promise(r => setTimeout(r, 2000));

    const result = await client.readContract({
      address: CONTRACT_ADDRESS,
      method: 'get_last_answer',
      args: [account]
    });

    cacheAnswer(question, result);
    showAnswer(result);
    setStatus('Done');

  } catch (err) {
    if (err.code === 4001) {
      setStatus('User rejected transaction');
    } else {
      setStatus(err.message);
    }
    console.error(err);
  } finally {
    isAsking = false;
    disableAskButton(false);
  }
}

// ---------- CACHE ----------
function cacheAnswer(q, a) {
  const data = JSON.parse(localStorage.getItem('history') || '[]');
  data.unshift({ q, a, ts: Date.now() });
  localStorage.setItem('history', JSON.stringify(data.slice(0, 10)));
}

// ---------- UI ----------
function updateUI() {
  const el = document.getElementById('account');
  if (el) el.textContent = account ? account.slice(0,6)+'...'+account.slice(-4) : 'Not connected';
}

function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

function showAnswer(answer) {
  const el = document.getElementById('answer');
  if (el) el.textContent = answer;
}

function disableAskButton(state) {
  const btn = document.getElementById('askBtn');
  if (btn) btn.disabled = state;
}

function showSwitchNetworkButton() {
  const btn = document.getElementById('switchNetworkBtn');
  if (btn) btn.style.display = 'block';
}

// ---------- EVENTS ----------
document.getElementById('connectBtn')?.addEventListener('click', connectWallet);

document.getElementById('switchNetworkBtn')?.addEventListener('click', async () => {
  try {
    await switchNetwork();
    setStatus('Network switched');
  } catch (e) {
    setStatus('Switch failed');
  }
});

document.getElementById('askForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('question');
  const question = input.value.trim();
  await askQuestion(question);
});
