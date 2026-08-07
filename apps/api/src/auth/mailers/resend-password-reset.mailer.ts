import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordResetEmail, PasswordResetMailer } from './password-reset-mailer.interface';

@Injectable()
export class ResendPasswordResetMailer implements PasswordResetMailer {
  readonly name = 'RESEND';

  constructor(private readonly configService: ConfigService) {}

  async send(email: PasswordResetEmail): Promise<void> {
    const apiKey = this.configService.getOrThrow<string>('RESEND_API_KEY');
    const from = this.configService.getOrThrow<string>('RESEND_FROM_EMAIL');
    const ttlMinutes = this.configService.getOrThrow<number>('PASSWORD_RESET_TOKEN_TTL_MINUTES');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: email.recipientEmail,
        subject: 'Reset your Mezzo password',
        text: [
          'Someone asked to reset the password on your Mezzo account.',
          '',
          `Open this link to choose a new one: ${email.resetUrl}`,
          '',
          `The link expires in ${ttlMinutes} minutes and can only be used once.`,
          'If this was not you, ignore this email — your password stays as it is.',
        ].join('\n'),
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend password reset delivery failed with status ${response.status}`);
    }
  }
}
