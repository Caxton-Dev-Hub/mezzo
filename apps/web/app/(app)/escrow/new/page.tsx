'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useEscrowWizardStore, type WizardStep } from '../../../../lib/escrow-wizard-store';
import { StepDetails } from '../../../../components/escrow/wizard/step-details';
import { StepEvidence } from '../../../../components/escrow/wizard/step-evidence';
import { StepReview } from '../../../../components/escrow/wizard/step-review';

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Item details',
  2: 'Evidence',
  3: 'Review & invite',
};

export default function NewEscrowPage() {
  const router = useRouter();
  const step = useEscrowWizardStore((state) => state.step);
  const setStep = useEscrowWizardStore((state) => state.setStep);
  const invite = useEscrowWizardStore((state) => state.invite);
  const reset = useEscrowWizardStore((state) => state.reset);

  const handleBack = () => {
    if (step === 1) {
      router.push('/dashboard');
      return;
    }
    setStep((step - 1) as WizardStep);
  };

  const handleDone = () => {
    reset();
    router.push('/dashboard');
  };

  return (
    <div className="mx-auto max-w-lg">
      <button
        type="button"
        onClick={handleBack}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-fog hover:text-vellum"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="mb-6">
        <p className="text-[13px] font-medium text-mint">
          Step {step} of 3 — {STEP_LABELS[step]}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {([1, 2, 3] as const).map((segment) => (
            <div
              key={segment}
              className={`h-1 rounded-full ${segment <= step ? 'bg-mint' : 'bg-line'}`}
            />
          ))}
        </div>
      </div>

      <h1 className="mb-6 font-display text-[1.6rem] leading-tight text-vellum sm:text-[1.85rem]">
        New escrow
      </h1>

      {step === 1 ? <StepDetails onAdvance={() => setStep(2)} /> : null}
      {step === 2 ? <StepEvidence onAdvance={() => setStep(3)} /> : null}
      {step === 3 ? <StepReview /> : null}

      {step === 3 && invite ? (
        <button
          type="button"
          onClick={handleDone}
          className="mt-4 w-full text-center text-sm text-fog underline underline-offset-4 hover:text-vellum"
        >
          Done — back to dashboard
        </button>
      ) : null}
    </div>
  );
}
