/**
 * Re-export WorldMap from the shared module.
 * The implementation lives in shared/WorldMap.js so both client and server
 * can import it identically. This file exists for backward compatibility —
 * existing client code can continue importing from './WorldMap.js'.
 */
export { WorldMap } from '../../shared/WorldMap.js';
