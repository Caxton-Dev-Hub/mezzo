import Link from 'next/link';
import { RegisterForm } from '../../../components/auth/register-form';

export default function RegisterPage() {
  return (
    <div>
      <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
        Create your account
      </h1>
      <p className="mt-2 text-sm text-fog">
        Escrow that documents the item before money moves.
      </p>
      <div className="mt-7">
        <RegisterForm />
      </div>
      <p className="mt-6 text-center text-sm text-fog">
        Already have an account?{' '}
        <Link href="/login" className="text-vellum underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
