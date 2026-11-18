'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { verifyEmail, resendVerification } from '@/lib/api-client';

const verifyEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().length(6, 'Code must be 6 characters'),
});

type VerifyEmailForm = z.infer<typeof verifyEmailSchema>;

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get('email');
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    getValues,
  } = useForm<VerifyEmailForm>({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: {
      email: emailParam || '',
      code: '',
    },
  });

  useEffect(() => {
    if (emailParam) {
      setValue('email', emailParam);
    }
  }, [emailParam, setValue]);

  // Load cooldown from localStorage on mount (keyed by email for cross-session persistence)
  useEffect(() => {
    const email = emailParam || '';
    if (!email) return;

    const cooldownKey = `resendCooldown:${email}`;
    const storedExpiry = localStorage.getItem(cooldownKey);
    if (storedExpiry) {
      const expiryTime = parseInt(storedExpiry, 10);
      const now = Date.now();
      if (expiryTime > now) {
        const remainingSeconds = Math.ceil((expiryTime - now) / 1000);
        setResendCooldown(remainingSeconds);
      } else {
        localStorage.removeItem(cooldownKey);
      }
    }
  }, [emailParam]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (resendCooldown === 0 && emailParam) {
      const cooldownKey = `resendCooldown:${emailParam}`;
      localStorage.removeItem(cooldownKey);
    }
    return undefined;
  }, [resendCooldown, emailParam]);

  const onSubmit = async (data: VerifyEmailForm) => {
    try {
      setError(null);
      await verifyEmail({ email: data.email, code: data.code });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    }
  };

  const handleResend = async () => {
    const email = getValues('email');
    if (!email) {
      setResendStatus('error');
      setResendMessage('Please enter your email address');
      return;
    }

    try {
      setResendStatus('idle');
      setResendMessage(null);
      await resendVerification({ email });
      setResendStatus('success');
      setResendMessage('Verification code sent to your email');
      const expiryTime = Date.now() + 30000; // 30 seconds from now
      const cooldownKey = `resendCooldown:${email}`;
      localStorage.setItem(cooldownKey, expiryTime.toString());
      setResendCooldown(30);
    } catch (err) {
      setResendStatus('error');
      setResendMessage(err instanceof Error ? err.message : 'Failed to resend code');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="font-display text-3xl">
            Mezzo Charge
          </Link>
          <h1 className="text-2xl font-medium mt-4">Verify your email</h1>
          <p className="text-fog mt-2">
            We sent a 6-digit code to your email address
          </p>
        </div>

        <div className="bg-surface rounded-2xl shadow-card p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {error && (
              <div className="bg-danger/10 border border-danger/20 rounded-lg p-4 text-sm text-danger">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-mint/10 border border-mint/20 rounded-lg p-4 text-sm text-mint">
                <p className="mb-3">Email verified successfully!</p>
                <button
                  type="button"
                  onClick={() => router.push('/login?verified=true')}
                  className="w-full px-4 py-2 bg-mint text-white font-medium rounded-lg hover:bg-mint-deep transition-colors"
                >
                  Continue to Login
                </button>
              </div>
            )}

            {resendMessage && (
              <div className={`${
                resendStatus === 'success'
                  ? 'bg-mint/10 border-mint/20 text-mint'
                  : 'bg-danger/10 border-danger/20 text-danger'
              } border rounded-lg p-4 text-sm`}>
                {resendMessage}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email
              </label>
              <input
                {...register('email')}
                id="email"
                type="email"
                autoComplete="email"
                className="w-full px-4 py-3 bg-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-mint focus:border-transparent"
              />
              {errors.email && (
                <p className="mt-2 text-sm text-danger">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="code" className="block text-sm font-medium mb-2">
                Verification Code
              </label>
              <input
                {...register('code')}
                id="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                autoComplete="one-time-code"
                className="w-full px-4 py-3 bg-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-mint focus:border-transparent text-center text-2xl tracking-widest font-mono"
              />
              {errors.code && (
                <p className="mt-2 text-sm text-danger">{errors.code.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || success}
              className="w-full px-6 py-3 bg-mint text-white font-medium rounded-lg hover:bg-mint-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-mint"
            >
              {isSubmitting ? 'Verifying...' : success ? 'Verified!' : 'Verify Email'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0}
              className="text-sm text-mint hover:text-mint-deep font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resendCooldown > 0
                ? `Resend code (${resendCooldown}s)`
                : "Didn't receive a code? Resend"}
            </button>
          </div>

          <div className="mt-6 text-center text-sm">
            <Link href="/login" className="text-fog hover:text-mint">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
