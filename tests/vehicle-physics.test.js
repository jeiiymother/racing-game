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

const aeroConfig = preset => ({
  airDensity: 1.225,
  downforceArea: 2.6,
  dragArea: 0.95,
  referenceArea: 2.2,
  inducedDrag: 0.045,
  frontShare: 0.42,
  preset
});

const suspensionInput = aero => ({
  mass: 1230,
  unsprungMass: 38,
  frontAxleDistance: 1.35,
  rearAxleDistance: 1.45,
  trackWidth: 1.62,
  cgHeight: 0.35,
  longitudinalAcceleration: 0,
  lateralAcceleration: 0,
  aero
});

const suspensionSetup = {
  frontShare: 0.485,
  springFront: 95000,
  springRear: 105000,
  damperFront: 7800,
  damperRear: 8600,
  antiRollFront: 22000,
  antiRollRear: 22000,
  antiRollDamping: 1200
};

test('aerodynamic loads scale with speed squared and presets trade downforce for drag', () => {
  const balanced = physics.aerodynamics;
  const half = balanced.compute(20, aeroConfig(physics.aeroPresets.balanced));
  const full = balanced.compute(40, aeroConfig(physics.aeroPresets.balanced));
  const downforce = balanced.compute(40, aeroConfig(physics.aeroPresets.downforce));
  const lowDrag = balanced.compute(40, aeroConfig(physics.aeroPresets.lowDrag));

  assert.ok(Math.abs(full.total / half.total - 4) < 1e-12);
  assert.ok(Math.abs(full.front + full.rear - full.total) < 1e-9);
  assert.ok(downforce.total > full.total);
  assert.ok(lowDrag.total < full.total);
  assert.ok(lowDrag.drag < full.drag);
});

test('suspension settles to aerodynamic and longitudinal load changes', () => {
  const aero = physics.aerodynamics.compute(45, aeroConfig(physics.aeroPresets.balanced));
  const state = physics.suspension.createState();
  let loads;
  for (let frame = 0; frame < 1200; frame++) {
    loads = physics.suspension.step(
      state,
      { ...suspensionInput(aero), longitudinalAcceleration: 4 },
      1 / 240,
      suspensionSetup
    );
  }
  const front = loads.front.reduce((sum, load) => sum + load, 0);
  const rear = loads.rear.reduce((sum, load) => sum + load, 0);
  assert.ok(rear > front);
  assert.ok(Math.abs(front + rear - (1230 * 9.81 + aero.total)) < 2);
  assert.ok(loads.front.every(load => load > 0));
  assert.ok(loads.rear.every(load => load > 0));
});

test('suspension roll transfers load across the axle without losing total load', () => {
  const state = physics.suspension.createState();
  let loads;
  for (let frame = 0; frame < 1200; frame++) {
    loads = physics.suspension.step(
      state,
      { ...suspensionInput({ front: 0, rear: 0, total: 0 }), lateralAcceleration: 6 },
      1 / 240,
      suspensionSetup
    );
  }
  assert.ok(loads.front[1] > loads.front[0]);
  assert.ok(loads.rear[1] > loads.rear[0]);
  assert.ok(Math.abs(
    loads.front.concat(loads.rear).reduce((sum, load) => sum + load, 0) - 1230 * 9.81
  ) < 2);
});

test('front anti-roll stiffness shifts a larger share of lateral load to the front axle', () => {
  const evaluate = antiRollFront => {
    const state = physics.suspension.createState();
    const setup = { ...suspensionSetup, antiRollFront, antiRollRear: 0 };
    let loads;
    for (let frame = 0; frame < 1200; frame++) {
      loads = physics.suspension.step(
        state,
        { ...suspensionInput({ front: 0, rear: 0, total: 0 }), lateralAcceleration: 6 },
        1 / 240,
        setup
      );
    }
    return loads;
  };
  const soft = evaluate(0);
  const frontStiff = evaluate(40000);
  const frontTransfer = loads => loads.front[1] - loads.front[0];
  const rearTransfer = loads => loads.rear[1] - loads.rear[0];
  assert.ok(frontTransfer(frontStiff) > frontTransfer(soft));
  assert.ok(rearTransfer(frontStiff) < rearTransfer(soft));
});

test('tire load sensitivity makes grip grow sublinearly with normal load', () => {
  const tire = physics.tires;
  const reference = tire.computeAxleGrip([3000, 3000], 1.6, 3000, 0.10);
  const doubled = tire.computeAxleGrip([6000, 6000], 1.6, 3000, 0.10);
  assert.ok(doubled > reference);
  assert.ok(doubled < reference * 2);
  assert.equal(tire.computeAxleGrip([0, 0], 1.6, 3000, 0.10), 0);
});

test('combined-slip lateral capacity stays inside the friction ellipse', () => {
  const capacity = physics.tires.computeLateralCapacity(10000, 8000);
  assert.ok(Math.abs(capacity - 6000) < 1e-9);
  assert.ok(capacity * capacity + 8000 * 8000 <= 10000 * 10000);
});

test('Magic Formula lateral force is restoring, linear near zero, and saturates', () => {
  const smallSlip = physics.tires.lateralTireForce(0.005, 5000, 100000);
  const largeSlip = physics.tires.lateralTireForce(0.1, 5000, 100000);
  assert.ok(smallSlip < 0 && Math.abs(smallSlip + 500) < 4);
  assert.ok(largeSlip < smallSlip);
  assert.ok(Math.abs(largeSlip) <= 5000);
  assert.ok(Math.abs(largeSlip) > 4900);
});

test('longitudinal tire force follows slip direction and remains load-limited', () => {
  const force = physics.tires.longitudinalTireForce;
  assert.ok(force(0.08, 5000, 80000) > 0);
  assert.ok(force(-0.08, 5000, 80000) < 0);
  assert.ok(Math.abs(force(1, 5000, 80000)) <= 5000);
  assert.equal(force(0.1, 0, 80000), 0);
});
