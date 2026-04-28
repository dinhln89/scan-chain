const fs = require('fs');
const path = require('path');
const https = require('https');

const FILE = path.resolve(__dirname, '../data/ignore-methods.json');
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1E6P0tLWMSiMIv7JNA3USpr-XAUeQp7OpzvFbJWesRQs/export?format=csv&gid=1198058145';

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

function parseCSV(text) {
  return text.split('\n').reduce((acc, line) => {
    line = line.trim();
    const m = line.match(/^(0x[0-9a-fA-F]+),(.*)$/);
    if (!m) return acc;
    const sel = m[1].toLowerCase();
    let comment = m[2].trim();
    if (comment.startsWith('"') && comment.endsWith('"')) comment = comment.slice(1, -1);
    acc[sel] = comment;
    return acc;
  }, {});
}

function load() {
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

const IgnoreMethod = {
  getAll() {
    return new Set(Object.keys(load()).map((s) => s.toLowerCase()));
  },

  add(selector, comment = '') {
    if (!/^0x[0-9a-fA-F]{8}$/.test(selector)) {
      throw new Error('Selector khong hop le, phai co dang 0x12345678');
    }
    const data = load();
    const sel = selector.toLowerCase();
    if (!(sel in data)) {
      data[sel] = comment;
      save(data);
      return true;
    }
    return false;
  },

  async syncFromSheet() {
    const csv = await fetchUrl(SHEET_URL);
    const remote = parseCSV(csv);
    const data = load();
    let added = 0;
    for (const [sel, comment] of Object.entries(remote)) {
      if (!(sel in data)) {
        data[sel] = comment;
        added++;
      }
    }
    if (added > 0) {
      save(data);
      console.log(`[IgnoreMethod] Synced ${added} new entries from sheet`);
    } else {
      console.log('[IgnoreMethod] Sheet sync: no new entries');
    }
  },

  remove(selector) {
    const data = load();
    const sel = selector.toLowerCase();
    if (sel in data) {
      delete data[sel];
      save(data);
      return true;
    }
    return false;
  },
};

module.exports = IgnoreMethod;
