/** Marker string the verify script looks for inside the emitted bundle. */
export const LOGGING_MARKER = 'logging: compiled into the bundle';

export function label(scope: string): string {
  return `[${scope}]`;
}
