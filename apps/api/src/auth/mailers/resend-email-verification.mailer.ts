import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailVerificationEmail,
  EmailVerificationMailer,
} from './email-verification-mailer.interface';

@Injectable()
export class ResendEmailVerificationMailer implements EmailVerificationMailer {
  readonly name = 'RESEND';

  constructor(private readonly configService: ConfigService) {}

  async send(email: EmailVerificationEmail): Promise<void> {
    const apiKey = this.configService.getOrThrow<string>('RESEND_API_KEY');
    const from = this.configService.getOrThrow<string>('RESEND_FROM_EMAIL');
    const ttlMinutes = this.configService.getOrThrow<number>('EMAIL_VERIFICATION_CODE_TTL_MINUTES');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: email.recipientEmail,
        subject: 'Verify your Mezzo email address',
        text: [
          'Welcome to Mezzo.',
          '',
          `Your verification code is: ${email.code}`,
          '',
          `This code expires in ${ttlMinutes} minutes and can only be used once.`,
          'If you did not create a Mezzo account, ignore this email.',
        ].join('\n'),
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend email verification delivery failed with status ${response.status}`);
    }
  }
}
