const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({ window: {} });
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '../js/vehicle-controls.js'), 'utf8'),
  context
);
const { stepSteering, tapSteering } = context.window.GameModules.vehicleControls;
const config = {
  maximumAngle: 2 * Math.PI,
  turnRateDegrees: 120,
  returnRateDegrees: 90,
  initialTapDegrees: 5,
  repeatTapDegrees: 20,
  tapThresholdDegrees: 2
};

test('steering rate and self-centering speed are independently bounded', () => {
  const turned = stepSteering(0, { a: true, d: false, w: false }, 0.5, config);
  const centered = stepSteering(Math.PI / 2, {}, 0.5, config);
  assert.ok(Math.abs(turned - Math.PI / 3) < 1e-12);
  assert.ok(Math.abs(centered - Math.PI / 4) < 1e-12);
  assert.equal(stepSteering(1, { a: true, d: true }, 0.5, config), 1);
  assert.equal(stepSteering(1, { w: true }, 0.5, config), 1);
});

test('steering clamps to the configured steering lock', () => {
  assert.equal(
    stepSteering(0, { a: true }, 5, { ...config, maximumAngle: 1 }),
    1
  );
});

test('a first steering tap adds 5 degrees and the next adds 20 degrees', () => {
  const firstTap = tapSteering(0, 1, config);
  const secondTap = tapSteering(firstTap, 1, config);
  assert.ok(Math.abs(firstTap - 5 * Math.PI / 180) < 1e-12);
  assert.ok(Math.abs(secondTap - 25 * Math.PI / 180) < 1e-12);
});
