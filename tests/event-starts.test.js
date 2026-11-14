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

test('qualifying release times follow randomized grid order at exact 20-second intervals', () => {
  const grid = rules.shuffledGrid(['PLAYER', 'ai-1', 'ai-2', 'ai-3'], () => 0);
  const schedule = rules.qualifyingSchedule(grid, 20);
  assert.equal(schedule.get(grid[0]), 0);
  assert.equal(schedule.get(grid[1]), 20);
  assert.equal(schedule.get(grid[2]), 40);
  assert.equal(schedule.get(grid[3]), 60);
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

test('AI visuals and collision bounds use the same world dimensions as the player', () => {
  assert.match(gameSource, /PLAYER_WORLD_WIDTH=1\.95\*PLAYER_BODY_SCALE/);
  assert.match(gameSource, /PLAYER_WORLD_LENGTH=4\.5\*PLAYER_BODY_SCALE/);
  assert.match(gameSource, /index,width:PLAYER_WORLD_WIDTH,length:PLAYER_WORLD_LENGTH/);
  assert.match(gameSource, /const group=createVehicleModel\(driver\.color\)/);
});

test('qualifying start times are assigned from each randomized position', () => {
  assert.match(gameSource, /const grid=fromWeekendQualifying&&weekendQualOrder\.length\s*\?weekendQualOrder:eventRules\.shuffledGrid\(defaultGrid\)/);
  assert.match(gameSource, /ai\.startAt=eventStage==='qualifying'\?qualifyingStartTimes\.get\(ai\.id\):0/);
  assert.match(gameSource, /playerQualifyingStartAt=qualifyingStartTimes\.get\('PLAYER'\)/);
});
