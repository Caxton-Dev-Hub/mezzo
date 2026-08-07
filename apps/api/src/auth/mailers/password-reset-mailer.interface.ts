export interface PasswordResetEmail {
  recipientEmail: string;
  resetUrl: string;
}

export interface PasswordResetMailer {
  readonly name: string;
  send(email: PasswordResetEmail): Promise<void>;
}

export const PASSWORD_RESET_MAILER = Symbol('PASSWORD_RESET_MAILER');
