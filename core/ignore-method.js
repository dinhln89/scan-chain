const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '../data/ignore-methods.json');

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
