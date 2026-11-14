(function() {
  function computeAeroLoads(speed, airDensity, referenceArea, frontShare, wetFactor) {
    const dynamicPressure = 0.5 * airDensity * speed * speed;
    const total = dynamicPressure * referenceArea * wetFactor;
    return {
      front: total * frontShare,
      rear: total * (1 - frontShare),
      total
    };
  }

  function computeLoadTransfer(mass, acceleration, cgHeight, supportWidth) {
    return mass * acceleration * cgHeight / supportWidth;
  }

  function computeLateralWheelLoads(axleLoad, axleLoadTransfer) {
    const transfer = Math.min(Math.abs(axleLoadTransfer), Math.max(0, axleLoad - 200));
    const direction = Math.sign(axleLoadTransfer);
    const left = Math.max(100, axleLoad * 0.5 - direction * transfer * 0.5);
    const right = Math.max(100, axleLoad * 0.5 + direction * transfer * 0.5);
    return [left, right];
  }

  function computeAxleGrip(wheelLoads, frictionCoefficient, referenceWheelLoad, loadSensitivity) {
    return wheelLoads.reduce((capacity, load) => {
      const normalizedLoad = Math.max(1, load) / referenceWheelLoad;
      return capacity + frictionCoefficient * load * Math.pow(normalizedLoad, -loadSensitivity);
    }, 0);
  }

  function computeLateralCapacity(totalGrip, longitudinalForce) {
    const ratio = Math.min(1, Math.abs(longitudinalForce) / Math.max(totalGrip, 1));
    return totalGrip * Math.sqrt(1 - ratio * ratio);
  }

  function lateralTireForce(slipAngle, lateralCapacity, corneringStiffness) {
    if (lateralCapacity <= 0 || corneringStiffness <= 0) return 0;
    return -lateralCapacity * Math.tanh(corneringStiffness * slipAngle / lateralCapacity);
  }

  window.GameModules = window.GameModules || {};
  window.GameModules.vehiclePhysics = {
    computeAeroLoads,
    computeAxleGrip,
    computeLateralCapacity,
    computeLateralWheelLoads,
    computeLoadTransfer,
    lateralTireForce
  };
})();
