import { ConfigService } from '@nestjs/config';
import { StellarNetworkClient } from './providers/stellar-network.interface';
import { StellarConfigService } from './stellar-config.service';

const liveNetwork = { name: 'testnet' } as unknown as StellarNetworkClient;
const simulatedNetwork = {
  name: 'simulated',
  receivePayment: jest.fn(),
} as unknown as StellarNetworkClient;

function build(mode: string, network: StellarNetworkClient): StellarConfigService {
  const configService = { getOrThrow: jest.fn().mockReturnValue(mode) } as unknown as ConfigService;
  return new StellarConfigService(configService, network);
}

describe('StellarConfigService.isSimulated', () => {
  it('is true when the rail is on and backed by the simulated network', () => {
    expect(build('simulated', simulatedNetwork).isSimulated()).toBe(true);
  });

  it('is false when the rail is on and backed by a real network', () => {
    expect(build('live', liveNetwork).isSimulated()).toBe(false);
  });

  it('is false when the rail is off, even with the simulated network wired in', () => {
    expect(build('off', simulatedNetwork).isSimulated()).toBe(false);
  });
});
