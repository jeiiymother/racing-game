window.GameModules = window.GameModules || {};
window.GameModules.createOperationLogger = function({
  getState,
  documentRef,
  navigatorRef,
  performanceRef
}) {
  let currentLog = null;
  let completedLogs = [];
  let sampleAccumulator = 0;
  let runId = 0;

  function updateControls() {
    const button = documentRef.getElementById('btnExportLog');
    const status = documentRef.getElementById('logStatus');
    if (!button || !status) return;

    const latest = completedLogs[completedLogs.length - 1];
    button.disabled = !latest;
    button.textContent = latest
      ? `📋 复制上场操作日志 (${latest.samples.length} 条)`
      : '📋 复制上一场操作日志';
    if (currentLog) {
      status.textContent = '本场操作记录中；返回主菜单后可复制导出。';
    } else if (latest) {
      status.textContent = `已保存最近一场：${latest.mode} · ${latest.samples.length} 条采样 · 暂不包含回放。`;
    } else {
      status.textContent = '驾驶输入会以 5Hz 记录；不包含回放视频。';
    };
  }

  function elapsedSeconds() {
    return currentLog
      ? Math.max(0, (performanceRef.now() - currentLog.clockStart) / 1000)
      : 0;
  }

  function action(actionName, detail = {}) {
    if (!currentLog) return;
    currentLog.events.push({
      t: Number(elapsedSeconds().toFixed(2)),
      action: actionName,
      ...detail
    });
  }

  function start(label) {
    if (currentLog) finish();
    const state = getState();
    currentLog = {
      id: `run-${++runId}`,
      mode: label,
      track: 'Silverstone GP',
      surface: state.wet ? 'wet' : 'dry',
      damageEnabled: state.damageEnabled,
      vehicle: 'Ferrari 488 GT3',
      sampleRateHz: 5,
      startedAt: new Date().toISOString(),
      clockStart: performanceRef.now(),
      settings: {
        setup: state.setup,
        aeroSetup: state.aeroSetup,
        tcs: state.tcs,
        abs: state.abs
      },
      events: [],
      samples: []
    };
    sampleAccumulator = 0;
    action('session-start');
    updateControls();
  }

  function finish() {
    if (!currentLog) return;
    const state = getState();
    const log = currentLog;
    log.endedAt = new Date().toISOString();
    log.summary = {
      durationSeconds: Number(elapsedSeconds().toFixed(2)),
      samples: log.samples.length,
      bestLap: state.playerBest || state.previousLap || 0,
      tireWear: Number((100 - state.vehicleState.tireWear).toFixed(1)),
      damage: Number((state.playerDamage * 100).toFixed(1)),
      completedLaps: state.eventLaps
    };
    delete log.clockStart;
    completedLogs.push(log);
    if (completedLogs.length > 5) completedLogs.shift();
    currentLog = null;
    updateControls();
  }

  function sample(dt) {
    if (!currentLog) return;
    sampleAccumulator += dt;
    if (sampleAccumulator < 0.2) return;
    sampleAccumulator %= 0.2;

    const state = getState();
    const round = (value, places = 2) => Number(value.toFixed(places));
    currentLog.samples.push([
      round(elapsedSeconds()),
      round(state.car.position.x, 1),
      round(state.car.position.z, 1),
      round(state.vehicleState.heading),
      round(Math.hypot(state.vehicleState.vf, state.vehicleState.vl), 1),
      round(state.vehicleState.steer),
      round(state.mouse.thr),
      round(state.mouse.brk),
      state.vehicleState.gear,
      round(state.vehicleState.tireWear, 1),
      round(state.playerDamage * 100, 1),
      state.tcs,
      state.abs
    ]);
  }

  async function exportLatest() {
    const log = completedLogs[completedLogs.length - 1];
    if (!log) return;
    const payload = JSON.stringify({
      schema: 'gt3-driver-operations/v1',
      columns: [
        'seconds', 'x_m', 'z_m', 'heading_rad', 'speed_mps',
        'steer_rad', 'throttle', 'brake', 'gear', 'tire_remaining_pct',
        'damage_pct', 'tcs', 'abs'
      ],
      ...log
    });
    const fallback = documentRef.getElementById('logCopyFallback');
    const status = documentRef.getElementById('logStatus');
    fallback.style.display = 'none';
    try {
      if (!navigatorRef.clipboard?.writeText) {
        throw new Error('当前页面没有可用的 Clipboard API');
      }
      await navigatorRef.clipboard.writeText(payload);
      status.textContent = `已复制 ${log.samples.length} 条操作采样到剪贴板。`;
      return;
    } catch (clipboardError) {
      fallback.value = payload;
      fallback.style.display = 'block';
      fallback.focus();
      fallback.select();
      try {
        if (documentRef.execCommand('copy')) {
          status.textContent = `Clipboard API 不可用，已通过兼容方式复制 ${log.samples.length} 条记录。`;
          return;
        }
        status.textContent = `自动复制失败：${clipboardError.message}。日志已放入文本框，请手动复制。`;
      } catch (fallbackError) {
        status.textContent = `复制失败：${clipboardError.message}；兼容复制错误：${fallbackError.message}。日志已放入文本框，请手动复制。`;
      }
    }
  }

  return {
    action,
    finish,
    isActive: () => currentLog !== null,
    exportLatest,
    sample,
    start,
    updateControls
  };
}
