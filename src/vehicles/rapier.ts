/**
 * The vehicles stream's single Rapier import point. When the engine's shared module lands
 * (ENGINE_RESPONSES E13: src/shared/rapier.ts, non-compat package, one wasm instance), change
 * the line below to re-export from '../shared/rapier' and drop the test lot's init() call.
 */
export { default } from '@dimforge/rapier3d-compat';
export * from '@dimforge/rapier3d-compat';
