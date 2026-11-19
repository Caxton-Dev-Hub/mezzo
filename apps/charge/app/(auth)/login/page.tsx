'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { login, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('verified') === 'true') {
      setSuccessMessage('Email verified! You can now log in.');
    }
  }, [searchParams]);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      setError(null);
      setSuccessMessage(null);
      const response = await login(data);
      setAuth(response.accessToken, {
        id: response.user.id,
        email: response.user.email,
        role: response.user.role,
        isVerified: response.user.emailVerified,
      });
      router.push('/dashboard');
    } catch (err) {
      const email = getValues('email');
      
      // Check for unverified email error using the error code from backend
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        setError(
          <>
            Your email is not verified.{' '}
            <Link 
              href={`/verify-email?email=${encodeURIComponent(email)}`} 
              className="underline hover:text-mint-deep"
            >
              Click here to verify
            </Link>
          </>
        );
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Login failed';
        setError(errorMessage);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="font-display text-3xl">
            Mezzo Charge
          </Link>
          <h1 className="text-2xl font-medium mt-4">Welcome back</h1>
          <p className="text-fog mt-2">Log in to your account</p>
        </div>

        <div className="bg-surface rounded-2xl shadow-card p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {successMessage && (
              <div className="bg-mint/10 border border-mint/20 rounded-lg p-4 text-sm text-mint">
                {successMessage}
              </div>
            )}

            {error && (
              <div className="bg-danger/10 border border-danger/20 rounded-lg p-4 text-sm text-danger">
                {error}
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
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Password
              </label>
              <input
                {...register('password')}
                id="password"
                type="password"
                autoComplete="current-password"
                className="w-full px-4 py-3 bg-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-mint focus:border-transparent"
              />
              {errors.password && (
                <p className="mt-2 text-sm text-danger">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full px-6 py-3 bg-mint text-white font-medium rounded-lg hover:bg-mint-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-mint"
            >
              {isSubmitting ? 'Logging in...' : 'Log in'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-fog">Don&apos;t have an account? </span>
            <Link href="/register" className="text-mint hover:text-mint-deep font-medium">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
