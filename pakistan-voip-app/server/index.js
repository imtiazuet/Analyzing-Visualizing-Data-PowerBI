const express = require('express');
const cors = require('cors');
const path = require('path');
const {
  VOIP_TRUNK_PROVIDERS,
  PAKISTAN_MOBILE_PREFIXES,
  PAKISTAN_CITY_CODES,
  normalizePakistanNumber,
  lookupPakistanRate,
  calculateCallCostPence
} = require('./pakistanRates');
const { loadState, saveState, resetState } = require('./store');

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve frontend static assets
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));

  // Health & app metadata
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'PakCall Sub-5p VoIP Engine',
      subFivePenceGuarantee: true
    });
  });

  // Get full application state (account balance, contacts, local numbers, call history, providers)
  app.get('/api/state', (_req, res) => {
    const state = loadState();
    res.json({
      account: state.account,
      contacts: state.contacts,
      callHistory: state.callHistory,
      providers: VOIP_TRUNK_PROVIDERS,
      cityCodes: PAKISTAN_CITY_CODES,
      mobilePrefixes: PAKISTAN_MOBILE_PREFIXES
    });
  });

  // Live rate lookup for any Pakistan number (+92, 0092, 03xx, 042, etc.)
  app.get('/api/rates/lookup', (req, res) => {
    const state = loadState();
    const number = req.query.number || '+92300';
    const providerId = req.query.providerId || state.account.activeProviderId;
    const result = lookupPakistanRate(String(number), String(providerId));
    res.json(result);
  });

  // Update active SIP/VoIP trunk provider or SIP credentials
  app.post('/api/account/config', (req, res) => {
    const state = loadState();
    const { activeProviderId, ukCallerId, sipConfig, topUpPence } = req.body || {};

    if (activeProviderId && VOIP_TRUNK_PROVIDERS.some((p) => p.id === activeProviderId)) {
      state.account.activeProviderId = activeProviderId;
    }
    if (typeof ukCallerId === 'string' && ukCallerId.trim()) {
      state.account.ukCallerId = ukCallerId.trim();
    }
    if (sipConfig && typeof sipConfig === 'object') {
      state.account.sipConfig = {
        ...state.account.sipConfig,
        ...sipConfig
      };
    }
    if (typeof topUpPence === 'number' && topUpPence > 0) {
      state.account.balancePence = Number((state.account.balancePence + topUpPence).toFixed(2));
    }

    // Recompute contact rates for new active provider
    state.contacts = state.contacts.map((c) => {
      const rateInfo = lookupPakistanRate(c.pakistanNumber, state.account.activeProviderId);
      return {
        ...c,
        ratePence: rateInfo.selectedProvider.ratePence,
        network: rateInfo.destination.network
      };
    });

    saveState(state);
    res.json({ ok: true, account: state.account, contacts: state.contacts });
  });

  // Generate Localphone-style UK 0203 Local Access Number for a Pakistani contact
  app.post('/api/contacts', (req, res) => {
    const state = loadState();
    const { name, pakistanNumber, city, favorite } = req.body || {};

    const norm = normalizePakistanNumber(pakistanNumber);
    if (!norm.valid) {
      return res.status(400).json({
        error: 'Please enter a valid Pakistan number (e.g., +92 300 1234567 or 042 35761890)'
      });
    }

    const rateInfo = lookupPakistanRate(norm.e164, state.account.activeProviderId);

    // Assign next sequential UK 0203 Local Number and 3-digit Speed Dial PIN
    const nextIdx = state.contacts.length + 1;
    const suffix = String(9200 + nextIdx).padStart(4, '0');
    const ukLocalNumber = `+44203807${suffix}`;
    const speedDialPin = String(100 + nextIdx);

    const newContact = {
      id: `c-${Date.now()}`,
      name: (name || 'Pakistan Contact').trim(),
      pakistanNumber: norm.e164,
      city: (city || rateInfo.destination.city || 'Pakistan').trim(),
      network: rateInfo.destination.network,
      ratePence: rateInfo.selectedProvider.ratePence,
      ukLocalNumber,
      speedDialPin,
      favorite: Boolean(favorite)
    };

    state.contacts.unshift(newContact);
    saveState(state);
    res.status(201).json({ ok: true, contact: newContact, rateInfo });
  });

  // Delete contact / Local Number mapping
  app.delete('/api/contacts/:id', (req, res) => {
    const state = loadState();
    const before = state.contacts.length;
    state.contacts = state.contacts.filter((c) => c.id !== req.params.id);
    if (state.contacts.length === before) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    saveState(state);
    res.json({ ok: true, contacts: state.contacts });
  });

  // Record a completed call (WebRTC Direct, UK Local Access Number, or 2-Leg Callback)
  app.post('/api/calls/log', (req, res) => {
    const state = loadState();
    const { destinationNumber, durationSeconds, mode, contactName } = req.body || {};

    const rateInfo = lookupPakistanRate(destinationNumber, state.account.activeProviderId);
    if (!rateInfo.e164) {
      return res.status(400).json({ error: 'Invalid destination number' });
    }

    const dur = Math.max(1, Number(durationSeconds) || 0);
    const provider = rateInfo.selectedProvider;
    const costPence = calculateCallCostPence(dur, provider.ratePence, provider.billingIncrement);

    state.account.balancePence = Math.max(
      0,
      Number((state.account.balancePence - costPence).toFixed(2))
    );

    const existingContact = state.contacts.find((c) => c.pakistanNumber === rateInfo.e164);

    const entry = {
      id: `call-${Date.now()}`,
      contactName: contactName || (existingContact ? existingContact.name : rateInfo.formattedNumber),
      destinationE164: rateInfo.e164,
      network: rateInfo.destination.network,
      mode: mode || 'WebRTC Direct Dial',
      providerName: provider.providerName,
      durationSeconds: dur,
      ratePencePerMin: provider.ratePence,
      totalCostPence: costPence,
      timestamp: new Date().toISOString(),
      status: 'completed'
    };

    state.callHistory.unshift(entry);
    saveState(state);

    res.status(201).json({
      ok: true,
      call: entry,
      newBalancePence: state.account.balancePence
    });
  });

  // Trigger a 2-Leg Callback (Rings UK phone first, then bridges to Pakistan at sub-5p rate)
  app.post('/api/calls/callback', (req, res) => {
    const state = loadState();
    const { ukNumber, pakistanNumber } = req.body || {};

    const ukNorm = normalizePakistanNumber(ukNumber || state.account.ukCallerId);
    const pkRate = lookupPakistanRate(pakistanNumber, state.account.activeProviderId);

    if (!pkRate.valid) {
      return res.status(400).json({ error: 'Valid Pakistan destination number (+92...) is required' });
    }

    const ukLegRatePence = 0.8; // Wholesale UK mobile/landline leg (~0.8p/min)
    const pkLegRatePence = pkRate.selectedProvider.ratePence;
    const combinedRatePence = Number((ukLegRatePence + pkLegRatePence).toFixed(2));

    res.json({
      ok: true,
      callbackSessionId: `cb-${Date.now()}`,
      legA: {
        ukNumber: ukNorm.e164 || state.account.ukCallerId,
        ratePencePerMin: ukLegRatePence,
        status: 'ringing_uk_handset'
      },
      legB: {
        pakistanNumber: pkRate.e164,
        formattedNumber: pkRate.formattedNumber,
        network: pkRate.destination.network,
        ratePencePerMin: pkLegRatePence,
        status: 'awaiting_leg_a_answer'
      },
      combinedRatePence,
      underFivePence: combinedRatePence < 5.0,
      provider: pkRate.selectedProvider.providerName
    });
  });

  /**
   * Programmable SIP / TeXML / TwiML Webhook for UK 0203 Local Access Numbers.
   * This is the exact mechanism Localphone used for "Local Numbers":
   * When you call your dedicated UK 0203 number from your mobile's free inclusive minutes,
   * the SIP/CPaaS switch looks up your Caller ID (+447...) and the dialled 0203 DID,
   * and immediately bridges the call over the sub-5p wholesale SIP trunk to Pakistan.
   */
  app.all('/api/webhooks/uk-access-did', (req, res) => {
    const state = loadState();
    const calledDid = (req.body.To || req.query.To || '').trim();
    const callerCli = (req.body.From || req.query.From || state.account.ukCallerId).trim();
    const dtmfDigits = (req.body.Digits || req.query.Digits || '').trim();

    // Check if the dialled UK 0203 number maps directly to a dedicated Pakistani contact
    const matchedContact = state.contacts.find(
      (c) => c.ukLocalNumber.replace(/\D/g, '') === calledDid.replace(/\D/g, '')
    );

    // Or check if user entered a 3-digit speed dial PIN on the gateway number
    const pinContact = dtmfDigits
      ? state.contacts.find((c) => c.speedDialPin === dtmfDigits)
      : null;

    const targetContact = matchedContact || pinContact;
    const sipDomain = state.account.sipConfig.sipServer || 'sip.cheapvoip.com';

    res.set('Content-Type', 'application/xml');

    if (targetContact) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Connecting to ${escapeXml(targetContact.name)} in ${escapeXml(targetContact.city)}. Rate ${targetContact.ratePence} pence per minute.</Say>
  <Dial callerId="${escapeXml(callerCli)}" timeout="30">
    <Sip>sip:${escapeXml(targetContact.pakistanNumber)}@${escapeXml(sipDomain)}</Sip>
  </Dial>
</Response>`;
      return res.send(xml);
    }

    // Otherwise prompt for 3-digit speed-dial PIN or full 0092 number
    const gatherXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="3" action="/api/webhooks/uk-access-did" method="POST" timeout="8">
    <Say voice="Polly.Amy">Welcome to PakCall UK Local Access. Enter your 3 digit Pakistan speed dial PIN.</Say>
  </Gather>
</Response>`;
    return res.send(gatherXml);
  });

  // Reset demo data if desired
  app.post('/api/state/reset', (_req, res) => {
    const fresh = resetState();
    res.json({ ok: true, state: fresh });
  });

  return app;
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`PakCall Sub-5p VoIP Server listening on http://localhost:${PORT}`);
  });
}

module.exports = { createApp };
