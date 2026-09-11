export type StellarRailMode = 'live' | 'coming-soon';

export function stellarRailMode(): StellarRailMode {
  return process.env.NEXT_PUBLIC_STELLAR_MODE === 'live' ? 'live' : 'coming-soon';
}
