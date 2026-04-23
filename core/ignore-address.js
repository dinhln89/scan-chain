const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '../data/ignore-addresses.json');

function load() {
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function save(list) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

function getAll() {
  return new Set(load().map((a) => a.toLowerCase()));
}

function add(address) {
  const list = load();
  const addr = address.toLowerCase();
  if (!list.includes(addr)) {
    list.push(addr);
    save(list);
    return true;
  }
  return false;
}

function remove(address) {
  const list = load();
  const addr = address.toLowerCase();
  const next = list.filter((a) => a !== addr);
  if (next.length !== list.length) {
    save(next);
    return true;
  }
  return false;
}

module.exports = { getAll, add, remove };
