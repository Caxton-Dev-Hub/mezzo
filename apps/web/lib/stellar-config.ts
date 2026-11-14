import type { StellarRailConfigResponse } from '@mezzo/shared-types';

export type StellarRailMode = 'live' | 'coming-soon';

export function stellarRailMode(config: StellarRailConfigResponse | undefined): StellarRailMode {
  return config?.enabled ? 'live' : 'coming-soon';
}
