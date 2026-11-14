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
  gearRatios: [3.00, 2.40, 1.92, 1.54, 1.23, 0.98],
  finalDrive: 4.15,
  reverseRatio: 3.10,
  wheelRadius: 0.355,
  maximumVehicleSpeed: 78,
  idleRpm: 1500,
  shiftUpRpm: 8000,
  shiftDownRpm: 5200,
  maximumDownshiftRpm: 8150,
  downshiftTargetMaxRpm: 7200,
  kickdownRpm: 5800,
  kickdownTargetMinRpm: 6200,
  kickdownTargetMaxRpm: 7600,
  kickdownThrottle: 0.85,
  shiftLockoutDuration: 0.24,
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

  state = makeState(4, 5600);
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

test('kickdown cannot select a gear that immediately demands an upshift', () => {
  const state = makeState(2, 6400);
  transmission.update(state, 1 / 240, state.vf, 1, config);
  assert.equal(state.gear, 2);

  const downshift = makeState(3, 4700);
  transmission.update(downshift, 1 / 240, downshift.vf, 0, config);
  assert.equal(downshift.gear, 2);
  for (let frame = 0; frame < 120; frame++) {
    transmission.update(downshift, 1 / 240, downshift.vf, 0, config);
  }
  assert.equal(downshift.gear, 2);
});

test('full throttle does not immediately undo an upshift with kickdown', () => {
  const state = makeState(1, 8100);
  transmission.update(state, 1 / 240, state.vf, 1, config);
  assert.equal(state.gear, 2);
  for (let frame = 0; frame < 360; frame++) {
    const dt = 1 / 240;
    const speed = state.vf + frame * 0.002;
    transmission.update(state, dt, speed, 1, config);
    assert.equal(state.gear, 2);
  }
});

test('a steady speed increase produces sequential upshifts without gear hunting', () => {
  const state = makeState(1, config.idleRpm);
  const shifts = [];
  let previousGear = state.gear;
  let speed = 0;
  for (let frame = 0; frame < 12000; frame++) {
    const dt = 1 / 120;
    speed = Math.min(78, speed + 1.5 * dt);
    transmission.update(state, dt, speed, 1, config);
    if (state.gear !== previousGear) {
      shifts.push(state.gear);
      previousGear = state.gear;
    }
  }
  assert.deepEqual(shifts, [2, 3, 4, 5, 6]);
});

test('close ratios keep a consistent RPM drop and reach redline near the speed cap', () => {
  for (let gear = 1; gear < config.gearRatios.length; gear++) {
    const step = config.gearRatios[gear] / config.gearRatios[gear - 1];
    assert.ok(step > 0.79 && step < 0.81);
  }
  const wheelRpmFactor = 60 / (2 * Math.PI * config.wheelRadius);
  const redlineSpeed = 8500
    / (wheelRpmFactor * transmission.ratioForGear(6, config));
  assert.ok(Math.abs(redlineSpeed - config.maximumVehicleSpeed) < 1);
});
