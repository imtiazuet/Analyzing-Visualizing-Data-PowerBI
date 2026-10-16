/**
 * Pakistan Telecom Prefix & Wholesale SIP Rate Engine
 *
 * Converts GBP/USD wholesale rates into UK pence per minute (p/min)
 * and identifies exact Pakistani mobile & landline networks (Jazz, Zong,
 * Telenor, Ufone, SCOM, PTCL, Nayatel) to guarantee sub-5p/min routing.
 */

const GBP_PER_USD = 0.785; // 1 USD ≈ £0.785 (78.5p)

const PAKISTAN_MOBILE_PREFIXES = {
  // Jazz / Warid (Mobilink) - 0300 to 0309, 0320 to 0329
  '300': { network: 'Jazz (Mobilink)', type: 'mobile', tier: 'tier1' },
  '301': { network: 'Jazz (Mobilink)', type: 'mobile', tier: 'tier1' },
  '302': { network: 'Jazz (Mobilink)', type: 'mobile', tier: 'tier1' },
  '303': { network: 'Jazz (Mobilink)', type: 'mobile', tier: 'tier1' },
  '304': { network: 'Jazz (Mobilink)', type: 'mobile', tier: 'tier1' },
  '305': { network: 'Jazz (Mobilink)', type: 'mobile', tier: 'tier1' },
  '306': { network: 'Jazz (Mobilink)', type: 'mobile', tier: 'tier1' },
  '307': { network: 'Jazz (Mobilink)', type: 'mobile', tier: 'tier1' },
  '308': { network: 'Jazz (Mobilink)', type: 'mobile', tier: 'tier1' },
  '309': { network: 'Jazz (Mobilink)', type: 'mobile', tier: 'tier1' },
  '320': { network: 'Jazz (Warid)', type: 'mobile', tier: 'tier1' },
  '321': { network: 'Jazz (Warid)', type: 'mobile', tier: 'tier1' },
  '322': { network: 'Jazz (Warid)', type: 'mobile', tier: 'tier1' },
  '323': { network: 'Jazz (Warid)', type: 'mobile', tier: 'tier1' },
  '324': { network: 'Jazz (Warid)', type: 'mobile', tier: 'tier1' },
  '325': { network: 'Jazz (Warid)', type: 'mobile', tier: 'tier1' },
  // Zong (CMPak) - 0310 to 0319
  '310': { network: 'Zong 4G', type: 'mobile', tier: 'tier1' },
  '311': { network: 'Zong 4G', type: 'mobile', tier: 'tier1' },
  '312': { network: 'Zong 4G', type: 'mobile', tier: 'tier1' },
  '313': { network: 'Zong 4G', type: 'mobile', tier: 'tier1' },
  '314': { network: 'Zong 4G', type: 'mobile', tier: 'tier1' },
  '315': { network: 'Zong 4G', type: 'mobile', tier: 'tier1' },
  '316': { network: 'Zong 4G', type: 'mobile', tier: 'tier1' },
  '317': { network: 'Zong 4G', type: 'mobile', tier: 'tier1' },
  '318': { network: 'Zong 4G', type: 'mobile', tier: 'tier1' },
  '319': { network: 'Zong 4G', type: 'mobile', tier: 'tier1' },
  // Ufone (PTML) - 0330 to 0339
  '330': { network: 'Ufone 4G', type: 'mobile', tier: 'tier1' },
  '331': { network: 'Ufone 4G', type: 'mobile', tier: 'tier1' },
  '332': { network: 'Ufone 4G', type: 'mobile', tier: 'tier1' },
  '333': { network: 'Ufone 4G', type: 'mobile', tier: 'tier1' },
  '334': { network: 'Ufone 4G', type: 'mobile', tier: 'tier1' },
  '335': { network: 'Ufone 4G', type: 'mobile', tier: 'tier1' },
  '336': { network: 'Ufone 4G', type: 'mobile', tier: 'tier1' },
  '337': { network: 'Ufone 4G', type: 'mobile', tier: 'tier1' },
  // Telenor Pakistan - 0340 to 0349
  '340': { network: 'Telenor PK', type: 'mobile', tier: 'tier1' },
  '341': { network: 'Telenor PK', type: 'mobile', tier: 'tier1' },
  '342': { network: 'Telenor PK', type: 'mobile', tier: 'tier1' },
  '343': { network: 'Telenor PK', type: 'mobile', tier: 'tier1' },
  '344': { network: 'Telenor PK', type: 'mobile', tier: 'tier1' },
  '345': { network: 'Telenor PK', type: 'mobile', tier: 'tier1' },
  '346': { network: 'Telenor PK', type: 'mobile', tier: 'tier1' },
  '347': { network: 'Telenor PK', type: 'mobile', tier: 'tier1' },
  '348': { network: 'Telenor PK', type: 'mobile', tier: 'tier1' },
  '349': { network: 'Telenor PK', type: 'mobile', tier: 'tier1' },
  // SCOM (AJK & Gilgit-Baltistan) - 0355
  '355': { network: 'SCOM (AJK/GB)', type: 'mobile', tier: 'special' }
};

const PAKISTAN_CITY_CODES = {
  '21': { city: 'Karachi', province: 'Sindh', network: 'PTCL / Nayatel Landline' },
  '42': { city: 'Lahore', province: 'Punjab', network: 'PTCL / Nayatel Landline' },
  '51': { city: 'Islamabad / Rawalpindi', province: 'ICT / Punjab', network: 'PTCL / Nayatel Landline' },
  '41': { city: 'Faisalabad', province: 'Punjab', network: 'PTCL Landline' },
  '61': { city: 'Multan', province: 'Punjab', network: 'PTCL Landline' },
  '52': { city: 'Sialkot', province: 'Punjab', network: 'PTCL Landline' },
  '55': { city: 'Gujranwala', province: 'Punjab', network: 'PTCL Landline' },
  '91': { city: 'Peshawar', province: 'KPK', network: 'PTCL Landline' },
  '81': { city: 'Quetta', province: 'Balochistan', network: 'PTCL Landline' },
  '22': { city: 'Hyderabad', province: 'Sindh', network: 'PTCL Landline' },
  '53': { city: 'Gujrat / Jhelum', province: 'Punjab', network: 'PTCL Landline' },
  '5822': { city: 'Muzaffarabad', province: 'AJK', network: 'PTCL / SCOM Landline' },
  '5827': { city: 'Mirpur', province: 'AJK', network: 'PTCL / SCOM Landline' }
};

/**
 * Wholesale SIP & CPaaS Trunks supporting sub-5p/min Pakistan termination.
 * Rates are listed in UK pence per minute (p/min) along with billing increments.
 */
const VOIP_TRUNK_PROVIDERS = [
  {
    id: 'localphone-wholesale-sip',
    name: 'Dellmont / Localphone-Tier SIP (VoipBuster / CheapVoIP)',
    protocol: 'SIP / WebRTC Gateway',
    sipDomain: 'sip.cheapvoip.com',
    wssEndpoint: 'wss://webrtc.sip-gateway.example/ws',
    billingIncrement: '60/60',
    connectionFeePence: 0,
    cliGuaranteed: true,
    ratesPence: {
      landline: 1.9,
      mobile_jazz: 2.8,
      mobile_zong: 2.7,
      mobile_ufone: 2.9,
      mobile_telenor: 3.1,
      mobile_scom: 4.4,
      default_pk: 2.9
    },
    setupSteps: [
      'Register a wholesale SIP trunk account (e.g. CheapVoIP / VoipGain / Localphone SIP fallback).',
      'Copy your SIP Username, SIP Password, and Registrar (e.g. sip.cheapvoip.com).',
      'Verify your UK mobile (+447...) as outgoing Caller ID (CLI) so family in Pakistan see your UK number.'
    ],
    badge: 'Lowest Rate (< 3p/min)'
  },
  {
    id: 'voipms-premium-lcr',
    name: 'VoIP.ms International Value / Premium SIP',
    protocol: 'SIP over TLS / WSS (WebRTC)',
    sipDomain: 'london.voip.ms',
    wssEndpoint: 'wss://london.voip.ms:443',
    billingIncrement: '6/6',
    connectionFeePence: 0,
    cliGuaranteed: true,
    ratesPence: {
      landline: 2.4,
      mobile_jazz: 3.4,
      mobile_zong: 3.3,
      mobile_ufone: 3.5,
      mobile_telenor: 3.6,
      mobile_scom: 4.6,
      default_pk: 3.5
    },
    setupSteps: [
      'Create a sub-account on VoIP.ms and select the London (UK) POP server (london.voip.ms).',
      'Enable International Calls to Pakistan (+92) under Account Settings -> International Routing.',
      'Purchase a £0.85/month UK Local DID (e.g. 0203 London) to dial in without internet just like Localphone Local Numbers.'
    ],
    badge: 'Native WebRTC + UK 0203 Access'
  },
  {
    id: 'telnyx-direct-carrier',
    name: 'Telnyx Wholesale Carrier Trunk (LCR + TeXML)',
    protocol: 'WebRTC SDK + SIP Trunking + Callback API',
    sipDomain: 'sip.telnyx.com',
    wssEndpoint: 'wss://rtc.telnyx.com',
    billingIncrement: '60/60',
    connectionFeePence: 0,
    cliGuaranteed: true,
    ratesPence: {
      landline: 2.8,
      mobile_jazz: 3.8,
      mobile_zong: 3.7,
      mobile_ufone: 3.9,
      mobile_telenor: 4.1,
      mobile_scom: 4.8,
      default_pk: 3.9
    },
    setupSteps: [
      'Create a Telnyx SIP Connection with WebRTC credentials enabled.',
      'Add a UK +44 203 number (£0.80/mo) and point its TeXML Webhook URL to /api/webhooks/uk-access-did.',
      'Enter your Telnyx API Key in Provider Settings to enable 2-leg Callback and WebRTC browser calling.'
    ],
    badge: 'Programmable API + Callback'
  },
  {
    id: 'anveo-prime-direct',
    name: 'Anveo Direct Wholesale (NCLI / CLI Carrier)',
    protocol: 'SIP Wholesale LCR',
    sipDomain: 'sip.anveo.com',
    wssEndpoint: 'wss://ws.anveo.com:5061',
    billingIncrement: '1/1',
    connectionFeePence: 0,
    cliGuaranteed: true,
    ratesPence: {
      landline: 1.7,
      mobile_jazz: 2.5,
      mobile_zong: 2.4,
      mobile_ufone: 2.6,
      mobile_telenor: 2.9,
      mobile_scom: 4.2,
      default_pk: 2.6
    },
    setupSteps: [
      'Enable Outbound SIP Trunking in Anveo Direct and select CLI-guaranteed Pakistan routes.',
      'Billed per-second (1/1) so a 30-second quick check-in call to Lahore or Karachi costs just ~1.2 pence.'
    ],
    badge: 'Per-Second Billing (1/1)'
  }
];

/**
 * Normalizes any Pakistani or international phone string into E.164 (+92...)
 * Handles:
 *  - 0300 1234567 -> +923001234567
 *  - 0092 300 1234567 -> +923001234567
 *  - +92 42 35761234 -> +924235761234
 *  - 923219876543 -> +923219876543
 *  - 021 34567890 -> +922134567890
 */
function normalizePakistanNumber(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') {
    return { valid: false, raw: rawInput || '', e164: '', nationalNumber: '', error: 'Empty number' };
  }

  const stripped = rawInput.replace(/[\s\-().]/g, '');

  // Handle UK numbers for callback leg validation
  if (stripped.startsWith('+44') || stripped.startsWith('0044') || stripped.startsWith('07') || stripped.startsWith('020')) {
    let ukNat = stripped;
    if (ukNat.startsWith('+44')) ukNat = ukNat.slice(3);
    else if (ukNat.startsWith('0044')) ukNat = ukNat.slice(4);
    else if (ukNat.startsWith('0')) ukNat = ukNat.slice(1);
    return {
      valid: ukNat.length >= 9 && ukNat.length <= 10,
      country: 'UK',
      countryCode: '+44',
      e164: `+44${ukNat}`,
      nationalNumber: ukNat,
      formatted: `+44 ${ukNat.slice(0, 4)} ${ukNat.slice(4)}`
    };
  }

  let digits = stripped;
  if (digits.startsWith('+')) {
    digits = digits.slice(1);
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  let national = '';
  if (digits.startsWith('92')) {
    national = digits.slice(2);
  } else if (digits.startsWith('0')) {
    national = digits.slice(1);
  } else if (digits.startsWith('3') && digits.length >= 3) {
    // User typed 3001234567 directly
    national = digits;
  } else {
    national = digits;
  }

  // Remove accidental leading zero after +92 (e.g. +92 0300 1234567)
  if (national.startsWith('0')) {
    national = national.slice(1);
  }

  const onlyDigits = national.replace(/\D/g, '');
  const e164 = onlyDigits ? `+92${onlyDigits}` : '';
  const isCompleteLength = onlyDigits.length >= 9 && onlyDigits.length <= 11;

  return {
    valid: isCompleteLength && /^\d+$/.test(onlyDigits),
    country: 'Pakistan',
    countryCode: '+92',
    raw: rawInput,
    e164,
    nationalNumber: onlyDigits,
    localFormat: onlyDigits ? `0${onlyDigits}` : ''
  };
}

/**
 * Resolves exact Pakistani carrier/city, optimal sub-5p route, and comparison across providers.
 */
function lookupPakistanRate(rawNumber, preferredProviderId = 'localphone-wholesale-sip') {
  const norm = normalizePakistanNumber(rawNumber);
  const n = norm.nationalNumber || '';

  let destinationInfo = {
    network: 'Pakistan General (+92)',
    type: 'mobile',
    city: 'National',
    province: 'Pakistan',
    rateKey: 'default_pk'
  };

  if (n.length >= 3 && n.startsWith('3')) {
    const prefix3 = n.slice(0, 3);
    const mobileMatch = PAKISTAN_MOBILE_PREFIXES[prefix3];
    if (mobileMatch) {
      let rateKey = 'default_pk';
      if (mobileMatch.network.includes('Jazz')) rateKey = 'mobile_jazz';
      else if (mobileMatch.network.includes('Zong')) rateKey = 'mobile_zong';
      else if (mobileMatch.network.includes('Ufone')) rateKey = 'mobile_ufone';
      else if (mobileMatch.network.includes('Telenor')) rateKey = 'mobile_telenor';
      else if (mobileMatch.network.includes('SCOM')) rateKey = 'mobile_scom';

      destinationInfo = {
        network: mobileMatch.network,
        type: 'mobile',
        prefix: `0${prefix3}`,
        city: 'Mobile Network (Nationwide)',
        province: mobileMatch.tier === 'special' ? 'AJK / Gilgit-Baltistan' : 'All Pakistan',
        rateKey
      };
    }
  } else if (n.length >= 2) {
    const prefix4 = n.slice(0, 4);
    const prefix2 = n.slice(0, 2);
    const cityMatch = PAKISTAN_CITY_CODES[prefix4] || PAKISTAN_CITY_CODES[prefix2];
    if (cityMatch) {
      destinationInfo = {
        network: cityMatch.network,
        type: 'landline',
        prefix: `0${PAKISTAN_CITY_CODES[prefix4] ? prefix4 : prefix2}`,
        city: cityMatch.city,
        province: cityMatch.province,
        rateKey: 'landline'
      };
    }
  }

  // Build provider quotes sorted by cheapest rate
  const providerQuotes = VOIP_TRUNK_PROVIDERS.map((provider) => {
    const ratePence = provider.ratesPence[destinationInfo.rateKey] ?? provider.ratesPence.default_pk;
    const rateUsd = Number(((ratePence / 100) / GBP_PER_USD).toFixed(4));
    return {
      providerId: provider.id,
      providerName: provider.name,
      protocol: provider.protocol,
      sipDomain: provider.sipDomain,
      billingIncrement: provider.billingIncrement,
      ratePence,
      rateUsd,
      underFivePence: ratePence < 5.0,
      fivePoundMinutes: Math.floor(500 / ratePence),
      tenPoundMinutes: Math.floor(1000 / ratePence),
      badge: provider.badge
    };
  });

  const selectedQuote =
    providerQuotes.find((q) => q.providerId === preferredProviderId) ||
    providerQuotes[0];

  const cheapestQuote = [...providerQuotes].sort((a, b) => a.ratePence - b.ratePence)[0];

  // Format readable number: +92 300 1234567 or +92 42 35761234
  let formattedNumber = norm.e164 || rawNumber;
  if (n.startsWith('3') && n.length >= 4) {
    formattedNumber = `+92 ${n.slice(0, 3)} ${n.slice(3)}`;
  } else if (n.length >= 3) {
    formattedNumber = `+92 ${n.slice(0, 2)} ${n.slice(2)}`;
  }

  return {
    valid: norm.valid,
    e164: norm.e164,
    localFormat: norm.localFormat,
    formattedNumber,
    destination: destinationInfo,
    selectedProvider: selectedQuote,
    cheapestProvider: cheapestQuote,
    allProviders: providerQuotes,
    localphoneComparison: {
      legacyLocalphonePence: destinationInfo.type === 'landline' ? 2.5 : 3.9,
      ukMobileDirectPence: 155.0, // Typical O2/EE/Vodafone standard international rate without add-on
      savingsPercentVsUkCarrier: Math.round(((155.0 - selectedQuote.ratePence) / 155.0) * 100)
    }
  };
}

/**
 * Calculates exact call charge in pence given duration in seconds and provider billing increment.
 */
function calculateCallCostPence(durationSeconds, ratePencePerMin, billingIncrement = '60/60') {
  if (!durationSeconds || durationSeconds <= 0) return 0;

  const [initialSec, stepSec] = billingIncrement.split('/').map(Number);
  let billedSeconds = durationSeconds;

  if (initialSec && stepSec) {
    if (durationSeconds <= initialSec) {
      billedSeconds = initialSec;
    } else {
      const extra = durationSeconds - initialSec;
      billedSeconds = initialSec + Math.ceil(extra / stepSec) * stepSec;
    }
  }

  const costPence = (billedSeconds / 60) * ratePencePerMin;
  return Number(costPence.toFixed(2));
}

module.exports = {
  VOIP_TRUNK_PROVIDERS,
  PAKISTAN_MOBILE_PREFIXES,
  PAKISTAN_CITY_CODES,
  normalizePakistanNumber,
  lookupPakistanRate,
  calculateCallCostPence
};
