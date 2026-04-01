/**
 * NOBRIDGE uses JSI TimerManager: `clearTimeout` can throw "clearTimeout called with an invalid handle"
 * (e.g. negative handle) from RN C++. A one-time JS wrap is not enough — RN overwrites globals after load.
 * Re-patch on microtask + delayed ticks so we wrap the final native implementation and swallow that error.
 */
const OUTER_MARK = Symbol.for('mulligan.timerClear.outer');

function swallowInvalidHandle(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /invalid handle/i.test(msg);
}

function patchGlobalClear(name: 'clearTimeout' | 'clearInterval'): void {
  const current = globalThis[name];
  if (typeof current !== 'function') return;
  if ((current as unknown as { [k: symbol]: boolean })[OUTER_MARK]) return;

  const inner = current.bind(globalThis);
  const outer = Object.assign(
    function mulliganSafeClear(handle: unknown) {
      try {
        return inner(handle);
      } catch (e) {
        if (swallowInvalidHandle(e)) return undefined;
        throw e;
      }
    },
    { [OUTER_MARK]: true }
  );
  (globalThis as unknown as Record<string, unknown>)[name] = outer as unknown;
}

export function installHermesTimerPatches(): void {
  patchGlobalClear('clearTimeout');
  patchGlobalClear('clearInterval');
}

let scheduled = false;
function scheduleRePatches(): void {
  if (scheduled) return;
  scheduled = true;
  const run = () => {
    installHermesTimerPatches();
  };
  queueMicrotask(run);
  for (const ms of [0, 1, 5, 10, 25, 50, 100, 250, 500]) {
    setTimeout(run, ms);
  }
}

installHermesTimerPatches();
scheduleRePatches();
