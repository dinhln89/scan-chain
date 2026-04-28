const fs = require('fs');
const path = require('path');
const https = require('https');

const FILE = path.resolve(__dirname, '../data/ignore-addresses.json');
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1E6P0tLWMSiMIv7JNA3USpr-XAUeQp7OpzvFbJWesRQs/export?format=csv&gid=1982385575';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function load() {
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function save(list) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

const IgnoreAddress = {
  getAll() {
    return new Set(load().map((a) => a.toLowerCase()));
  },

  add(address) {
    const list = load();
    const addr = address.toLowerCase();
    if (!list.includes(addr)) {
      list.push(addr);
      save(list);
      return true;
    }
    return false;
  },

  async syncFromSheet() {
    const csv = await fetchUrl(SHEET_URL);
    const remote = csv.split('\n')
      .map((l) => l.trim().toLowerCase())
      .filter((l) => /^0x[0-9a-f]{40}$/.test(l));
    const list = load();
    const existing = new Set(list.map((a) => a.toLowerCase()));
    let added = 0;
    for (const addr of remote) {
      if (!existing.has(addr)) {
        list.push(addr);
        added++;
      }
    }
    if (added > 0) {
      save(list);
      console.log(`[IgnoreAddress] Synced ${added} new entries from sheet`);
    } else {
      console.log('[IgnoreAddress] Sheet sync: no new entries');
    }
  },

  remove(address) {
    const list = load();
    const addr = address.toLowerCase();
    const next = list.filter((a) => a !== addr);
    if (next.length !== list.length) {
      save(next);
      return true;
    }
    return false;
  },
};

module.exports = IgnoreAddress;
