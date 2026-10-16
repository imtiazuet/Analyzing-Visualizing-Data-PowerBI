const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePakistanNumber,
  lookupPakistanRate,
  calculateCallCostPence
} = require('../server/pakistanRates');
const { createApp } = require('../server/index');
const { resetState } = require('../server/store');

describe('Pakistan Sub-5p VoIP Rate Engine & API Tests', () => {
  let server;
  let baseUrl;

  before(async () => {
    resetState();
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('normalizes diverse Pakistani number formats (0300, 0092, +92, 042 landline)', () => {
    const jazzLocal = normalizePakistanNumber('0300 8452310');
    assert.equal(jazzLocal.valid, true);
    assert.equal(jazzLocal.e164, '+923008452310');

    const zongIntl = normalizePakistanNumber('0092-312-5548901');
    assert.equal(zongIntl.valid, true);
    assert.equal(zongIntl.e164, '+923125548901');

    const lahoreLandline = normalizePakistanNumber('042 35761890');
    assert.equal(lahoreLandline.valid, true);
    assert.equal(lahoreLandline.e164, '+924235761890');
  });

  test('identifies Pakistani mobile & landline networks and verifies sub-5p/min rates', () => {
    const jazzQuote = lookupPakistanRate('+923008452310', 'localphone-wholesale-sip');
    assert.equal(jazzQuote.destination.network, 'Jazz (Mobilink)');
    assert.ok(jazzQuote.selectedProvider.ratePence < 5.0, 'Jazz mobile rate should be under 5p/min');
    assert.equal(jazzQuote.selectedProvider.ratePence, 2.8);

    const lahoreQuote = lookupPakistanRate('+924235761890', 'localphone-wholesale-sip');
    assert.equal(lahoreQuote.destination.city, 'Lahore');
    assert.ok(lahoreQuote.selectedProvider.ratePence < 5.0, 'Lahore landline rate should be under 5p/min');
    assert.equal(lahoreQuote.selectedProvider.ratePence, 1.9);

    // Every configured wholesale trunk should beat 5p/min
    for (const p of jazzQuote.allProviders) {
      assert.ok(p.ratePence < 5.0, `Provider ${p.providerName} rate ${p.ratePence}p must be < 5p`);
    }
  });

  test('calculates per-second (1/1), 6/6, and 60/60 call billing in pence accurately', () => {
    // 30-second call on 1/1 per-second billing at 2.4p/min -> 1.2p
    const perSecCost = calculateCallCostPence(30, 2.4, '1/1');
    assert.equal(perSecCost, 1.2);

    // 45-second call on 60/60 per-minute billing at 2.8p/min -> 2.8p
    const perMinCost = calculateCallCostPence(45, 2.8, '60/60');
    assert.equal(perMinCost, 2.8);
  });

  test('GET /api/state and /api/rates/lookup return valid sub-5p data', async () => {
    const stateRes = await fetch(`${baseUrl}/api/state`);
    assert.equal(stateRes.status, 200);
    const stateData = await stateRes.json();
    assert.ok(stateData.contacts.length >= 5);
    assert.ok(stateData.providers.length >= 4);

    const rateRes = await fetch(`${baseUrl}/api/rates/lookup?number=03125548901`);
    assert.equal(rateRes.status, 200);
    const rateData = await rateRes.json();
    assert.equal(rateData.destination.network, 'Zong 4G');
    assert.equal(rateData.selectedProvider.underFivePence, true);
  });

  test('POST /api/contacts assigns a Localphone-style UK 0203 Local Access Number', async () => {
    const res = await fetch(`${baseUrl}/api/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sister Hina (Karachi)',
        pakistanNumber: '021 34567890',
        city: 'Karachi'
      })
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.contact.pakistanNumber, '+922134567890');
    assert.match(data.contact.ukLocalNumber, /^\+44203807\d{4}$/);
    assert.ok(data.contact.ratePence < 5.0);
  });

  test('GET /api/webhooks/uk-access-did generates SIP bridge TwiML/TeXML for UK 0203 number', async () => {
    const res = await fetch(
      `${baseUrl}/api/webhooks/uk-access-did?To=%2B442038079201&From=%2B447700900456`
    );
    assert.equal(res.status, 200);
    const xml = await res.text();
    assert.ok(xml.includes('<Dial callerId="+447700900456"'));
    assert.ok(xml.includes('sip:+924235761890@'));
  });

  test('POST /api/calls/callback initiates 2-leg callback under 5p/min combined', async () => {
    const res = await fetch(`${baseUrl}/api/calls/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ukNumber: '+447700900456',
        pakistanNumber: '+924235761890'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.underFivePence, true);
    assert.ok(data.combinedRatePence < 5.0);
  });
});
