const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../js/game_modes.js'), 'utf8');
const start = source.indexOf('function gearRatio(){');
const end = source.indexOf('\nfunction driveForce(){', start);
const transmissionCode = source.slice(start, end);

function transmission(gear, rpm, throttle = 0) {
  const ratios = [12.2, 9.7, 7.7, 6.1, 4.8, 3.8];
  const ratio = gear === 0 ? 4.2 : ratios[gear - 1];
  const speed = rpm / (60 / (2 * Math.PI * 0.33) * ratio);
  const context = vm.createContext({
    AUTO_SHIFT_DOWNSHIFT_RPM: 5200,
    AUTO_SHIFT_KICKDOWN_RPM: 6500,
    AUTO_SHIFT_UP_RPM: 8200,
    GTOT: ratios,
    G_REV: 4.2,
    IDLE: 1500,
    K_RPM: 60 / (2 * Math.PI * 0.33),
    MAXSPD: 78,
    REDLINE: 8500,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    ms: { thr: throttle },
    u: {
      gear,
      vf: speed,
      rpm,
      shiftT: 0,
      shiftElapsed: 0,
      shiftDuration: 0,
      shiftStartRpm: rpm,
      _blipT: 0
    }
  });
  vm.runInContext(transmissionCode, context);
  return context;
}

test('all forward gears upshift at the engine limit with an interruption', () => {
  for (let gear = 1; gear < 6; gear++) {
    const context = transmission(gear, 8250, 1);
    vm.runInContext('gearbox(1 / 240)', context);
    assert.equal(context.u.gear, gear + 1);
    assert.equal(context.u.shiftT, 0.2);
    assert.ok(context.u.rpm >= 8250);
    vm.runInContext('gearbox(0.1)', context);
    assert.ok(context.u.rpm < 8250);
    assert.ok(context.u.rpm > 6000);
    vm.runInContext('gearbox(0.1)', context);
    assert.equal(context.u.shiftT, 0);
  }
});

test('automatic downshift, kickdown, over-rev protection, and reverse are guarded', () => {
  let context = transmission(3, 4800);
  vm.runInContext('gearbox(1 / 240)', context);
  assert.equal(context.u.gear, 2);
  assert.equal(context.u._blipT, 0.15);

  context = transmission(4, 6000, 0.95);
  vm.runInContext('gearbox(1 / 240)', context);
  assert.equal(context.u.gear, 3);

  context = transmission(6, 7000, 1);
  vm.runInContext('gearbox(1 / 240)', context);
  assert.equal(context.u.gear, 6);

  context = transmission(0, 6000, 1);
  vm.runInContext('gearbox(1 / 240)', context);
  assert.equal(context.u.gear, 0);
});
