/* PakCall Direct — Frontend WebRTC / SIP & Sub-5p Rate Controller */

const state = {
  account: null,
  contacts: [],
  callHistory: [],
  providers: [],
  currentRateLookup: null,
  activeCall: {
    inProgress: false,
    mode: 'WebRTC Direct Dial',
    contactName: '',
    seconds: 0,
    timerId: null,
    muted: false,
    speaker: false
  }
};

// Web Audio API DTMF Tone Synthesizer
const DTMF_FREQS = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477]
};

let audioCtx = null;
function playDtmf(digit) {
  try {
    const pair = DTMF_FREQS[digit];
    if (!pair) return;
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const now = audioCtx.currentTime;
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc1.frequency.value = pair[0];
    osc2.frequency.value = pair[1];
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioCtx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.14);
    osc2.stop(now + 0.14);
  } catch (_e) {
    // Ignore audio context restrictions in headless environments
  }
}

function formatPounds(pence) {
  const pounds = (Number(pence) || 0) / 100;
  return `£${pounds.toFixed(2)}`;
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function fetchInitialState() {
  const res = await fetch('/api/state');
  const data = await res.json();
  state.account = data.account;
  state.contacts = data.contacts;
  state.callHistory = data.callHistory;
  state.providers = data.providers;

  renderHeader();
  renderContacts();
  renderCallHistory();
  renderLocalNumbersTab();
  renderProvidersAndCalculator();
  renderSipSetupForm();

  const dialInput = document.getElementById('dial-input');
  await updateLiveRateLookup(dialInput.value);
}

function renderHeader() {
  if (!state.account) return;
  document.getElementById('header-balance').textContent = formatPounds(state.account.balancePence);

  const activeProvider =
    state.providers.find((p) => p.id === state.account.activeProviderId) || state.providers[0];

  if (activeProvider) {
    document.getElementById('header-active-provider').textContent = activeProvider.name;
    const minRate = activeProvider.ratesPence.landline;
    const maxMob = activeProvider.ratesPence.mobile_telenor;
    document.getElementById('header-active-rate').textContent = `${minRate}p – ${maxMob}p / min`;
  }
}

async function updateLiveRateLookup(rawNumber) {
  const res = await fetch(
    `/api/rates/lookup?number=${encodeURIComponent(rawNumber)}&providerId=${encodeURIComponent(
      state.account?.activeProviderId || 'localphone-wholesale-sip'
    )}`
  );
  const info = await res.json();
  state.currentRateLookup = info;

  document.getElementById('detected-network').textContent = info.destination.network;
  document.getElementById('detected-city').textContent = `${info.destination.city} (${info.destination.province})`;
  document.getElementById('detected-rate-pence').textContent = `${info.selectedProvider.ratePence}p`;
  document.getElementById('btn-rate-text').textContent = `${info.selectedProvider.ratePence}p/min`;

  const badge = document.getElementById('under-5p-badge');
  if (info.selectedProvider.underFivePence) {
    badge.textContent = '< 5p Verified';
  } else {
    badge.textContent = `${info.selectedProvider.ratePence}p/min`;
  }
}

function renderContacts() {
  const container = document.getElementById('contacts-list');
  container.innerHTML = '';

  state.contacts.forEach((contact) => {
    const card = document.createElement('div');
    card.className = 'contact-card';
    card.innerHTML = `
      <div class="contact-top">
        <div>
          <div class="contact-name">${escapeHtml(contact.name)}</div>
          <div class="contact-city">${escapeHtml(contact.city)} &bull; ${escapeHtml(contact.network)}</div>
        </div>
        <span class="contact-rate-badge">${contact.ratePence}p/min</span>
      </div>
      <div class="contact-numbers">
        <div><span>PK Number:</span> <strong>${escapeHtml(contact.pakistanNumber)}</strong></div>
        <div><span>UK 0203 Local:</span> <strong style="color: var(--pk-green-bright)">${escapeHtml(contact.ukLocalNumber)}</strong></div>
        <div><span>Speed-Dial PIN:</span> <strong>#${escapeHtml(contact.speedDialPin)}</strong></div>
      </div>
      <div class="contact-actions">
        <button class="btn-primary btn-dial-contact" data-number="${escapeHtml(contact.pakistanNumber)}" data-name="${escapeHtml(contact.name)}" data-mode="WebRTC Direct Dial">
          &#9742; Call (${contact.ratePence}p)
        </button>
        <button class="btn-secondary btn-dial-local" data-number="${escapeHtml(contact.pakistanNumber)}" data-name="${escapeHtml(contact.name)}" data-mode="UK Local Number (0203)">
          Dial UK 0203
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll('.btn-dial-contact, .btn-dial-local').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const number = btn.getAttribute('data-number');
      const name = btn.getAttribute('data-name');
      const mode = btn.getAttribute('data-mode');
      const dialInput = document.getElementById('dial-input');
      dialInput.value = number;
      await updateLiveRateLookup(number);
      startSimulatedCall(number, name, mode);
    });
  });
}

function renderCallHistory() {
  const tbody = document.getElementById('call-history-body');
  tbody.innerHTML = '';

  state.callHistory.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(item.contactName)}</strong><br/>
        <small style="color: var(--text-muted)">${escapeHtml(item.destinationE164)}</small>
      </td>
      <td>${escapeHtml(item.network)}</td>
      <td><span class="flag-chip">${escapeHtml(item.mode)}</span></td>
      <td>${formatDuration(item.durationSeconds)}</td>
      <td><strong style="color: var(--pk-green-bright)">${item.ratePencePerMin}p/min</strong></td>
      <td><strong>${item.totalCostPence}p</strong> <small style="color: var(--text-muted)">(${formatPounds(item.totalCostPence)})</small></td>
      <td>
        <button class="btn-xs btn-redial" data-number="${escapeHtml(item.destinationE164)}" data-name="${escapeHtml(item.contactName)}">Redial</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-redial').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const num = btn.getAttribute('data-number');
      const name = btn.getAttribute('data-name');
      document.getElementById('dial-input').value = num;
      await updateLiveRateLookup(num);
      startSimulatedCall(num, name, 'WebRTC Direct Dial');
    });
  });
}

function renderLocalNumbersTab() {
  const cliEl = document.getElementById('local-cli-display');
  if (cliEl && state.account) {
    cliEl.textContent = state.account.ukCallerId;
  }

  const grid = document.getElementById('local-numbers-grid');
  const selectDid = document.getElementById('select-test-did');
  grid.innerHTML = '';
  selectDid.innerHTML = '';

  state.contacts.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'local-did-card';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>${escapeHtml(c.name)}</strong>
        <span class="contact-rate-badge">${c.ratePence}p/min</span>
      </div>
      <div class="did-highlight">🇬🇧 ${escapeHtml(c.ukLocalNumber)}</div>
      <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:10px;">
        Routes directly to 🇵🇰 <strong>${escapeHtml(c.pakistanNumber)}</strong> (${escapeHtml(c.network)})
      </div>
      <button class="btn-secondary btn-test-local-call" data-number="${escapeHtml(c.pakistanNumber)}" data-name="${escapeHtml(c.name)}">
        Test UK 0203 Bridge Call
      </button>
    `;
    grid.appendChild(card);

    const opt = document.createElement('option');
    opt.value = c.ukLocalNumber;
    opt.textContent = `${c.ukLocalNumber} → ${c.name} (${c.pakistanNumber})`;
    selectDid.appendChild(opt);
  });

  grid.querySelectorAll('.btn-test-local-call').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const num = btn.getAttribute('data-number');
      const name = btn.getAttribute('data-name');
      document.getElementById('dial-input').value = num;
      await updateLiveRateLookup(num);
      startSimulatedCall(num, name, 'UK Local Number (0203)');
    });
  });

  if (state.contacts.length > 0) {
    triggerWebhookPreview(state.contacts[0].ukLocalNumber);
  }
}

async function triggerWebhookPreview(ukDid) {
  const fromCli = state.account?.ukCallerId || '+447700900456';
  const res = await fetch(
    `/api/webhooks/uk-access-did?To=${encodeURIComponent(ukDid)}&From=${encodeURIComponent(fromCli)}`
  );
  const xmlText = await res.text();
  document.getElementById('webhook-xml-output').textContent = xmlText;
}

function renderProvidersAndCalculator() {
  const container = document.getElementById('provider-comparison-cards');
  container.innerHTML = '';

  state.providers.forEach((p) => {
    const isSelected = state.account?.activeProviderId === p.id;
    const card = document.createElement('div');
    card.className = `provider-card ${isSelected ? 'selected' : ''}`;
    card.innerHTML = `
      <div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">
          <strong>${escapeHtml(p.name)}</strong>
          <span class="contact-rate-badge">${escapeHtml(p.badge)}</span>
        </div>
        <div style="font-size:0.76rem;color:var(--text-muted);margin-bottom:8px;">
          ${escapeHtml(p.protocol)} &bull; Increment: ${escapeHtml(p.billingIncrement)}
        </div>
        <div class="provider-rates-list">
          <div><span>PK Landline (Lahore/Karachi):</span> <strong>${p.ratesPence.landline}p/min</strong></div>
          <div><span>Jazz / Warid Mobile:</span> <strong>${p.ratesPence.mobile_jazz}p/min</strong></div>
          <div><span>Zong 4G Mobile:</span> <strong>${p.ratesPence.mobile_zong}p/min</strong></div>
          <div><span>Ufone 4G Mobile:</span> <strong>${p.ratesPence.mobile_ufone}p/min</strong></div>
          <div><span>Telenor PK Mobile:</span> <strong>${p.ratesPence.mobile_telenor}p/min</strong></div>
        </div>
      </div>
      <button class="${isSelected ? 'btn-primary' : 'btn-secondary'} btn-select-provider" data-id="${escapeHtml(p.id)}">
        ${isSelected ? '✓ Active Routing Trunk' : 'Use This Trunk'}
      </button>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll('.btn-select-provider').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const providerId = btn.getAttribute('data-id');
      await fetch('/api/account/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeProviderId: providerId })
      });
      await fetchInitialState();
    });
  });

  updateSavingsCalculator();
}

function updateSavingsCalculator() {
  const slider = document.getElementById('calc-minutes');
  const mins = Number(slider.value) || 250;
  document.getElementById('calc-minutes-label').textContent = `${mins} mins`;

  const activeProvider =
    state.providers.find((p) => p.id === state.account?.activeProviderId) || state.providers[0];
  if (!activeProvider) return;

  const landlineTotalPence = mins * activeProvider.ratesPence.landline;
  const mobileTotalPence = mins * activeProvider.ratesPence.mobile_jazz;
  const ukStandardPence = mins * 155; // £1.55/min standard UK mobile international rate

  const resultsGrid = document.getElementById('calc-results-grid');
  resultsGrid.innerHTML = `
    <div class="calc-tile">
      <small style="color:var(--text-muted)">PakCall Landline (${activeProvider.ratesPence.landline}p/m)</small>
      <strong style="color:var(--pk-green-bright)">${formatPounds(landlineTotalPence)} / mo</strong>
    </div>
    <div class="calc-tile">
      <small style="color:var(--text-muted)">PakCall Mobile (${activeProvider.ratesPence.mobile_jazz}p/m)</small>
      <strong style="color:var(--pk-green-bright)">${formatPounds(mobileTotalPence)} / mo</strong>
    </div>
    <div class="calc-tile">
      <small style="color:var(--text-muted)">Standard UK Carrier (£1.55/m)</small>
      <strong style="color:#f87171">${formatPounds(ukStandardPence)} / mo</strong>
    </div>
    <div class="calc-tile">
      <small style="color:var(--text-muted)">Your Monthly Savings</small>
      <strong style="color:#fbbf24">${formatPounds(ukStandardPence - mobileTotalPence)} saved</strong>
    </div>
  `;
}

function renderSipSetupForm() {
  if (!state.account) return;
  const sel = document.getElementById('cfg-provider');
  sel.innerHTML = '';
  state.providers.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} (${p.ratesPence.landline}p–${p.ratesPence.mobile_telenor}p/min)`;
    if (p.id === state.account.activeProviderId) opt.selected = true;
    sel.appendChild(opt);
  });

  document.getElementById('cfg-caller-id').value = state.account.ukCallerId || '+447700900456';
  document.getElementById('cfg-sip-server').value = state.account.sipConfig?.sipServer || 'sip.cheapvoip.com';
  document.getElementById('cfg-wss-url').value = state.account.sipConfig?.wssUrl || 'wss://london.voip.ms:443';
  document.getElementById('cfg-sip-user').value = state.account.sipConfig?.sipUsername || 'imtiaz_uk_pk';
  document.getElementById('cfg-uk-did').value = state.account.sipConfig?.ukAccessGatewayDid || '+442038079200';

  const activeProvider =
    state.providers.find((p) => p.id === state.account.activeProviderId) || state.providers[0];
  const stepsBox = document.getElementById('provider-setup-steps');
  if (activeProvider) {
    stepsBox.innerHTML = `
      <h3>Quick Production Checklist for ${escapeHtml(activeProvider.name)}</h3>
      <ol>
        ${activeProvider.setupSteps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
      </ol>
    `;
  }
}

function startSimulatedCall(destinationNumber, contactName, mode = 'WebRTC Direct Dial') {
  if (state.activeCall.inProgress) return;

  state.activeCall.inProgress = true;
  state.activeCall.mode = mode;
  state.activeCall.contactName = contactName || destinationNumber;
  state.activeCall.seconds = 0;

  const panel = document.getElementById('active-call-panel');
  panel.classList.remove('hidden');

  const ratePence = state.currentRateLookup?.selectedProvider?.ratePence || 2.8;
  document.getElementById('call-status-text').textContent = `Connected via ${mode} (${ratePence}p/min)`;
  document.getElementById('call-callee-display').textContent =
    contactName && contactName !== destinationNumber
      ? `${contactName} (${destinationNumber})`
      : destinationNumber;

  document.getElementById('call-timer').textContent = '00:00';
  document.getElementById('call-live-cost').textContent = '0.00p';

  state.activeCall.timerId = setInterval(() => {
    state.activeCall.seconds += 1;
    const sec = state.activeCall.seconds;
    document.getElementById('call-timer').textContent = formatDuration(sec);
    const liveCost = ((sec / 60) * ratePence).toFixed(2);
    document.getElementById('call-live-cost').textContent = `${liveCost}p`;
  }, 1000);
}

async function endActiveCall() {
  if (!state.activeCall.inProgress) return;
  clearInterval(state.activeCall.timerId);

  const durationSeconds = Math.max(12, state.activeCall.seconds);
  const destinationNumber = document.getElementById('dial-input').value;
  const mode = state.activeCall.mode;
  const contactName = state.activeCall.contactName;

  state.activeCall.inProgress = false;
  document.getElementById('active-call-panel').classList.add('hidden');

  await fetch('/api/calls/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      destinationNumber,
      durationSeconds,
      mode,
      contactName
    })
  });

  await fetchInitialState();
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Wire up DOM Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  fetchInitialState();

  // Navigation Tabs
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = `tab-${tab.getAttribute('data-tab')}`;
      document.getElementById(targetId)?.classList.add('active');
    });
  });

  // Dial input live lookup
  const dialInput = document.getElementById('dial-input');
  dialInput.addEventListener('input', (e) => {
    updateLiveRateLookup(e.target.value);
  });

  // Backspace button
  document.getElementById('btn-backspace').addEventListener('click', () => {
    dialInput.value = dialInput.value.slice(0, -1);
    updateLiveRateLookup(dialInput.value);
  });

  // Keypad buttons
  document.querySelectorAll('.key-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const digit = btn.getAttribute('data-digit');
      playDtmf(digit);
      dialInput.value += digit;
      updateLiveRateLookup(dialInput.value);
    });
  });

  // Quick prefix chips
  document.querySelectorAll('.chip-prefix').forEach((chip) => {
    chip.addEventListener('click', () => {
      const num = chip.getAttribute('data-prefix');
      dialInput.value = num;
      updateLiveRateLookup(num);
    });
  });

  // Call & Hangup buttons
  document.getElementById('btn-call-webrtc').addEventListener('click', () => {
    startSimulatedCall(dialInput.value, '', 'WebRTC Direct Dial');
  });

  document.getElementById('btn-hangup').addEventListener('click', () => {
    endActiveCall();
  });

  document.getElementById('btn-mute').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('active');
    e.currentTarget.textContent = e.currentTarget.classList.contains('active') ? 'Muted' : 'Mute';
  });

  document.getElementById('btn-speaker').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('active');
    e.currentTarget.textContent = e.currentTarget.classList.contains('active') ? 'Speaker On' : 'Speaker';
  });

  // Top-up +£5 button
  document.getElementById('btn-topup').addEventListener('click', async () => {
    await fetch('/api/account/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topUpPence: 500 })
    });
    await fetchInitialState();
  });

  // Add Contact form toggle & submission
  const addContactForm = document.getElementById('form-add-contact');
  document.getElementById('btn-open-add-contact').addEventListener('click', () => {
    addContactForm.classList.toggle('hidden');
  });
  document.getElementById('btn-cancel-contact').addEventListener('click', () => {
    addContactForm.classList.add('hidden');
  });

  addContactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('contact-name').value;
    const pakistanNumber = document.getElementById('contact-number').value;
    const city = document.getElementById('contact-city').value;

    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pakistanNumber, city, favorite: true })
    });

    if (res.ok) {
      addContactForm.reset();
      addContactForm.classList.add('hidden');
      await fetchInitialState();
    }
  });

  // Webhook Tester in Local Numbers Tab
  document.getElementById('btn-test-webhook').addEventListener('click', () => {
    const did = document.getElementById('select-test-did').value;
    triggerWebhookPreview(did);
  });

  // Callback Tab live rate & trigger
  const cbPkInput = document.getElementById('cb-pk-number');
  cbPkInput.addEventListener('input', async () => {
    const res = await fetch(`/api/rates/lookup?number=${encodeURIComponent(cbPkInput.value)}`);
    const info = await res.json();
    const pkRate = info.selectedProvider.ratePence;
    const combined = (0.8 + pkRate).toFixed(1);
    document.getElementById('cb-pk-rate-preview').innerHTML = `${escapeHtml(info.destination.network)}: <strong>${pkRate}p / min</strong>`;
    document.getElementById('cb-combined-rate').textContent = `${combined}p / min`;
  });

  document.getElementById('form-callback').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ukNumber = document.getElementById('cb-uk-number').value;
    const pakistanNumber = document.getElementById('cb-pk-number').value;

    const res = await fetch('/api/calls/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ukNumber, pakistanNumber })
    });
    const data = await res.json();
    const box = document.getElementById('callback-result-box');
    box.classList.remove('hidden');
    if (data.ok) {
      box.innerHTML = `
        <strong>✓ Callback Initiated (${escapeHtml(data.callbackSessionId)})</strong><br/>
        1. Calling your UK handset <code>${escapeHtml(data.legA.ukNumber)}</code> at <strong>${data.legA.ratePencePerMin}p/min</strong>...<br/>
        2. Bridging to Pakistan <code>${escapeHtml(data.legB.pakistanNumber)}</code> (${escapeHtml(data.legB.network)}) at <strong>${data.legB.ratePencePerMin}p/min</strong>.<br/>
        <strong>Total Combined Rate: ${data.combinedRatePence}p / min (Under 5p Guarantee!)</strong>
      `;
    } else {
      box.textContent = data.error || 'Could not initiate callback.';
    }
  });

  // Calculator slider
  document.getElementById('calc-minutes').addEventListener('input', () => {
    updateSavingsCalculator();
  });

  // SIP Config form save
  document.getElementById('form-sip-config').addEventListener('submit', async (e) => {
    e.preventDefault();
    const activeProviderId = document.getElementById('cfg-provider').value;
    const ukCallerId = document.getElementById('cfg-caller-id').value;
    const sipConfig = {
      sipServer: document.getElementById('cfg-sip-server').value,
      wssUrl: document.getElementById('cfg-wss-url').value,
      sipUsername: document.getElementById('cfg-sip-user').value,
      ukAccessGatewayDid: document.getElementById('cfg-uk-did').value
    };

    await fetch('/api/account/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeProviderId, ukCallerId, sipConfig })
    });

    await fetchInitialState();
    const toast = document.getElementById('cfg-save-toast');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
  });
});
