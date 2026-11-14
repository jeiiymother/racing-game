const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../js/game_modes.js'), 'utf8');
const start = source.indexOf('function qualifyingStartOffset(');
const end = source.indexOf('\n', start);
const startOffsetCode = source.slice(start, end);

test('qualifying cars are released 20 seconds apart after the player', () => {
  const context = vm.createContext({ QUALIFYING_START_INTERVAL: 20 });
  vm.runInContext(startOffsetCode, context);
  assert.equal(vm.runInContext('qualifyingStartOffset(0)', context), 20);
  assert.equal(vm.runInContext('qualifyingStartOffset(1)', context), 40);
});
