(function() {
  const SPEC = Object.freeze({
    displacementCc: 3902,
    ratedPowerCv: 600,
    ratedPowerRpm: 7000,
    maximumTorqueNm: 700,
    maximumTorqueRpm: 6000
  });
  const CV_TO_WATTS = 735.49875;
  const ratedPowerWatts = SPEC.ratedPowerCv * CV_TO_WATTS;
  const ratedTorqueNm = ratedPowerWatts / (SPEC.ratedPowerRpm * 2 * Math.PI / 60);

  function torqueAtRpm(rpm) {
    const speed = Math.max(0, rpm);
    if (speed < 1500) return 420 + 0.12 * speed;
    if (speed < 3500) return 600;
    if (speed < 5500) return 600 + 0.045 * (speed - 3500);
    if (speed < SPEC.maximumTorqueRpm) {
      return 690 + 0.02 * (speed - 5500);
    }
    if (speed < SPEC.ratedPowerRpm) {
      const progress = (speed - SPEC.maximumTorqueRpm) / 1000;
      return SPEC.maximumTorqueNm
        - (SPEC.maximumTorqueNm - ratedTorqueNm) * progress ** 0.8;
    }
    return Math.max(0, ratedTorqueNm - 0.09 * (speed - SPEC.ratedPowerRpm));
  }

  function atRpm(rpm) {
    const torqueNm = torqueAtRpm(rpm);
    const powerWatts = torqueNm * Math.max(0, rpm) * 2 * Math.PI / 60;
    return { torqueNm, powerWatts };
  }

  window.GameModules = window.GameModules || {};
  window.GameModules.vehicleEngine = {
    spec: Object.freeze({ ...SPEC, ratedPowerWatts, ratedTorqueNm }),
    atRpm
  };
})();
