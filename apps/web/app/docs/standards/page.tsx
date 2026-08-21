import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Standards',
  description: 'Engineering conventions every change to Mezzo is expected to follow.',
};

const RULES = [
  {
    title: 'Money is never a float',
    body: (
      <>
        Not in the database, not in a DTO, not in application code. Amounts are integer minor
        units (kobo) wrapped in a <code className="text-vellum">Money</code> value object for
        every comparison and every arithmetic operation, and currency is explicit on every amount
        — a bare integer is never treated as an implicit-currency value.
      </>
    ),
  },
  {
    title: 'Domain errors are typed classes',
    body: (
      <>
        <code className="text-vellum">IllegalTransitionError</code>,{' '}
        <code className="text-vellum">InsufficientFundsError</code>, and their siblings — never a
        raw <code className="text-vellum">Error</code> or a string throw. A global exception
        filter maps each typed error to the correct HTTP status and a structured response, and
        stack traces never leak into that response.
      </>
    ),
  },
  {
    title: 'Config fails fast, not partially',
    body: (
      <>
        Every environment variable is validated against a Zod schema at boot via{' '}
        <code className="text-vellum">@nestjs/config</code>. A missing or malformed required
        variable stops the app from starting — it never runs in a half-configured state and finds
        out at request time instead.
      </>
    ),
  },
  {
    title: 'One shape, one definition',
    body: (
      <>
        Request/response schemas live once, as Zod schemas in{' '}
        <code className="text-vellum">packages/shared-types</code>, imported by the API for DTO
        validation and by the web app for form validation. The client never redefines a shape the
        API already owns.
      </>
    ),
  },
];

const TEST_RULES = [
  'Every escrow state transition and every dispute lifecycle transition is covered by a test before the change that introduces it is done.',
  'Every money movement — a ledger posting, a payment webhook — is covered by a test before the change that introduces it is done.',
  'Unit tests cover service logic in isolation. e2e tests (Supertest + Testcontainers) cover any API surface that touches Postgres, Redis, or an external provider.',
  'e2e tests never mock the database or Redis — Testcontainers spins up the real thing, because a mocked test passing has no bearing on whether a migration or a query actually works.',
];

export default function StandardsPage() {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-[11px] tracking-[0.28em] text-mute">ENGINEERING</p>
      <h1 className="mt-3 font-display text-4xl text-vellum">Standards</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-fog">
        These are the rules a change is actually checked against — enforced by CI, a Husky
        pre-commit hook, or code review, not just written down and hoped for. The full,
        exhaustive version of every convention below lives in{' '}
        <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-vellum">
          CLAUDE.md
        </code>{' '}
        at the repo root; this page is the reasoning behind the rules that page states as bullet
        points.
      </p>

      <h2 className="mt-10 text-lg font-medium text-vellum">Non-negotiables</h2>
      <div className="mt-4 space-y-4">
        {RULES.map((rule) => (
          <div key={rule.title} className="rounded-lg border border-line-soft bg-surface-2/50 p-4">
            <p className="text-[13px] font-medium text-vellum">{rule.title}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fog">{rule.body}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-lg font-medium text-vellum">Testing gate</h2>
      <p className="mt-3 text-[14px] leading-relaxed text-fog">
        A milestone, or any change, is not done until its tests are green — not &quot;written,&quot;
        green.
      </p>
      <ul className="mt-4 space-y-2.5">
        {TEST_RULES.map((rule) => (
          <li key={rule} className="flex gap-3 text-[13px] leading-relaxed text-fog">
            <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-mint" />
            {rule}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[14px] leading-relaxed text-fog">
        <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-vellum">
          scripts/check-touched-tests.mjs
        </code>{' '}
        enforces the first rule mechanically, in the pre-commit hook and in CI: a module&apos;s
        logic files can&apos;t change without a <code className="text-vellum">*.spec.ts</code> in
        that module changing too. It also prints a non-blocking reminder when a module changes
        without its README — see{' '}
        <a
          href="https://github.com/caxtonacollins/Mezzo/blob/main/CONTRIBUTING.md"
          className="text-mint underline underline-offset-2 hover:text-mint-deep"
        >
          CONTRIBUTING.md
        </a>{' '}
        for the override.
      </p>

      <h2 className="mt-10 text-lg font-medium text-vellum">Code style</h2>
      <p className="mt-3 text-[14px] leading-relaxed text-fog">
        Production-ready code only — no inline comments explaining what a well-named identifier
        already says, no dead code, no unused exports. Strict TypeScript everywhere, no{' '}
        <code className="text-vellum">any</code>. Lint and typecheck run on every commit via a
        Husky pre-commit hook, and prefer the simplest correct implementation over an abstraction
        the current milestone doesn&apos;t need — three similar lines beat a premature helper.
      </p>

      <h2 className="mt-10 text-lg font-medium text-vellum">Architecture</h2>
      <p className="mt-3 text-[14px] leading-relaxed text-fog">
        Controllers are thin — request in, DTO validation, delegate to a service, response out.
        Domain logic lives in services, and each feature module owns its own entities, service
        logic, and test suite. See{' '}
        <a href="/docs/architecture" className="text-mint underline underline-offset-2 hover:text-mint-deep">
          Architecture
        </a>{' '}
        for how the modules compose, and{' '}
        <a href="/docs/modules" className="text-mint underline underline-offset-2 hover:text-mint-deep">
          Modules
        </a>{' '}
        for what each one owns.
      </p>
    </div>
  );
}
