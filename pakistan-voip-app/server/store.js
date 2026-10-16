const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RUNTIME_STORE_PATH = path.join(DATA_DIR, 'store.runtime.json');

const DEFAULT_STATE = {
  account: {
    balancePence: 850.0, // £8.50 starting credit
    currency: 'GBP',
    ukCallerId: '+447700900456',
    activeProviderId: 'localphone-wholesale-sip',
    sipConfig: {
      sipServer: 'sip.cheapvoip.com',
      wssUrl: 'wss://london.voip.ms:443',
      sipUsername: 'imtiaz_uk_pk',
      sipPassword: '',
      telnyxApiKey: '',
      telnyxConnectionId: '',
      ukAccessGatewayDid: '+442038079200'
    }
  },
  contacts: [
    {
      id: 'c-1',
      name: 'Ammi & Abbu (Lahore Home)',
      pakistanNumber: '+924235761890',
      city: 'Lahore',
      network: 'PTCL / Nayatel Landline',
      ratePence: 1.9,
      ukLocalNumber: '+442038079201',
      speedDialPin: '101',
      favorite: true
    },
    {
      id: 'c-2',
      name: 'Brother Bilal (Jazz Mobile)',
      pakistanNumber: '+923008452310',
      city: 'Islamabad',
      network: 'Jazz (Mobilink)',
      ratePence: 2.8,
      ukLocalNumber: '+442038079202',
      speedDialPin: '102',
      favorite: true
    },
    {
      id: 'c-3',
      name: 'Cousin Ayesha (Zong 4G)',
      pakistanNumber: '+923125548901',
      city: 'Karachi',
      network: 'Zong 4G',
      ratePence: 2.7,
      ukLocalNumber: '+442038079203',
      speedDialPin: '103',
      favorite: true
    },
    {
      id: 'c-4',
      name: 'Uncle Tariq (Mirpur AJK)',
      pakistanNumber: '+925827441122',
      city: 'Mirpur',
      network: 'PTCL / SCOM Landline',
      ratePence: 1.9,
      ukLocalNumber: '+442038079204',
      speedDialPin: '104',
      favorite: false
    },
    {
      id: 'c-5',
      name: 'Usman Textile Office (Faisalabad)',
      pakistanNumber: '+923336512098',
      city: 'Faisalabad',
      network: 'Ufone 4G',
      ratePence: 2.9,
      ukLocalNumber: '+442038079205',
      speedDialPin: '105',
      favorite: false
    }
  ],
  callHistory: [
    {
      id: 'call-1001',
      contactName: 'Ammi & Abbu (Lahore Home)',
      destinationE164: '+924235761890',
      network: 'PTCL / Nayatel Landline',
      mode: 'UK Local Number (0203)',
      providerName: 'Dellmont / Localphone-Tier SIP',
      durationSeconds: 745,
      ratePencePerMin: 1.9,
      totalCostPence: 24.7,
      timestamp: new Date(Date.now() - 1000 * 60 * 145).toISOString(),
      status: 'completed'
    },
    {
      id: 'call-1002',
      contactName: 'Brother Bilal (Jazz Mobile)',
      destinationE164: '+923008452310',
      network: 'Jazz (Mobilink)',
      mode: 'WebRTC Direct Dial',
      providerName: 'Dellmont / Localphone-Tier SIP',
      durationSeconds: 310,
      ratePencePerMin: 2.8,
      totalCostPence: 16.8,
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 19).toISOString(),
      status: 'completed'
    },
    {
      id: 'call-1003',
      contactName: 'Cousin Ayesha (Zong 4G)',
      destinationE164: '+923125548901',
      network: 'Zong 4G',
      mode: '2-Leg Callback',
      providerName: 'VoIP.ms International Value',
      durationSeconds: 420,
      ratePencePerMin: 3.3,
      totalCostPence: 23.1,
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 42).toISOString(),
      status: 'completed'
    }
  ]
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadState() {
  ensureDir();
  if (!fs.existsSync(RUNTIME_STORE_PATH)) {
    const initial = JSON.parse(JSON.stringify(DEFAULT_STATE));
    fs.writeFileSync(RUNTIME_STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(RUNTIME_STORE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (_err) {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function saveState(state) {
  ensureDir();
  fs.writeFileSync(RUNTIME_STORE_PATH, JSON.stringify(state, null, 2), 'utf8');
  return state;
}

function resetState() {
  const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));
  return saveState(fresh);
}

module.exports = {
  DEFAULT_STATE,
  loadState,
  saveState,
  resetState
};
