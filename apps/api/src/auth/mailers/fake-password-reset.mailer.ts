import { Injectable } from '@nestjs/common';
import { PasswordResetEmail, PasswordResetMailer } from './password-reset-mailer.interface';

@Injectable()
export class FakePasswordResetMailer implements PasswordResetMailer {
  readonly name = 'FAKE';
  readonly sent: PasswordResetEmail[] = [];

  send(email: PasswordResetEmail): Promise<void> {
    this.sent.push(email);
    return Promise.resolve();
  }
}
