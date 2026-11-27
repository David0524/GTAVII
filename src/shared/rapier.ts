/**
 * The ONE import point for Rapier (engine notice E13). Every stream imports RAPIER from here, never from the
 * package: two wasm instances cannot share a physics world, and the planned switch from the compat build
 * (wasm inlined as base64, ~80% of the download) to the streamed non-compat build is a one-line change here.
 */
import RAPIER from '@dimforge/rapier3d-compat';
export default RAPIER;
export { RAPIER };
