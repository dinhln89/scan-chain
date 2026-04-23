const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '../data/ignore-methods.json');

function load() {
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function save(list) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

const IgnoreMethod = {
  getAll() {
    return new Set(load().map((s) => s.toLowerCase()));
  },

  add(selector) {
    if (!/^0x[0-9a-fA-F]{8}$/.test(selector)) {
      throw new Error('Selector khong hop le, phai co dang 0x12345678');
    }
    const list = load();
    const sel = selector.toLowerCase();
    if (!list.includes(sel)) {
      list.push(sel);
      save(list);
      return true;
    }
    return false;
  },

  remove(selector) {
    const list = load();
    const sel = selector.toLowerCase();
    const next = list.filter((s) => s !== sel);
    if (next.length !== list.length) {
      save(next);
      return true;
    }
    return false;
  },
};

module.exports = IgnoreMethod;
