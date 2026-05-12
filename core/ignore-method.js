const fs = require('fs');
const path = require('path');
const https = require('https');
const { createLogger } = require('./logger');

const log = createLogger(__filename);

const FILE = path.resolve(__dirname, '../data/ignore-methods.json');
const SPREADSHEET_ID = '1E6P0tLWMSiMIv7JNA3USpr-XAUeQp7OpzvFbJWesRQs';
const SHEET_URLS = [
  `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=1198058145`, // Sheet2
  `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=1458691919`, // ignoreSwapSheet
];

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
    const m = line.match(/^(0x[0-9a-fA-F]+)(?:,(.*))?$/);
    if (!m) return acc;
    const sel = m[1].toLowerCase();
    let comment = (m[2] ?? '').trim();
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

// Cache sheet data trong memory, không ghi vào file
let _sheetCache = {};

const IgnoreMethod = {
  // Kết hợp file (committed) + sheet (in-memory), không ghi file
  getAll() {
    const file = load();
    return new Set([...Object.keys(file), ...Object.keys(_sheetCache)].map((s) => s.toLowerCase()));
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

  // Fetch sheet → lưu vào memory, không ghi file
  async syncFromSheet() {
    const csvList = await Promise.all(SHEET_URLS.map(fetchUrl));
    _sheetCache = {};
    for (const csv of csvList) {
      Object.assign(_sheetCache, parseCSV(csv));
    }
    log.info(`[IgnoreMethod] Sheet synced ${Object.keys(_sheetCache).length} entries (in-memory only)`);
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
module.exports.parseCSV = parseCSV;
