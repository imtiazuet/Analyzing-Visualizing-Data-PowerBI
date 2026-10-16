# PakCall Direct — Sub-5p/min UK to Pakistan VoIP App (Localphone Replacement)

A full-stack VoIP web application and SIP/CPaaS routing switch built to replace **Localphone** (which discontinued its consumer calling service in Feb 2025) and keep calls from the UK to **Pakistan (+92)** under **5 pence per minute** (**1.7p–3.6p/min**).

## How It Achieves Sub-5p/min to Pakistan (Like Localphone)

Localphone offered three ways to call Pakistan for `< 5p/min`. **PakCall Direct** implements all three:

1. **WebRTC / Direct SIP Trunking (`1.7p–3.4p/min`)**
   - Connects directly from the browser dialer (or any SIP softphone like Acrobits Groundwire / Linphone / Zoiper) over wholesale SIP trunks (**Dellmont / CheapVoIP**, **VoIP.ms London POP**, **Anveo Direct LCR**, or **Telnyx**).
   - Automatically detects Pakistani networks by prefix (**Jazz/Mobilink `030x/032x`**, **Zong `031x`**, **Ufone `033x`**, **Telenor `034x`**, **SCOM `0355`**, and **PTCL/Nayatel City Landlines `021 Karachi`, `042 Lahore`, `051 Islamabad`, `041 Faisalabad`, `05827 Mirpur AJK`**) and displays the live pence-per-minute rate before you dial.

2. **Localphone-Style UK `0203` Local Access Numbers (`1.9p–3.4p/min` + Free UK Inclusive Minutes)**
   - Every Pakistani contact is assigned a dedicated UK `0203` London landline number (e.g. `+44 203 807 9201`).
   - When you dial that UK `0203` number from your UK mobile (EE, O2, Three, Vodafone, Lebara, giffgaff) using your free inclusive UK minutes, the `/api/webhooks/uk-access-did` TwiML/TeXML switch authenticates your UK Caller ID (`+447...`) and immediately bridges the call over your wholesale SIP trunk to Pakistan — no internet or mobile data needed.

3. **2-Leg Callback (`2.7p–3.7p/min` Combined)**
   - Ideal when Wi-Fi/4G is weak. The switch calls your UK handset first (Leg A: `~0.8p/min`) and bridges you to Pakistan (Leg B: `1.9p–2.9p/min`) as soon as you answer.

## Quick Start

```bash
cd pakistan-voip-app
npm install
npm test
npm start
```

Open `http://localhost:3000` in your browser.
