import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KycProvider, KycSubmissionRequest, KycSubmissionResult } from './kyc-provider.interface';

interface DojahVerificationResponse {
  reference_id: string;
}

@Injectable()
export class DojahKycProvider implements KycProvider {
  readonly name = 'DOJAH';

  private readonly logger = new Logger(DojahKycProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async submit(request: KycSubmissionRequest): Promise<KycSubmissionResult> {
    const baseUrl = this.configService.getOrThrow<string>('DOJAH_BASE_URL');
    const appId = this.configService.getOrThrow<string>('DOJAH_APP_ID');
    const privateKey = this.configService.getOrThrow<string>('DOJAH_PRIVATE_KEY');

    const response = await fetch(`${baseUrl}/api/v1/kyc/verifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        AppId: appId,
        Authorization: privateKey,
      },
      body: JSON.stringify({ user_id: request.userId, tier: request.tier }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(
        `Dojah verification request failed (${response.status} ${response.statusText}): ${body.slice(0, 500)}`,
      );
      throw new ServiceUnavailableException('KYC verification request failed');
    }

    const payload = (await response.json()) as DojahVerificationResponse;
    return { providerReference: payload.reference_id };
  }
}
