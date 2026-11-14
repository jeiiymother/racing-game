const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({ window: {} });
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '../js/vehicle-transmission.js'), 'utf8'),
  context
);
const transmission = context.window.GameModules.vehicleTransmission;
const config = {
  gearRatios: [2.90, 2.10, 1.63, 1.34, 1.12, 0.91],
  finalDrive: 4.15,
  reverseRatio: 3.10,
  wheelRadius: 0.33,
  idleRpm: 1500,
  shiftUpRpm: 8000,
  shiftDownRpm: 4800,
  maximumDownshiftRpm: 8150,
  kickdownRpm: 6200,
  kickdownThrottle: 0.85,
  shiftDuration: 0.14,
  torqueCutFraction: 0.48,
  torqueRecoveryFraction: 0.28
};

function makeState(gear, rpm) {
  const ratio = transmission.ratioForGear(gear, config);
  const speed = rpm / (60 / (2 * Math.PI * config.wheelRadius) * ratio);
  return {
    gear,
    rpm,
    vf: speed,
    shiftT: 0,
    shiftElapsed: 0,
    shiftDuration: 0,
    shiftStartRpm: rpm,
    _shiftTorqueFactor: 1
  };
}

test('all forward gears upshift with a torque cut and smooth RPM synchronization', () => {
  for (let gear = 1; gear < config.gearRatios.length; gear++) {
    const state = makeState(gear, 8100);
    assert.equal(transmission.update(state, 1 / 240, state.vf, 1, config), 0);
    assert.equal(state.gear, gear + 1);
    assert.equal(state.shiftT, config.shiftDuration);

    transmission.update(state, 0.07, state.vf, 1, config);
    assert.ok(state.rpm < 8100);
    assert.ok(state.rpm > 5400);
    assert.ok(state._shiftTorqueFactor > 0 && state._shiftTorqueFactor < 1);

    transmission.update(state, 0.08, state.vf, 1, config);
    assert.equal(state.shiftT, 0);
    assert.equal(state._shiftTorqueFactor, 1);
  }
});

test('automatic downshift, kickdown, over-rev protection, and reverse are guarded', () => {
  let state = makeState(3, 4500);
  transmission.update(state, 1 / 240, state.vf, 0, config);
  assert.equal(state.gear, 2);

  state = makeState(4, 6000);
  transmission.update(state, 1 / 240, state.vf, 0.95, config);
  assert.equal(state.gear, 3);

  state = makeState(6, 7000);
  transmission.update(state, 1 / 240, state.vf, 1, config);
  assert.equal(state.gear, 6);

  state = makeState(0, 6000);
  transmission.update(state, 1 / 240, state.vf, 1, config);
  assert.equal(state.gear, 0);
  assert.equal(transmission.requestGear(state, 1, config), true);
  assert.equal(state.gear, 1);
  assert.equal(transmission.requestGear(state, 7, config), false);
});
