import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StellarAsset, StellarNetworkName } from '@mezzo/shared-types';
import { STELLAR_NETWORK, StellarNetworkClient } from './providers/stellar-network.interface';
import { StellarRailDisabledError } from './errors/stellar-rail-disabled.error';

@Injectable()
export class StellarConfigService {
  private readonly enabled: boolean;

  constructor(
    configService: ConfigService,
    @Inject(STELLAR_NETWORK) private readonly network: StellarNetworkClient,
  ) {
    this.enabled = configService.getOrThrow<string>('STELLAR_MODE') !== 'off';
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  assertEnabled(): void {
    if (!this.enabled) {
      throw new StellarRailDisabledError();
    }
  }

  get networkName(): StellarNetworkName {
    return this.network.name;
  }

  get asset(): StellarAsset | null {
    return this.enabled ? this.network.asset : null;
  }
}
