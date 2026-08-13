import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AdminDisputePacketResponse,
  ArbitrationRecordResponse,
  DisputeResponse,
  EvidenceItemResponse,
  UserRole,
} from "@mezzo/shared-types";
import AdminLayout from "../app/(app)/admin/layout";
import AdminDisputeQueuePage from "../app/(app)/admin/page";
import AdminDisputePage from "../app/(app)/admin/disputes/[id]/page";
import { renderWithProviders } from "./render-with-providers";
import { useAuthStore } from "../lib/auth-store";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "dispute-1" }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/admin",
}));

const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";
const EVIDENCE_ID = "33333333-3333-4333-8333-333333333333";
const RECORD_ID = "44444444-4444-4444-8444-444444444444";
const ESCROW_ID = "55555555-5555-4555-8555-555555555555";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function signIn(role: UserRole) {
  useAuthStore.setState({
    status: "authenticated",
    accessToken: "token",
    user: {
      id: "arbiter-id",
      email: "arbiter@example.com",
      role,
      createdAt: new Date(),
    },
  });
}

function evidenceItem(id: string, uploaderId: string): EvidenceItemResponse {
  return {
    id,
    escrowId: ESCROW_ID,
    uploaderId,
    phase: "AT_DELIVERY",
    contentHash: `hash-${id}`,
    declaredMime: "image/jpeg",
    detectedMime: "image/jpeg",
    sizeBytes: 2048,
    width: 100,
    height: 100,
    capturedAt: null,
    deviceMake: null,
    deviceModel: null,
    gpsLatitude: null,
    gpsLongitude: null,
    flags: ["MISSING_METADATA"],
    createdAt: new Date("2026-07-01T10:00:00.000Z"),
  };
}

function dispute(overrides: Partial<DisputeResponse> = {}): DisputeResponse {
  return {
    id: "dispute-1",
    escrowId: ESCROW_ID,
    raisedByUserId: BUYER_ID,
    reasonCode: "DAMAGED",
    statement: "The lens arrived cracked.",
    state: "UNDER_REVIEW",
    evidenceWindowExpiresAt: new Date("2026-07-04T09:00:00.000Z"),
    resolvedOutcome: null,
    resolvedByUserId: null,
    resolvedAt: null,
    resolvedSellerAmount: null,
    resolvedBuyerAmount: null,
    resolvedFeeAmount: null,
    resolvedCurrency: null,
    resolvedArbitrationRecordId: null,
    createdAt: new Date("2026-07-01T09:00:00.000Z"),
    updatedAt: new Date("2026-07-02T09:00:00.000Z"),
    ...overrides,
  };
}

function record(
  overrides: Partial<ArbitrationRecordResponse> = {},
): ArbitrationRecordResponse {
  return {
    id: RECORD_ID,
    disputeId: "dispute-1",
    provider: "fake",
    status: "RECOMMENDED",
    recommendedOutcome: "REFUND_TO_BUYER",
    splitRatio: null,
    confidence: 0.92,
    rationale: "The delivery photos show a cracked lens barrel.",
    citedEvidenceIds: [EVIDENCE_ID],
    contradictions: [],
    missingEvidence: [],
    abstentionReason: null,
    createdAt: new Date("2026-07-02T10:00:00.000Z"),
    ...overrides,
  };
}

function packet(
  overrides: {
    dispute?: DisputeResponse;
    records?: ArbitrationRecordResponse[];
  } = {},
): AdminDisputePacketResponse {
  return {
    packet: {
      dispute: overrides.dispute ?? dispute(),
      frozenTerms: {
        price: { amount: 100_000, currency: "NGN" },
        inspectionWindowHours: 48,
        deliveryMethod: "GIG Logistics",
        itemDescription: "A vintage camera",
        feeBps: 250,
        requiresVerification: false,
        agreementText: null,
      },
      timeline: [
        {
          source: "ESCROW",
          fromState: "DELIVERED",
          toState: "DISPUTED",
          actorId: BUYER_ID,
          reason: "Buyer raised a dispute: DAMAGED",
          correlationId: "corr-1",
          createdAt: new Date("2026-07-01T09:00:00.000Z"),
        },
      ],
      creationEvidence: [],
      buyerEvidence: [evidenceItem(EVIDENCE_ID, BUYER_ID)],
      sellerEvidence: [],
      submissionFlags: {
        buyerSubmitted: true,
        sellerSubmitted: false,
        evidenceWindowElapsed: true,
      },
      chatTranscript: [],
    },
    arbitrationRecords: overrides.records ?? [record()],
  };
}

interface RecordedCall {
  url: string;
  init?: RequestInit;
}

function stubFetch(
  body: AdminDisputePacketResponse,
  auditEvents: unknown[] = [],
): RecordedCall[] {
  const calls: RecordedCall[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = input.toString();
      calls.push({ url, init });

      if (url.includes('/admin/audit')) {
        return jsonResponse(auditEvents);
      }
      if (url.includes('/admin/disputes/')) {
        return jsonResponse(body);
      }
      if (url.includes('/escrows/')) {
        return jsonResponse({
          id: ESCROW_ID,
          state: 'DISPUTED',
          version: 6,
          terms: body.packet.frozenTerms,
          parties: [
            { userId: BUYER_ID, role: 'BUYER', termsAcceptedAt: '2026-07-01T08:00:00.000Z' },
            { userId: SELLER_ID, role: 'SELLER', termsAcceptedAt: '2026-07-01T08:05:00.000Z' },
          ],
          trackingReference: null,
          deliveredAt: '2026-07-01T08:30:00.000Z',
          createdAt: '2026-07-01T07:00:00.000Z',
          updatedAt: '2026-07-01T09:00:00.000Z',
        });
      }
      return jsonResponse({ id: 'dispute-1', state: 'RESOLVED' });
    }),
  );

  return calls;
}

describe("Arbiter console route guard", () => {
  it("denies a plain USER the whole /admin route group", () => {
    signIn("USER");
    renderWithProviders(
      <AdminLayout>
        <p>queue contents</p>
      </AdminLayout>,
    );

    expect(
      screen.getByText("This area is for arbiters only."),
    ).toBeInTheDocument();
    expect(screen.queryByText("queue contents")).not.toBeInTheDocument();
  });

  it("lets an ARBITER through", () => {
    signIn("ARBITER");
    renderWithProviders(
      <AdminLayout>
        <p>queue contents</p>
      </AdminLayout>,
    );

    expect(screen.getByText("queue contents")).toBeInTheDocument();
  });
});

describe("Dispute queue", () => {
  beforeEach(() => {
    signIn("ARBITER");
  });

  it("distinguishes an AI recommendation from a NEEDS_HUMAN item", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse([
          {
            dispute: dispute({ id: "dispute-1" }),
            latestArbitrationRecord: record(),
          },
          {
            dispute: dispute({
              id: "dispute-2",
              createdAt: new Date("2026-07-01T08:00:00.000Z"),
            }),
            latestArbitrationRecord: record({
              id: "record-2",
              status: "NEEDS_HUMAN",
              recommendedOutcome: null,
              confidence: 0.2,
              abstentionReason: "LOW_CONFIDENCE",
            }),
          },
          {
            dispute: dispute({ id: "dispute-3" }),
            latestArbitrationRecord: null,
          },
        ]),
      ),
    );

    renderWithProviders(<AdminDisputeQueuePage />);

    expect(await screen.findByText("Needs human")).toBeInTheDocument();
    expect(screen.getByText(/Refunded to the buyer/)).toBeInTheDocument();
    expect(screen.getByText("No AI analysis yet")).toBeInTheDocument();

    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("Needs human")).toBeInTheDocument();
  });
});

describe("Arbiter dispute detail", () => {
  beforeEach(() => {
    signIn("ADMIN");
  });

  it("links every cited evidence id to the evidence item itself", async () => {
    stubFetch(packet());
    renderWithProviders(<AdminDisputePage />);

    const panel = await screen.findByRole("region", {
      name: "AI recommendation",
    });
    const citation = within(panel).getByRole("link", { name: EVIDENCE_ID });
    expect(citation).toHaveAttribute("href", `#evidence-${EVIDENCE_ID}`);
    expect(document.getElementById(`evidence-${EVIDENCE_ID}`)).not.toBeNull();
  });

  it("surfaces evidence integrity flags in the packet", async () => {
    stubFetch(packet());
    renderWithProviders(<AdminDisputePage />);

    const grid = await screen.findByRole("region", {
      name: "Buyer's evidence",
    });
    expect(
      within(grid).getByText("Missing capture metadata"),
    ).toBeInTheDocument();
  });

  it("shows the ledger effect and sends the arbitration record id when executing", async () => {
    const user = userEvent.setup();
    const calls = stubFetch(packet());
    renderWithProviders(<AdminDisputePage />);

    const form = await screen.findByRole("region", {
      name: "Execute resolution",
    });

    // A high-confidence recommendation pre-fills the outcome, but never executes on its own.
    expect(
      within(form).getByRole("radio", { name: "Refunded to the buyer" }),
    ).toBeChecked();
    // The whole hold is debited and the whole hold is refunded: nothing to the seller.
    expect(within(form).getAllByText("₦1,000.00")).toHaveLength(2);
    expect(within(form).getAllByText("₦0.00")).toHaveLength(2);

    await user.click(
      within(form).getByRole("button", { name: "Review and execute" }),
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(RECORD_ID)).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: "Execute resolution" }),
    );

    const resolveCall = calls.find((call) => call.url.includes('/resolve'));
    expect(resolveCall).toBeDefined();
    expect(JSON.parse(resolveCall?.init?.body as string)).toEqual({
      outcome: 'REFUND_TO_BUYER',
      arbitrationRecordId: RECORD_ID,
    });
  });

  it("never pre-selects an outcome when the AI abstained", async () => {
    stubFetch(
      packet({
        records: [
          record({
            status: "NEEDS_HUMAN",
            recommendedOutcome: null,
            confidence: 0.31,
            abstentionReason: "CONTRADICTORY_OR_MISSING_EVIDENCE",
          }),
        ],
      }),
    );
    renderWithProviders(<AdminDisputePage />);

    const panel = await screen.findByRole("region", {
      name: "AI recommendation",
    });
    expect(panel).toHaveTextContent("Abstained — this one needs a human.");
    expect(panel).toHaveTextContent("Evidence is contradictory or incomplete");

    const form = screen.getByRole("region", { name: "Execute resolution" });
    for (const name of [
      "Released to the seller",
      "Refunded to the buyer",
      "Split between both parties",
    ]) {
      expect(within(form).getByRole("radio", { name })).not.toBeChecked();
    }
    expect(
      within(form).getByRole("button", { name: "Review and execute" }),
    ).toBeDisabled();
  });

  it("previews a split to the exact kobo before executing", async () => {
    const user = userEvent.setup();
    stubFetch(packet({ records: [] }));
    renderWithProviders(<AdminDisputePage />);

    const form = await screen.findByRole("region", {
      name: "Execute resolution",
    });
    await user.click(
      within(form).getByRole("radio", { name: "Split between both parties" }),
    );

    const bps = within(form).getByLabelText("Seller share (basis points)");
    await user.clear(bps);
    await user.type(bps, "6000");

    expect(within(form).getByText("₦585.00")).toBeInTheDocument();
    expect(within(form).getByText("₦400.00")).toBeInTheDocument();
    expect(within(form).getByText("₦15.00")).toBeInTheDocument();
    expect(within(form).getByText("₦1,000.00")).toBeInTheDocument();
  });

  it("shows the executed resolution in the audit trail", async () => {
    stubFetch(
      packet({
        dispute: dispute({
          state: "RESOLVED",
          resolvedOutcome: "REFUND_TO_BUYER",
          resolvedAt: new Date("2026-07-03T12:00:00.000Z"),
          resolvedSellerAmount: 0,
          resolvedBuyerAmount: 100_000,
          resolvedFeeAmount: 0,
          resolvedCurrency: "NGN",
          resolvedArbitrationRecordId: RECORD_ID,
        }),
      }),
      [
        {
          id: "66666666-6666-4666-8666-666666666666",
          actorId: "arbiter-id",
          action: "DISPUTE_RESOLUTION_EXECUTED",
          entityType: "dispute",
          entityId: "dispute-1",
          reason: `Executed per ArbitrationRecord ${RECORD_ID}`,
          beforeState: null,
          afterState: null,
          correlationId: "corr-1",
          createdAt: "2026-07-03T12:00:00.000Z",
        },
      ],
    );
    renderWithProviders(<AdminDisputePage />);

    const audit = await screen.findByRole("region", { name: "Audit trail" });
    expect(
      await within(audit).findByText("Resolution executed"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Executed resolution" }),
    ).toHaveTextContent("Refunded to the buyer");
    expect(
      screen.queryByRole("region", { name: "Execute resolution" }),
    ).not.toBeInTheDocument();
  });

  it('asks the arbiter to close the evidence window before any resolution is possible', async () => {
    const user = userEvent.setup();
    const calls = stubFetch(packet({ dispute: dispute({ state: 'EVIDENCE' }) }));
    renderWithProviders(<AdminDisputePage />);

    const panel = await screen.findByRole('region', { name: 'Close evidence window' });
    expect(screen.queryByRole('region', { name: 'Execute resolution' })).not.toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Close evidence window' }));

    expect(calls.some((call) => call.url.includes('/close-evidence-window'))).toBe(true);
  });

  it("tells an arbiter the audit log is admin-only rather than failing", async () => {
    signIn("ARBITER");
    stubFetch(packet());
    renderWithProviders(<AdminDisputePage />);

    const audit = await screen.findByRole("region", { name: "Audit trail" });
    expect(audit).toHaveTextContent("visible to administrators");
  });
});
