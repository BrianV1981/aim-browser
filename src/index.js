export { AimBrowser } from './cdp-client.js';
import { checkDaemonAsync, startDaemonAsync, stopDaemonAsync } from './daemon.js';

export function runDaemonScript(scriptName, extraEnv = {}) {
  throw new Error("runDaemonScript is deprecated. Use the async daemon functions.");
}

export function startDaemon(opts = {}) {
  throw new Error("startDaemon (sync) is deprecated. Use await startDaemonAsync(opts).");
}

export function stopDaemon() {
  throw new Error("stopDaemon (sync) is deprecated. Use await stopDaemonAsync().");
}

export function checkDaemon() {
  throw new Error("checkDaemon (sync) is deprecated. Use await checkDaemonAsync().");
}

export { checkDaemonAsync, startDaemonAsync, stopDaemonAsync };
export {
  acquireTabLease,
  detectCallerSession,
  emitHudEvent,
  readHudEvent,
  readLeases,
  releaseTabLease,
  resolveStateDir,
  syncLeasesWithTargets,
} from './tab-leases.js';
export {
  actOnLandmark,
  checkElementOcclusion,
  checkLayoutHealth,
  domainToMapPath,
  inspectInteractiveElements,
  loadSiteMap,
  normalizeDomainKey,
  recordLandmark,
  resolveMappedLandmark,
  resolveMapsDir,
  saveSiteMap,
  scoreAnchorMatch,
} from './site-maps.js';
