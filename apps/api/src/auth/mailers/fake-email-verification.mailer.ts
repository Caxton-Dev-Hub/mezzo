import { Injectable } from '@nestjs/common';
import {
  EmailVerificationEmail,
  EmailVerificationMailer,
} from './email-verification-mailer.interface';

@Injectable()
export class FakeEmailVerificationMailer implements EmailVerificationMailer {
  readonly name = 'FAKE';
  readonly sent: EmailVerificationEmail[] = [];

  send(email: EmailVerificationEmail): Promise<void> {
    this.sent.push(email);
    return Promise.resolve();
  }
}
