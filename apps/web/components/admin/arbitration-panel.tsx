'use client';

import type { ArbitrationRecordResponse } from '@mezzo/shared-types';
import { Bot, TriangleAlert } from 'lucide-react';
import { DISPUTE_OUTCOME_LABELS } from '../../lib/dispute-labels';
import { ABSTENTION_REASON_LABELS } from '../../lib/arbitration-labels';
import { formatDateTime } from '../../lib/format-date';
import { Button } from '../ui/button';

interface ArbitrationPanelProps {
  record: ArbitrationRecordResponse | null;
  onRequestAnalysis: () => void;
  requesting: boolean;
  requestError: string | null;
}

export function ArbitrationPanel({
  record,
  onRequestAnalysis,
  requesting,
  requestError,
}: ArbitrationPanelProps) {
  if (!record) {
    return (
      <section
        aria-label="AI recommendation"
        className="rounded-xl border border-line-soft bg-surface shadow-card p-4"
      >
        <h2 className="text-sm font-medium text-vellum">AI recommendation</h2>
        <p className="mt-1 text-[13px] text-mute">
          No analysis has been run for this dispute. Running one is optional — you can resolve
          without it.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          loading={requesting}
          onClick={onRequestAnalysis}
        >
          Run AI analysis
        </Button>
        {requestError ? (
          <p role="alert" className="mt-3 text-[13px] text-danger">
            {requestError}
          </p>
        ) : null}
      </section>
    );
  }

  const abstained = record.status === 'NEEDS_HUMAN';

  return (
    <section
      aria-label="AI recommendation"
      className={`rounded-xl border p-4 ${
        abstained ? 'border-seller/40 bg-seller/5' : 'border-line-soft bg-surface'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-vellum">
          {abstained ? (
            <TriangleAlert className="h-4 w-4 text-seller" />
          ) : (
            <Bot className="h-4 w-4 text-mint" />
          )}
          AI recommendation
        </h2>
        <span className="font-mono text-[11px] uppercase tracking-wide text-mute">
          {record.provider} · {formatDateTime(record.createdAt)}
        </span>
      </div>

      {abstained ? (
        <div className="mt-3">
          <p className="text-sm text-seller">Abstained — this one needs a human.</p>
          {record.abstentionReason ? (
            <p className="mt-1 text-[13px] text-fog">
              {ABSTENTION_REASON_LABELS[record.abstentionReason] ?? record.abstentionReason}
            </p>
          ) : null}
          <p className="mt-3 text-[13px] text-mute">
            No outcome is proposed and nothing below is pre-selected. Decide from the evidence.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-vellum">
            Proposes:{' '}
            <span className="text-mint">
              {record.recommendedOutcome
                ? DISPUTE_OUTCOME_LABELS[record.recommendedOutcome]
                : 'No outcome'}
            </span>
            {record.splitRatio !== null ? (
              <span className="font-mono tabular text-fog">
                {' '}
                ({(record.splitRatio / 100).toFixed(2)}% to the seller)
              </span>
            ) : null}
          </p>
          <p className="text-[13px] text-fog">
            Confidence <span className="font-mono tabular">{record.confidence.toFixed(2)}</span> — a
            proposal, not a decision. Check every citation before you accept it.
          </p>
        </div>
      )}

      <p className="mt-4 whitespace-pre-wrap text-[13px] text-fog">{record.rationale}</p>

      <div className="mt-4">
        <h3 className="text-[13px] font-medium text-vellum">Cited evidence</h3>
        {record.citedEvidenceIds.length === 0 ? (
          <p className="mt-1 text-[13px] text-mute">
            Nothing cited — there is no claim here you can verify against an exhibit.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {record.citedEvidenceIds.map((evidenceId) => (
              <li key={evidenceId}>
                <a
                  href={`#evidence-${evidenceId}`}
                  className="inline-flex rounded-md border border-line px-2 py-1 font-mono text-[11px] text-fog hover:border-fog hover:text-vellum"
                >
                  {evidenceId}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {record.contradictions.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-[13px] font-medium text-vellum">Contradictions it noticed</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-fog">
            {record.contradictions.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {record.missingEvidence.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-[13px] font-medium text-vellum">Evidence it says is missing</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-fog">
            {record.missingEvidence.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
