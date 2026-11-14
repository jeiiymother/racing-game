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
  turnRateDegrees: 25,
  returnRateDegrees: 20,
  initialTapDegrees: 5,
  repeatTapDegrees: 20,
  tapThresholdDegrees: 2
};

test('steering rate and self-centering speed are independently bounded', () => {
  const turned = stepSteering(0, { a: true, d: false, w: false }, 0.5, config);
  const centered = stepSteering(Math.PI / 2, {}, 0.5, config);
  assert.ok(Math.abs(turned - 25 * Math.PI / 360) < 1e-12);
  assert.ok(Math.abs(centered - (Math.PI / 2 - 10 * Math.PI / 180)) < 1e-12);
  assert.equal(stepSteering(1, { a: true, d: true }, 0.5, config), 1);
  assert.equal(stepSteering(1, { w: true }, 0.5, config), 1);
});

test('front steering follows Ackermann geometry with the inside wheel turning further', () => {
  const [left, right] = context.window.GameModules.vehicleControls.ackermannAngles(
    30 * Math.PI / 180, 2.7, 1.62
  );
  assert.ok(right > left);
  assert.ok(left > 0);

  const [leftTurnLeft, leftTurnRight] = context.window.GameModules.vehicleControls.ackermannAngles(
    -30 * Math.PI / 180, 2.7, 1.62
  );
  assert.ok(leftTurnLeft < leftTurnRight);
  assert.ok(leftTurnRight < 0);
});

test('toe alignment is mirrored across the vehicle centerline', () => {
  const { applyToe } = context.window.GameModules.vehicleControls;
  assert.equal(applyToe(0, -0.8, 0.1), 0.1);
  assert.equal(applyToe(0, 0.8, 0.1), -0.1);
  assert.equal(applyToe(0.2, -0.8, 0), 0.2);
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
