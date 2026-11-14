(function() {
  function shuffledGrid(participants, random = Math.random) {
    const grid = participants.slice();
    for (let index = grid.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(random() * (index + 1));
      [grid[index], grid[swapIndex]] = [grid[swapIndex], grid[index]];
    }
    return grid;
  }

  function qualifyingGridPositions(grid, spacingMeters) {
    return new Map(grid.map((driver,index)=>[driver,index===0?0:-index*spacingMeters]));
  }

  function formationControls(speed, targetSpeed, gap, aheadSpeed, config) {
    const closingSpeed = Math.max(0, speed - aheadSpeed);
    const minimumGap = config.minimumGap + closingSpeed * config.timeHeadway;
    const gapLimitedSpeed = aheadSpeed + (gap - minimumGap) / config.timeHeadway;
    const safeTargetSpeed = Math.max(0, Math.min(targetSpeed, gapLimitedSpeed));
    const speedError = safeTargetSpeed - speed;
    const throttle = speedError > 0
      ? Math.min(1, speedError / config.acceleration)
      : 0;
    const brake = speedError < 0
      ? Math.min(1, -speedError / config.deceleration)
      : 0;
    return { targetSpeed: safeTargetSpeed, throttle, brake };
  }

  window.GameModules = window.GameModules || {};
  window.GameModules.eventRules = { shuffledGrid, qualifyingGridPositions, formationControls };
})();
