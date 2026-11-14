(function() {
  const GRAVITY = 9.81;
  const TIRE_CURVE_SHAPE = { c: 1.3, e: -1.6 };

  const AERO_PRESETS = Object.freeze({
    downforce: Object.freeze({ label: '下压力优先', downforce: 1.22, drag: 1.14 }),
    balanced: Object.freeze({ label: '适中', downforce: 1, drag: 1 }),
    lowDrag: Object.freeze({ label: '低阻力', downforce: 0.78, drag: 0.88 })
  });
  const TIRE_TEMPERATURE = Object.freeze({
    optimumC: 90,
    coldRangeC: 55,
    hotRangeC: 45,
    minimumGrip: 0.72,
    heatCapacityJPerC: 18000,
    coolingRatePerSecond: 0.012
  });

  function computeAerodynamics(speed, config) {
    const dynamicPressure = 0.5 * config.airDensity * speed * speed;
    const downforceArea = config.downforceArea * config.preset.downforce;
    const dragArea = config.dragArea * config.preset.drag;
    const total = dynamicPressure * downforceArea;
    const inducedDrag = dynamicPressure * config.inducedDrag
      * downforceArea * downforceArea / config.referenceArea;
    return {
      front: total * config.frontShare,
      rear: total * (1 - config.frontShare),
      total,
      drag: dynamicPressure * dragArea + inducedDrag
    };
  }

  function createSuspensionState() {
    return {
      heave: 0,
      heaveVelocity: 0,
      pitch: 0,
      pitchVelocity: 0,
      roll: 0,
      rollVelocity: 0
    };
  }

  function computeSuspensionStep(state, input, dt, setup) {
    const mass = input.mass;
    const sprungMass = mass - 4 * input.unsprungMass;
    const wheelbase = input.frontAxleDistance + input.rearAxleDistance;
    const trackWidth = input.trackWidth;
    const frontSpring = setup.springFront;
    const rearSpring = setup.springRear;
    const frontDamper = setup.damperFront;
    const rearDamper = setup.damperRear;
    const heaveStiffness = 2 * (frontSpring + rearSpring);
    const heaveDamping = 2 * (frontDamper + rearDamper);
    const heavePitchStiffness = 2 * (
      frontSpring * input.frontAxleDistance - rearSpring * input.rearAxleDistance
    );
    const heavePitchDamping = 2 * (
      frontDamper * input.frontAxleDistance - rearDamper * input.rearAxleDistance
    );
    const pitchStiffness = 2 * (
      frontSpring * input.frontAxleDistance ** 2
      + rearSpring * input.rearAxleDistance ** 2
    );
    const pitchDamping = 2 * (
      frontDamper * input.frontAxleDistance ** 2
      + rearDamper * input.rearAxleDistance ** 2
    );
    const rollStiffness = (frontSpring + rearSpring) * trackWidth ** 2 / 2
      + setup.antiRollFront + setup.antiRollRear;
    const rollDamping = (frontDamper + rearDamper) * trackWidth ** 2 / 2
      + setup.antiRollDamping;
    const pitchInertia = sprungMass * wheelbase ** 2 * 0.18;
    const rollInertia = sprungMass * (wheelbase ** 2 + trackWidth ** 2) * 0.1;

    const heaveAcceleration = (
      input.aero.total
      - heaveDamping * state.heaveVelocity - heavePitchDamping * state.pitchVelocity
      - heaveStiffness * state.heave - heavePitchStiffness * state.pitch
    ) / sprungMass;
    const pitchMoment = input.aero.front * input.frontAxleDistance
      - input.aero.rear * input.rearAxleDistance
      - mass * input.longitudinalAcceleration * input.cgHeight;
    const pitchAcceleration = (
      pitchMoment - heavePitchDamping * state.heaveVelocity
      - pitchDamping * state.pitchVelocity - heavePitchStiffness * state.heave
      - pitchStiffness * state.pitch
    ) / pitchInertia;
    const rollMoment = -mass * input.lateralAcceleration * input.cgHeight;
    const rollAcceleration = (
      rollMoment - rollDamping * state.rollVelocity - rollStiffness * state.roll
    ) / rollInertia;

    state.heaveVelocity += heaveAcceleration * dt;
    state.heave += state.heaveVelocity * dt;
    state.pitchVelocity += pitchAcceleration * dt;
    state.pitch += state.pitchVelocity * dt;
    state.rollVelocity += rollAcceleration * dt;
    state.roll += state.rollVelocity * dt;

    const halfTrack = trackWidth / 2;
    const cornerLoad = (x, z, springRate, damperRate, antiRollRate, axleLoad) => {
      const compression = state.heave + z * state.pitch + x * state.roll;
      const compressionRate = state.heaveVelocity + z * state.pitchVelocity
        + x * state.rollVelocity;
      const bumpStop = Math.max(0, compression - 0.065) * 250000
        - Math.max(0, -compression - 0.08) * 120000;
      const antiRollLoad = Math.sign(x) * (
        antiRollRate * state.roll + setup.antiRollDamping * 0.5 * state.rollVelocity
      ) / trackWidth;
      return Math.max(0, axleLoad + springRate * compression
        + damperRate * compressionRate + bumpStop + antiRollLoad);
    };
    const frontAxleLoad = mass * GRAVITY * setup.frontShare / 2;
    const rearAxleLoad = mass * GRAVITY * (1 - setup.frontShare) / 2;

    return {
      front: [
        cornerLoad(-halfTrack, input.frontAxleDistance, frontSpring, frontDamper, setup.antiRollFront, frontAxleLoad),
        cornerLoad(halfTrack, input.frontAxleDistance, frontSpring, frontDamper, setup.antiRollFront, frontAxleLoad)
      ],
      rear: [
        cornerLoad(-halfTrack, -input.rearAxleDistance, rearSpring, rearDamper, setup.antiRollRear, rearAxleLoad),
        cornerLoad(halfTrack, -input.rearAxleDistance, rearSpring, rearDamper, setup.antiRollRear, rearAxleLoad)
      ],
      heave: state.heave,
      pitch: state.pitch,
      roll: state.roll
    };
  }

  function computeAxleGrip(wheelLoads, frictionCoefficient, referenceWheelLoad, loadSensitivity) {
    return wheelLoads.reduce((capacity, load) => {
      const normalLoad = Math.max(0, load);
      if (normalLoad === 0) return capacity;
      const normalizedLoad = normalLoad / referenceWheelLoad;
      return capacity + frictionCoefficient * normalLoad
        * Math.pow(normalizedLoad, -loadSensitivity);
    }, 0);
  }

  function computeLateralCapacity(totalGrip, longitudinalForce) {
    const ratio = Math.min(1, Math.abs(longitudinalForce) / Math.max(totalGrip, 1));
    return totalGrip * Math.sqrt(1 - ratio * ratio);
  }

  function magicFormula(slip, capacity, stiffness, shape) {
    if (capacity <= 0 || stiffness <= 0) return 0;
    const c = shape.c;
    const b = stiffness / (c * capacity);
    const bx = b * slip;
    return capacity * Math.sin(c * Math.atan(bx - shape.e * (bx - Math.atan(bx))));
  }

  function lateralTireForce(slipAngle, lateralCapacity, corneringStiffness) {
    return -magicFormula(slipAngle, lateralCapacity, corneringStiffness, TIRE_CURVE_SHAPE);
  }

  function longitudinalTireForce(slipRatio, longitudinalCapacity, longitudinalStiffness) {
    return magicFormula(slipRatio, longitudinalCapacity, longitudinalStiffness, TIRE_CURVE_SHAPE);
  }

  function temperatureGrip(temperatureC) {
    const difference = temperatureC - TIRE_TEMPERATURE.optimumC;
    const range = difference < 0
      ? TIRE_TEMPERATURE.coldRangeC
      : TIRE_TEMPERATURE.hotRangeC;
    const falloff = difference < 0 ? 0.24 : 0.30;
    return Math.max(
      TIRE_TEMPERATURE.minimumGrip,
      1.02 - falloff * (difference / range) ** 2
    );
  }

  function updateTireTemperature(temperatureC, input, dt) {
    const slipPower = Math.abs(input.longitudinalForce * input.longitudinalSlipSpeed)
      + Math.abs(input.lateralForce * input.lateralSlipSpeed);
    const heatingRate = slipPower / TIRE_TEMPERATURE.heatCapacityJPerC;
    const coolingRate = TIRE_TEMPERATURE.coolingRatePerSecond
      * (1 + Math.max(0, input.speed) * 0.025)
      * (temperatureC - input.ambientTemperatureC);
    return Math.max(
      input.ambientTemperatureC,
      Math.min(180, temperatureC + (heatingRate - coolingRate) * dt)
    );
  }

  function computeAxleLongitudinalForce(
    slipRatio,
    wheelLoads,
    frictionCoefficient,
    referenceWheelLoad,
    loadSensitivity,
    longitudinalStiffness
  ) {
    return wheelLoads.reduce((force, load) => {
      const capacity = computeAxleGrip(
        [load], frictionCoefficient, referenceWheelLoad, loadSensitivity
      );
      return force + longitudinalTireForce(slipRatio, capacity, longitudinalStiffness);
    }, 0);
  }

  function stepWheelTire(state, input, dt) {
    const radius = input.radius;
    const normalLoad = Math.max(0, input.normalLoad);
    const grip = computeAxleGrip(
      [normalLoad],
      input.frictionCoefficient,
      input.referenceWheelLoad,
      input.loadSensitivity
    );
    const longitudinalSpeed = input.longitudinalSpeed;
    const slipDenominator = Math.max(Math.abs(longitudinalSpeed), input.minimumSlipSpeed);
    const wheelOmega = state.omega;
    const slipAt = omega => (omega * radius - longitudinalSpeed) / slipDenominator;
    const longitudinalAt = omega => longitudinalTireForce(
      slipAt(omega), grip, input.longitudinalStiffness
    );
    const initialLongitudinalForce = longitudinalAt(wheelOmega);
    const sampleStep = Math.max(0.1, Math.abs(wheelOmega) * 0.01);
    const slope = Math.max(0, (
      longitudinalAt(wheelOmega + sampleStep)
      - longitudinalAt(wheelOmega - sampleStep)
    ) / (2 * sampleStep));
    const brakeDirection = Math.sign(wheelOmega || longitudinalSpeed);
    const appliedTorque = input.driveTorque - input.brakeTorque * brakeDirection;
    const effectiveInertia = input.inertia / dt + slope * radius;
    let nextOmega = wheelOmega
      + (appliedTorque - initialLongitudinalForce * radius) / effectiveInertia;
    if (input.brakeTorque > 0 && longitudinalSpeed !== 0
      && nextOmega * longitudinalSpeed < 0) {
      nextOmega = 0;
    }

    const meanOmega = (wheelOmega + nextOmega) * 0.5;
    const slipRatio = slipAt(meanOmega);
    const longitudinalForce = longitudinalTireForce(
      slipRatio, grip, input.longitudinalStiffness
    );
    const slipAngle = Math.atan2(
      input.lateralSpeed,
      Math.max(Math.abs(longitudinalSpeed), input.minimumSlipSpeed)
    );
    const lateralCapacity = computeLateralCapacity(grip, longitudinalForce);
    const lateralTarget = lateralTireForce(
      slipAngle, lateralCapacity, input.corneringStiffness
    );
    const response = 1 - Math.exp(
      -Math.max(Math.abs(longitudinalSpeed), input.minimumSlipSpeed)
      * dt / input.relaxationLength
    );

    state.omega = nextOmega;
    state.lateralForce += (lateralTarget - state.lateralForce) * response;
    state.lateralForce = Math.max(
      -lateralCapacity,
      Math.min(lateralCapacity, state.lateralForce)
    );
    return {
      omega: nextOmega,
      grip,
      slipRatio,
      slipAngle,
      longitudinalForce,
      lateralForce: state.lateralForce,
      utilization: grip > 0
        ? Math.hypot(longitudinalForce, state.lateralForce) / grip
        : 0
    };
  }

  window.GameModules = window.GameModules || {};
  window.GameModules.vehiclePhysics = {
    aeroPresets: AERO_PRESETS,
    aerodynamics: { compute: computeAerodynamics },
    suspension: {
      createState: createSuspensionState,
      step: computeSuspensionStep
    },
    tires: {
      temperatureConfig: TIRE_TEMPERATURE,
      computeAxleGrip,
      computeAxleLongitudinalForce,
      computeLateralCapacity,
      lateralTireForce,
      longitudinalTireForce,
      temperatureGrip,
      updateTemperature: updateTireTemperature,
      stepWheel: stepWheelTire
    }
  };
})();
