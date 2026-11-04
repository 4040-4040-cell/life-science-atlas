import registerJson from '../../client/src/lib/baselAvailabilityRegisterV1.json';
import type { BaselAvailabilityRegister } from '../../shared/baselAvailability';

function freezeJson<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeJson);
    Object.freeze(value);
  }
  return value;
}

/** Immutable imported companion; no database fallback, master writes or file-system reads. */
const register = freezeJson(registerJson as unknown as BaselAvailabilityRegister);
export function getBaselAvailabilityRegister(): BaselAvailabilityRegister {
  return register;
}
