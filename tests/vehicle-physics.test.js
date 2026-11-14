const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({ window: {} });
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '../js/vehicle-physics.js'), 'utf8'),
  context
);
const physics = context.window.GameModules.vehiclePhysics;

test('aerodynamic loads scale with speed squared and preserve axle split', () => {
  const atHalfSpeed = physics.computeAeroLoads(20, 1.225, 2.6, 0.42, 1);
  const atFullSpeed = physics.computeAeroLoads(40, 1.225, 2.6, 0.42, 1);
  assert.ok(Math.abs(atFullSpeed.total / atHalfSpeed.total - 4) < 1e-12);
  assert.ok(Math.abs(atFullSpeed.front + atFullSpeed.rear - atFullSpeed.total) < 1e-9);
});

test('load transfer shifts wheel loads without changing axle load', () => {
  const transfer = physics.computeLoadTransfer(1230, 9.81, 0.35, 1.62);
  const wheels = physics.computeLateralWheelLoads(6000, transfer);
  assert.ok(wheels[0] < wheels[1]);
  assert.ok(Math.abs(wheels[0] + wheels[1] - 6000) < 1e-9);
});

test('tire load sensitivity makes grip grow sublinearly with normal load', () => {
  const reference = physics.computeAxleGrip([3000, 3000], 1.6, 3000, 0.08);
  const doubled = physics.computeAxleGrip([6000, 6000], 1.6, 3000, 0.08);
  assert.ok(doubled > reference);
  assert.ok(doubled < reference * 2);
});

test('combined-slip lateral capacity stays inside the friction ellipse', () => {
  const totalGrip = 10000;
  const lateral = physics.computeLateralCapacity(totalGrip, 8000);
  assert.ok(Math.abs(lateral - 6000) < 1e-9);
  assert.ok(lateral * lateral + 8000 * 8000 <= totalGrip * totalGrip);
});

test('lateral tire force is restoring, linear near zero, and saturates', () => {
  const smallSlip = physics.lateralTireForce(0.005, 5000, 100000);
  const largeSlip = physics.lateralTireForce(1, 5000, 100000);
  assert.ok(smallSlip < 0 && Math.abs(smallSlip + 500) < 2);
  assert.ok(largeSlip < smallSlip);
  assert.ok(Math.abs(largeSlip) <= 5000);
  assert.ok(Math.abs(largeSlip) > 4999);
});
