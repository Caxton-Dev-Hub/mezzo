import { Injectable } from '@nestjs/common';
import { DisputePacketResponse } from '../disputes/dto/dispute-response';
import { EvidenceItemResponse } from '../evidence/dto/evidence-response';

const SYSTEM_PROMPT = `You are a dispute analyst for an escrow marketplace. You review the evidence and
timeline of a buyer/seller dispute and produce a recommendation. You never move money and you never
have the final word -- a human arbiter decides. Respond with a single JSON object only, matching
exactly this shape, and nothing else (no prose before or after it):

{
  "recommendedOutcome": "RELEASE_TO_SELLER" | "REFUND_TO_BUYER" | "SPLIT",
  "splitRatio": <integer 1-9999, seller's share in basis points, present only if recommendedOutcome is "SPLIT">,
  "confidence": <number between 0 and 1>,
  "rationale": "<your reasoning>",
  "citedEvidenceIds": ["<evidenceId>", ...],
  "contradictions": ["<description of any contradiction between the parties' evidence or statements>", ...],
  "missingEvidence": ["<description of evidence that would help but is absent>", ...]
}

Rules:
- Every claim in your rationale must be traceable to a cited evidenceId. If you cannot cite specific
  evidence for your recommendation, set citedEvidenceIds to an empty array rather than fabricating a citation.
- If the evidence is contradictory, tampered-looking, or insufficient to decide, say so plainly in
  contradictions/missingEvidence and lower your confidence accordingly -- do not guess.
- Never reference account balances, wallet contents, or take any action beyond producing this JSON.`;

function formatEvidenceItem(item: EvidenceItemResponse): string {
  const flags = item.flags.length > 0 ? item.flags.join(', ') : 'none';
  return [
    `  - evidenceId: ${item.id}`,
    `    phase: ${item.phase}`,
    `    contentHash: ${item.contentHash}`,
    `    declaredMime: ${item.declaredMime} detectedMime: ${item.detectedMime}`,
    `    capturedAt: ${item.capturedAt ? item.capturedAt.toISOString() : 'unknown'}`,
    `    device: ${item.deviceMake ?? 'unknown'} ${item.deviceModel ?? ''}`.trimEnd(),
    `    gps: ${item.gpsLatitude ?? 'n/a'},${item.gpsLongitude ?? 'n/a'}`,
    `    integrityFlags: ${flags}`,
  ].join('\n');
}

@Injectable()
export class ArbitrationPromptBuilder {
  readonly systemPrompt = SYSTEM_PROMPT;

  buildUserPrompt(packet: DisputePacketResponse): string {
    const sections: string[] = [];

    sections.push('## Frozen terms');
    sections.push(
      [
        `price: ${packet.frozenTerms.price.amount} ${packet.frozenTerms.price.currency}`,
        `inspectionWindowHours: ${packet.frozenTerms.inspectionWindowHours}`,
        `deliveryMethod: ${packet.frozenTerms.deliveryMethod}`,
        `itemDescription: ${packet.frozenTerms.itemDescription}`,
        `feeBps: ${packet.frozenTerms.feeBps}`,
      ].join('\n'),
    );

    sections.push('## Dispute');
    sections.push(
      [`reasonCode: ${packet.dispute.reasonCode}`, `statement: ${packet.dispute.statement}`].join('\n'),
    );

    sections.push('## Timeline (chronological)');
    sections.push(
      packet.timeline
        .map(
          (entry) =>
            `  - [${entry.source}] ${entry.fromState} -> ${entry.toState} at ${entry.createdAt.toISOString()}${entry.reason ? ` (${entry.reason})` : ''}`,
        )
        .join('\n') || '  (empty)',
    );

    sections.push('## Evidence at creation (initiator documented condition before agreement)');
    sections.push(packet.creationEvidence.map(formatEvidenceItem).join('\n\n') || '  (none)');

    sections.push('## Buyer evidence at delivery');
    sections.push(packet.buyerEvidence.map(formatEvidenceItem).join('\n\n') || '  (none)');

    sections.push('## Seller evidence at delivery (rebuttal)');
    sections.push(packet.sellerEvidence.map(formatEvidenceItem).join('\n\n') || '  (none)');

    sections.push('## Submission flags');
    sections.push(
      [
        `buyerSubmitted: ${packet.submissionFlags.buyerSubmitted}`,
        `sellerSubmitted: ${packet.submissionFlags.sellerSubmitted}`,
        `evidenceWindowElapsed: ${packet.submissionFlags.evidenceWindowElapsed}`,
      ].join('\n'),
    );

    sections.push('## Chat transcript');
    sections.push(packet.chatTranscript.length > 0 ? JSON.stringify(packet.chatTranscript) : '  (none)');

    return sections.join('\n\n');
  }
}
