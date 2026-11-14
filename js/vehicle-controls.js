(function() {
  function stepSteering(steeringWheelAngle, keys, dt, config) {
    if (keys.w || (keys.a && keys.d)) return steeringWheelAngle;
    const rate = config.turnRateDegrees * Math.PI / 180;
    if (keys.a) steeringWheelAngle += rate * dt;
    else if (keys.d) steeringWheelAngle -= rate * dt;
    else {
      const returnStep = config.returnRateDegrees * Math.PI / 180 * dt;
      steeringWheelAngle = Math.abs(steeringWheelAngle) <= returnStep
        ? 0
        : steeringWheelAngle - Math.sign(steeringWheelAngle) * returnStep;
    }
    return Math.max(-config.maximumAngle, Math.min(config.maximumAngle, steeringWheelAngle));
  }

  function tapSteering(steeringWheelAngle, direction, config) {
    const threshold = config.tapThresholdDegrees * Math.PI / 180;
    const increment = Math.abs(steeringWheelAngle) > threshold
      ? config.repeatTapDegrees
      : config.initialTapDegrees;
    const nextAngle = steeringWheelAngle + Math.sign(direction) * increment * Math.PI / 180;
    return Math.max(-config.maximumAngle, Math.min(config.maximumAngle, nextAngle));
  }

  window.GameModules = window.GameModules || {};
  window.GameModules.vehicleControls = { stepSteering, tapSteering };
})();
