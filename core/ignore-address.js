const fs = require('fs');
const path = require('path');
const https = require('https');
const { createLogger } = require('./logger');

const log = createLogger(__filename);

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

// Cache sheet data trong memory, không ghi vào file
let _sheetCache = new Set();

const IgnoreAddress = {
  // Kết hợp file (committed) + sheet (in-memory), không ghi file
  getAll() {
    const file = load();
    const fileSet = new Set(file.map((a) => a.toLowerCase()));
    for (const a of _sheetCache) fileSet.add(a);
    return fileSet;
  },

  add(address) {
    const data = load();
    const addr = address.toLowerCase();
    if (!data.includes(addr)) {
      data.push(addr);
      save(data);
      return true;
    }
    return false;
  },

  // Fetch sheet → lưu vào memory, không ghi file
  async syncFromSheet() {
    const csv = await fetchUrl(SHEET_URL);
    _sheetCache = new Set(
      csv.split('\n')
        .map((l) => l.trim().toLowerCase())
        .filter((l) => /^0x[0-9a-f]{40}$/.test(l)),
    );
    log.info(`[IgnoreAddress] Sheet synced ${_sheetCache.size} entries (in-memory only)`);
  },

  remove(address) {
    const data = load();
    const addr = address.toLowerCase();
    const next = data.filter((a) => a !== addr);
    if (next.length !== data.length) {
      save(next);
      return true;
    }
    return false;
  },
};

module.exports = IgnoreAddress;
