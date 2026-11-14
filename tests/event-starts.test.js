const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({ window: {} });
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '../js/event-rules.js'), 'utf8'),
  context
);
const rules = context.window.GameModules.eventRules;
const gameSource = fs.readFileSync(path.join(__dirname, '../js/game_modes.js'), 'utf8');

test('qualifying grid positions follow randomized order at exact 100-meter intervals', () => {
  const grid = rules.shuffledGrid(['PLAYER', 'ai-1', 'ai-2', 'ai-3'], () => 0);
  const positions = rules.qualifyingGridPositions(grid, 100);
  assert.equal(positions.get(grid[0]), 0);
  assert.equal(positions.get(grid[1]), -100);
  assert.equal(positions.get(grid[2]), -200);
  assert.equal(positions.get(grid[3]), -300);
  assert.equal(grid.includes('PLAYER'), true);
});

test('formation control brakes when a car is closing too quickly on the car ahead', () => {
  const control = rules.formationControls(30, 27.8, 8, 20, {
    minimumGap: 7,
    timeHeadway: 1.5,
    acceleration: 5.5,
    deceleration: 8
  });
  assert.equal(control.throttle, 0);
  assert.ok(control.brake > 0);
  assert.ok(control.targetSpeed < 20);
});

test('formation control accelerates toward speed only with adequate headway', () => {
  const control = rules.formationControls(12, 27.8, 60, 25, {
    minimumGap: 7,
    timeHeadway: 1.5,
    acceleration: 5.5,
    deceleration: 8
  });
  assert.ok(control.throttle > 0);
  assert.equal(control.brake, 0);
  assert.equal(control.targetSpeed, 27.8);
});

test('race events start their clock and formation without waiting for player input', () => {
  assert.match(gameSource, /raceStartState=eventStage==='race'\?'formation':'none'/);
  assert.match(gameSource, /timerOn=true;elapsed=0;lapStart=0/);
  assert.match(gameSource, /updateFormationAutoPilot\(\);\s*updPlayer\(dt,now\)/);
});

test('race green flag does not count the same start-line crossing as a completed lap', () => {
  assert.match(gameSource, /raceGreenJustFlagged=true/);
  assert.match(gameSource, /lapCheck\(count,skipCurrentLine=false\)/);
  assert.match(gameSource, /if\(!count\|\|skipCurrentLine\)return/);
});

test('manual steering does not disable automatic throttle during the formation lap', () => {
  assert.match(gameSource, /formationAutoThrottle=formationActive&&ms\.thr===0&&ms\.brk===0/);
  assert.match(gameSource, /formationAutoSteering=formationActive&&!keys\.a&&!keys\.d&&!keys\.w/);
  assert.match(gameSource, /effectiveThrottle\(\)\{return formationAutoThrottle\?formationThrottle:ms\.thr;\}/);
});

test('player tire temperature step reads lateral slip speed from the wheel state', () => {
  assert.match(gameSource, /lateralForce:result\.lateralForce,lateralSlipSpeed:lateralSpeed/);
});

test('A and D inputs steer left and right in the tire coordinate frame', () => {
  assert.match(gameSource, /tapSteering\(u\.steer,-1,STEERING_CONFIG\)/);
  assert.match(gameSource, /tapSteering\(u\.steer,1,STEERING_CONFIG\)/);
});

test('AI visuals and collision bounds use the same world dimensions as the player', () => {
  assert.match(gameSource, /PLAYER_WORLD_WIDTH=1\.95\*PLAYER_BODY_SCALE/);
  assert.match(gameSource, /PLAYER_WORLD_LENGTH=4\.5\*PLAYER_BODY_SCALE/);
  assert.match(gameSource, /index,width:PLAYER_WORLD_WIDTH,length:PLAYER_WORLD_LENGTH/);
  assert.match(gameSource, /const group=createVehicleModel\(driver\.color\)/);
});

test('qualifying cars are spaced on the grid and start together', () => {
  assert.match(gameSource, /const grid=fromWeekendQualifying&&weekendQualOrder\.length\s*\?weekendQualOrder:eventRules\.shuffledGrid\(defaultGrid\)/);
  assert.match(gameSource, /qualifyingGridPositions=eventRules\.qualifyingGridPositions\(grid,QUALIFYING_GRID_SPACING\)/);
  assert.match(gameSource, /QUALIFYING_GRID_SPACING=100/);
  assert.match(gameSource, /ai\.started=true/);
  assert.match(gameSource, /ai\.raceStarted=false;ai\.mesh\.visible=true/);
  assert.match(gameSource, /qualifying-line-crossing/);
  assert.match(gameSource, /qualifyingGridPositions\.get\('PLAYER'\)===0/);
  assert.doesNotMatch(gameSource, /eventStage==='qualifying'&&!playerQualifyingStarted\)return 0/);
  assert.doesNotMatch(gameSource, /qualifyingStartTimes|playerQualifyingStartAt|qualifyingSchedule/);
});

test('active traction control preserves lateral tire capacity while allocating drive force', () => {
  assert.match(gameSource, /const wetTireScale=WET\?0\.85:1/);
  assert.match(gameSource, /\[load\],mu\*wetTireScale\*SU\.camberGripRear/);
  assert.match(gameSource, /tires\.computeLateralCapacity\(\s*tireGrip,u\._wheelStates\[index\+2\]\.lateralForce\s*\)/);
  assert.match(gameSource, /const driveLimit=TCS_LVL>0\?rearDriveCapacity\*TCS_FRAC\[TCS_LVL\]:Infinity/);
});
