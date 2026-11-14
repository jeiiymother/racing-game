const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({ window: {} });
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '../js/vehicle-engine.js'), 'utf8'),
  context
);
const engine = context.window.GameModules.vehicleEngine;

test('engine model is anchored to the Ferrari GT3 published torque and power points', () => {
  assert.equal(engine.spec.displacementCc, 3902);
  assert.equal(engine.spec.maximumTorqueNm, 700);
  assert.equal(engine.atRpm(6000).torqueNm, 700);
  assert.equal(engine.spec.ratedPowerCv, 600);
  assert.ok(Math.abs(engine.atRpm(7000).powerWatts - engine.spec.ratedPowerWatts) < 1e-8);
});

test('estimated torque curve does not exceed the published maximum power', () => {
  for (let rpm = 1000; rpm <= 8500; rpm += 25) {
    assert.ok(engine.atRpm(rpm).powerWatts <= engine.spec.ratedPowerWatts + 1e-8);
  }
});
