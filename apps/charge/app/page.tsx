import Link from 'next/link';
import { Battery, Shield, MapPin } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line py-4 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="font-display text-2xl">Mezzo Charge</h1>
          <div className="flex gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-vellum hover:text-mint transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-sm font-medium bg-mint text-white rounded-lg hover:bg-mint-deep transition-colors shadow-card"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-5xl mx-auto px-6 py-24 text-center">
          <h2 className="font-display text-6xl mb-6">Power on Demand</h2>
          <p className="text-xl text-fog max-w-2xl mx-auto mb-12">
            Rent powerbanks instantly from our network of shops across Nigeria. Verified accounts,
            transparent pricing, and convenient locations.
          </p>
          <Link
            href="/register"
            className="inline-block px-8 py-4 text-lg font-medium bg-mint text-white rounded-lg hover:bg-mint-deep transition-colors shadow-lift"
          >
            Start Renting
          </Link>
        </section>

        <section className="max-w-7xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-surface rounded-2xl p-8 shadow-card">
              <div className="w-12 h-12 rounded-full bg-mint/10 flex items-center justify-center mb-4">
                <Battery className="w-6 h-6 text-mint" />
              </div>
              <h3 className="font-display text-2xl mb-3">Instant Rental</h3>
              <p className="text-fog">
                Visit any of our partner shops, get verified once, and start renting powerbanks
                immediately. ₦600 for 24 hours.
              </p>
            </div>

            <div className="bg-surface rounded-2xl p-8 shadow-card">
              <div className="w-12 h-12 rounded-full bg-mint/10 flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-mint" />
              </div>
              <h3 className="font-display text-2xl mb-3">Verified Security</h3>
              <p className="text-fog">
                One-time identity verification with photo upload. Your data is protected and only
                visible to authorized staff.
              </p>
            </div>

            <div className="bg-surface rounded-2xl p-8 shadow-card">
              <div className="w-12 h-12 rounded-full bg-mint/10 flex items-center justify-center mb-4">
                <MapPin className="w-6 h-6 text-mint" />
              </div>
              <h3 className="font-display text-2xl mb-3">Shop Network</h3>
              <p className="text-fog">
                Two convenient locations ready to serve you. Return to any shop when done.
              </p>
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-6 py-16">
          <div className="bg-surface-2 rounded-2xl p-12 text-center shadow-panel">
            <h3 className="font-display text-4xl mb-4">Transparent Pricing</h3>
            <p className="text-lg text-fog mb-8">
              ₦600 for 24 hours. ₦25 per hour if overdue, capped at ₦1,200 total.
            </p>
            <Link
              href="/register"
              className="inline-block px-6 py-3 text-base font-medium bg-vellum text-ink rounded-lg hover:bg-fog transition-colors shadow-lift"
            >
              Create Account
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-8 px-6 text-center text-sm text-mute">
        <p>&copy; {new Date().getFullYear()} Mezzo Charge. Part of the Mezzo ecosystem.</p>
      </footer>
    </div>
  );
}
