// format.js
// Text formatting only. Nothing is calculated or decided here: every number comes from the backend.

export function formatDuration(totalSec) {
  if (!totalSec || totalSec < 0) return '0m 00s';
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

// "3 ambulances", "1 fire engine"
export function unitLabel(type, n = 1) {
  const base = type === 'fire' ? 'fire engine' : type === 'medical' || type === 'accident' ? 'ambulance' : 'police unit';
  return `${n} ${base}${n === 1 ? '' : 's'}`;
}

// The backend sends `elapsedSeconds` (how long the unit has been on its way) with every update.
// Between two updates the screen only keeps that number ticking, so the countdown looks smooth.
export function liveElapsed(e) {
  if (!e || !e.totalSeconds) return 0;
  if (e.displayStatus === 'ON SCENE') return e.totalSeconds;
  const sinceReceived = (Date.now() - (e.receivedAt ?? Date.now())) / 1000;
  return Math.min(e.totalSeconds, (e.elapsedSeconds || 0) + sinceReceived);
}
