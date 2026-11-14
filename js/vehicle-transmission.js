(function() {
  function ratioForGear(gear, config) {
    if (gear === 0) return config.reverseRatio * config.finalDrive;
    return config.gearRatios[gear - 1] * config.finalDrive;
  }

  function beginShift(state, nextGear, config, duration = config.shiftDuration) {
    state.shiftStartRpm = state.rpm;
    state.shiftElapsed = 0;
    state.shiftDuration = duration;
    state.shiftT = duration;
    state.shiftCooldown = duration + (config.shiftLockoutDuration || 0);
    state.gear = nextGear;
    state._shiftTorqueFactor = 0;
  }

  function requestGear(state, nextGear, config) {
    if (nextGear < 0 || nextGear > config.gearRatios.length
      || nextGear === state.gear || state.shiftT > 0 || state.shiftCooldown > 0) return false;
    beginShift(state, nextGear, config);
    return true;
  }

  function update(state, dt, speed, throttle, config) {
    const wheelRpmFactor = 60 / (2 * Math.PI * config.wheelRadius);
    const speedMagnitude = Math.abs(speed);
    state.shiftCooldown = Math.max(0, (state.shiftCooldown || 0) - dt);
    if (state.shiftT > 0) {
      state.shiftElapsed = Math.min(state.shiftDuration, state.shiftElapsed + dt);
      const progress = state.shiftDuration
        ? state.shiftElapsed / state.shiftDuration
        : 1;
      const sync = progress * progress * (3 - 2 * progress);
      const coupledRpm = speedMagnitude * wheelRpmFactor * ratioForGear(state.gear, config);
      state.rpm = state.shiftStartRpm + (Math.max(config.idleRpm, coupledRpm) - state.shiftStartRpm) * sync;
      state.shiftT = Math.max(0, state.shiftDuration - state.shiftElapsed);
      const cutProgress = config.torqueCutFraction;
      state._shiftTorqueFactor = progress <= cutProgress
        ? 0
        : Math.min(1, (progress - cutProgress) / config.torqueRecoveryFraction);
      if (state.shiftT === 0) state._shiftTorqueFactor = 1;
      return state._shiftTorqueFactor;
    }

    state._shiftTorqueFactor = 1;
    state.rpm = Math.max(
      config.idleRpm,
      speedMagnitude * wheelRpmFactor * ratioForGear(state.gear, config)
    );
    if (state.gear === 0) return 1;
    if (state.shiftCooldown > 0) return 1;

    if (state.gear < config.gearRatios.length && state.rpm >= config.shiftUpRpm) {
      beginShift(state, state.gear + 1, config);
      return 0;
    }
    if (state.gear > 1) {
      const nextGearRpm = speedMagnitude * wheelRpmFactor
        * ratioForGear(state.gear - 1, config);
      const safeDownshift = nextGearRpm < config.maximumDownshiftRpm
        && nextGearRpm <= config.downshiftTargetMaxRpm;
      const kickdown = throttle >= config.kickdownThrottle
        && state.rpm <= config.kickdownRpm
        && nextGearRpm >= config.kickdownTargetMinRpm
        && nextGearRpm <= config.kickdownTargetMaxRpm;
      if (safeDownshift && (state.rpm < config.shiftDownRpm || kickdown)) {
        beginShift(state, state.gear - 1, config);
        return 0;
      }
    }
    return 1;
  }

  window.GameModules = window.GameModules || {};
  window.GameModules.vehicleTransmission = {
    ratioForGear,
    requestGear,
    update
  };
})();
