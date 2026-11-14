const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '../game_modes.html'), 'utf8');
const gameScript = fs.readFileSync(path.join(__dirname, '../js/game_modes.js'), 'utf8');

test('vehicle modules load before the game orchestrator', () => {
  const gameScript = html.indexOf('./js/game_modes.js');
  for (const modulePath of [
    './js/track-course.js',
    './js/vehicle-physics.js',
    './js/vehicle-transmission.js',
    './js/vehicle-controls.js'
  ]) {
    const moduleScript = html.indexOf(modulePath);
    assert.notEqual(moduleScript, -1, `${modulePath} is loaded`);
    assert.ok(moduleScript < gameScript, `${modulePath} loads before game_modes.js`);
  }
});

test('all selectable aero presets are exposed in the menu', () => {
  for (const preset of ['downforce', 'balanced', 'lowDrag']) {
    assert.match(html, new RegExp(`<option value="${preset}"`));
  }
});

test('track materials are wired to the weather-level update', () => {
  assert.match(gameScript, /groundMaterial\s*:\s*gndMat/);
  assert.match(gameScript, /trackMaterial\s*:\s*trackMat/);
});
