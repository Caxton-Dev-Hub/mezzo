export interface EmailVerificationEmail {
  recipientEmail: string;
  code: string;
}

export interface EmailVerificationMailer {
  readonly name: string;
  send(email: EmailVerificationEmail): Promise<void>;
}

export const EMAIL_VERIFICATION_MAILER = Symbol('EMAIL_VERIFICATION_MAILER');
