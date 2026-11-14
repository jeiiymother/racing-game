(function() {
  const GRAVITY = 9.81;
  const TIRE_CURVE_SHAPE = { c: 1.3, e: -1.6 };

  const AERO_PRESETS = Object.freeze({
    downforce: Object.freeze({ label: '下压力优先', downforce: 1.22, drag: 1.14 }),
    balanced: Object.freeze({ label: '适中', downforce: 1, drag: 1 }),
    lowDrag: Object.freeze({ label: '低阻力', downforce: 0.78, drag: 0.88 })
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
    const pitchInertia = mass * wheelbase ** 2 * 0.18;
    const rollInertia = mass * (wheelbase ** 2 + trackWidth ** 2) * 0.1;

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
    const rollMoment = mass * input.lateralAcceleration * input.cgHeight;
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

  function computeLateralCapacity(totalGrip, longitudinalForce, slidingGripFraction = 0) {
    const ratio = Math.min(1, Math.abs(longitudinalForce) / Math.max(totalGrip, 1));
    const frictionEllipseCapacity = totalGrip * Math.sqrt(1 - ratio * ratio);
    return Math.max(frictionEllipseCapacity, totalGrip * slidingGripFraction);
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

  window.GameModules = window.GameModules || {};
  window.GameModules.vehiclePhysics = {
    aeroPresets: AERO_PRESETS,
    aerodynamics: { compute: computeAerodynamics },
    suspension: {
      createState: createSuspensionState,
      step: computeSuspensionStep
    },
    tires: {
      computeAxleGrip,
      computeAxleLongitudinalForce,
      computeLateralCapacity,
      lateralTireForce,
      longitudinalTireForce
    }
  };
})();
