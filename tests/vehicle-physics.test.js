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
  mass: 1260,
  unsprungMass: 38,
  frontAxleDistance: 1.39,
  rearAxleDistance: 1.31,
  trackWidth: 1.62,
  cgHeight: 0.35,
  longitudinalAcceleration: 0,
  lateralAcceleration: 0,
  aero
});

const suspensionSetup = {
  frontShare: 1.31 / 2.7,
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
  assert.ok(Math.abs(front + rear - (1260 * 9.81 + aero.total)) < 2);
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
  assert.ok(loads.front[0] > loads.front[1]);
  assert.ok(loads.rear[0] > loads.rear[1]);
  assert.ok(Math.abs(
    loads.front.concat(loads.rear).reduce((sum, load) => sum + load, 0) - 1260 * 9.81
  ) < 2);

  const oppositeState = physics.suspension.createState();
  for (let frame = 0; frame < 1200; frame++) {
    loads = physics.suspension.step(
      oppositeState,
      { ...suspensionInput({ front: 0, rear: 0, total: 0 }), lateralAcceleration: -6 },
      1 / 240,
      suspensionSetup
    );
  }
  assert.ok(loads.front[1] > loads.front[0]);
  assert.ok(loads.rear[1] > loads.rear[0]);
});

test('static axle load follows the configured axle-to-center-of-gravity geometry', () => {
  const loads = physics.suspension.step(
    physics.suspension.createState(),
    suspensionInput({ front: 0, rear: 0, total: 0 }),
    1 / 240,
    suspensionSetup
  );
  const frontLoad = loads.front.reduce((sum, load) => sum + load, 0);
  assert.ok(Math.abs(frontLoad / (1260 * 9.81) - 1.31 / 2.7) < 1e-12);
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
  const frontTransfer = loads => loads.front[0] - loads.front[1];
  const rearTransfer = loads => loads.rear[0] - loads.rear[1];
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

test('tire grip peaks near the target temperature and falls when cold or overheated', () => {
  const { temperatureGrip } = physics.tires;
  assert.ok(temperatureGrip(90) > temperatureGrip(24));
  assert.ok(temperatureGrip(90) > temperatureGrip(145));
  assert.ok(temperatureGrip(24) > 0.9);
  assert.ok(temperatureGrip(24) < temperatureGrip(60));
  assert.equal(temperatureGrip(160), physics.tires.temperatureConfig.minimumGrip);
});

test('ambient-temperature tires retain realistic dry-track cornering capacity', () => {
  const ambientGrip = physics.tires.computeAxleGrip(
    [1260 * 9.81 / 4, 1260 * 9.81 / 4, 1260 * 9.81 / 4, 1260 * 9.81 / 4],
    1.75 * physics.tires.temperatureGrip(24),
    3000,
    0.10
  );
  const corneringG = ambientGrip / (1260 * 9.81);
  assert.ok(corneringG > 1.6 && corneringG < 1.7);
});

test('slip work heats each tire while airflow cools a tire without slip', () => {
  const input = {
    longitudinalForce: 3000,
    longitudinalSlipSpeed: 6,
    lateralForce: 2000,
    lateralSlipSpeed: 3,
    speed: 30,
    ambientTemperatureC: 24
  };
  const heated = physics.tires.updateTemperature(80, input, 1);
  const cooled = physics.tires.updateTemperature(100, {
    ...input,
    longitudinalForce: 0,
    longitudinalSlipSpeed: 0,
    lateralForce: 0,
    lateralSlipSpeed: 0
  }, 1);
  assert.ok(heated > 80);
  assert.ok(cooled < 100);
  assert.ok(cooled >= input.ambientTemperatureC);
});

test('combined-slip lateral capacity stays inside the friction ellipse', () => {
  const capacity = physics.tires.computeLateralCapacity(10000, 8000);
  assert.ok(Math.abs(capacity - 6000) < 1e-9);
  assert.ok(capacity * capacity + 8000 * 8000 <= 10000 * 10000);
});

test('combined tire force respects the friction ellipse without an artificial lateral reserve', () => {
  assert.equal(physics.tires.computeLateralCapacity(10000, 10000), 0);
  assert.ok(physics.tires.computeLateralCapacity(10000, 8000) ** 2 + 8000 ** 2 <= 10000 ** 2);
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

test('each wheel integrates spin torque stably and limits combined tire force', () => {
  const state = { omega: 10 / 0.355, lateralForce: 0 };
  const input = {
    radius: 0.355,
    inertia: 1.2,
    normalLoad: 3200,
    frictionCoefficient: 1.6,
    referenceWheelLoad: 3000,
    loadSensitivity: 0.1,
    longitudinalSpeed: 10,
    lateralSpeed: 0.8,
    minimumSlipSpeed: 1.5,
    longitudinalStiffness: 90000,
    corneringStiffness: 135000,
    relaxationLength: 0.45,
    driveTorque: 80,
    brakeTorque: 0
  };
  let result;
  for (let frame = 0; frame < 240; frame++) {
    result = physics.tires.stepWheel(state, input, 1 / 240);
    assert.ok(Number.isFinite(state.omega));
    assert.ok(Number.isFinite(result.lateralForce));
    assert.ok(Math.hypot(result.longitudinalForce, result.lateralForce) <= result.grip + 1e-6);
  }
  assert.ok(Math.abs(state.omega - 10 / 0.355) < 5);
  assert.ok(state.lateralForce < 0);
});

test('wheel braking opposes travel and a suddenly unloaded tire stays inside its new grip limit', () => {
  const state = { omega: 10 / 0.355, lateralForce: -4000 };
  const input = {
    radius: 0.355,
    inertia: 1.2,
    normalLoad: 500,
    frictionCoefficient: 1.2,
    referenceWheelLoad: 3000,
    loadSensitivity: 0.1,
    longitudinalSpeed: 10,
    lateralSpeed: 0,
    minimumSlipSpeed: 1.5,
    longitudinalStiffness: 90000,
    corneringStiffness: 67500,
    relaxationLength: 0.45,
    driveTorque: 0,
    brakeTorque: 1800
  };
  const result = physics.tires.stepWheel(state, input, 1 / 240);
  assert.ok(state.omega >= 0);
  assert.ok(result.longitudinalForce < 0);
  assert.ok(Math.hypot(result.longitudinalForce, result.lateralForce) <= result.grip + 1e-6);
});
