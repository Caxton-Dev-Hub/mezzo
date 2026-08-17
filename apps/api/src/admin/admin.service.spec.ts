import { ConfigService } from '@nestjs/config';
import { AdminService } from './admin.service';
import { EscrowService } from '../escrow/escrow.service';
import { SettlementService } from '../escrow/settlement.service';
import { PayoutService } from '../payments/payout.service';
import { PaymentsService } from '../payments/payments.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import { ChatService } from '../chat/chat.service';
import { TokenService } from '../auth/token.service';
import { SettingsService } from '../settings/settings.service';
import { DisputeService } from '../disputes/dispute.service';
import { DisputeState } from '../disputes/entities/dispute-state.enum';
import { ArbitrationService } from '../arbitration/arbitration.service';
import { LedgerService, PostingLine } from '../ledger/ledger.service';
import { ReconciliationService } from '../ledger/reconciliation.service';
import { EntryDirection } from '../ledger/entities/entry-direction.enum';
import { Money } from '../common/money/money';
import { KycService } from '../kyc/kyc.service';
import { KycTier } from '../kyc/entities/kyc-tier.enum';
import { KycVerificationStatus } from '../kyc/entities/kyc-verification-status.enum';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../common/context/request-context';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UserRole } from '../users/entities/user-role.enum';
import { UserStatus } from '../users/entities/user-status.enum';
import { callArg } from '../../test/support/mock-calls';

const ADMIN_ID = 'admin-1';
const DISPUTE_ID = 'dispute-1';
const admin: AuthenticatedUser = { id: ADMIN_ID, role: UserRole.ADMIN };

interface Harness {
  service: AdminService;
  listByState: jest.Mock;
  getPacket: jest.Mock;
  listForDispute: jest.Mock;
  postTransaction: jest.Mock;
  listEntriesForPosting: jest.Mock;
  listPostingsByCorrelationId: jest.Mock;
  listEntriesByAccountRef: jest.Mock;
  reconcile: jest.Mock;
  setVerificationEnabled: jest.Mock;
  listVerifications: jest.Mock;
  overrideTier: jest.Mock;
  listDocuments: jest.Mock;
  approveVerification: jest.Mock;
  rejectVerification: jest.Mock;
  findAll: jest.Mock;
  search: jest.Mock;
  updateStatus: jest.Mock;
  auditRecord: jest.Mock;
  auditList: jest.Mock;
  waitlistFindAll: jest.Mock;
  revokeAllForUser: jest.Mock;
}

function buildHarness(
  options: {
    disputes?: unknown[];
    records?: unknown[];
    postings?: unknown[];
  } = {},
): Harness {
  const listByState = jest.fn().mockResolvedValue(options.disputes ?? []);
  const getPacket = jest.fn().mockResolvedValue({ dispute: { id: DISPUTE_ID } });
  const disputeService = { listByState, getPacket } as unknown as DisputeService;

  const listForDispute = jest.fn().mockResolvedValue(options.records ?? []);
  const arbitrationService = { listForDispute } as unknown as ArbitrationService;

  const postTransaction = jest.fn().mockResolvedValue({ id: 'posting-1' });
  const listEntriesForPosting = jest.fn().mockResolvedValue([]);
  const listPostingsByCorrelationId = jest.fn().mockResolvedValue(options.postings ?? []);
  const listEntriesByAccountRef = jest.fn().mockResolvedValue([]);
  const ledgerService = {
    postTransaction,
    listEntriesForPosting,
    listPostingsByCorrelationId,
    listEntriesByAccountRef,
  } as unknown as LedgerService;

  const reconcile = jest.fn().mockResolvedValue({
    globalBalanced: true,
    totalDebits: 0,
    totalCredits: 0,
    driftedAccountRefs: [],
  });
  const reconciliationService = { reconcile } as unknown as ReconciliationService;

  const listVerifications = jest.fn().mockResolvedValue([]);
  const overrideTier = jest
    .fn()
    .mockResolvedValue({ before: KycTier.TIER_0, after: KycTier.TIER_2 });
  const listDocuments = jest.fn().mockResolvedValue([]);
  const approveVerification = jest.fn().mockResolvedValue({
    id: 'verification-1',
    userId: 'user-1',
    status: 'APPROVED',
    requestedTier: KycTier.TIER_2,
    provider: 'manual',
    providerReference: 'manual-submission:ref-1',
    createdAt: new Date(),
  });
  const rejectVerification = jest.fn().mockResolvedValue({
    id: 'verification-1',
    userId: 'user-1',
    status: 'REJECTED',
    requestedTier: KycTier.TIER_2,
    provider: 'manual',
    providerReference: 'manual-submission:ref-1',
    createdAt: new Date(),
  });
  const kycService = {
    listVerifications,
    overrideTier,
    listDocuments,
    approveVerification,
    rejectVerification,
  } as unknown as KycService;

  const findAll = jest.fn().mockResolvedValue([]);
  const search = jest.fn().mockResolvedValue({ items: [], total: 0 });
  const updateStatus = jest
    .fn()
    .mockResolvedValue({ before: UserStatus.ACTIVE, after: UserStatus.SUSPENDED });
  const usersService = { findAll, search, updateStatus } as unknown as UsersService;

  const auditRecord = jest.fn().mockResolvedValue(undefined);
  const auditList = jest.fn().mockResolvedValue([]);
  const auditService = { record: auditRecord, list: auditList } as unknown as AuditService;

  const requestContext = {
    correlationId: jest.fn().mockReturnValue('corr-1'),
  } as unknown as RequestContextService;

  const listAllEscrows = jest.fn().mockResolvedValue([]);
  const escrowService = { listAll: listAllEscrows } as unknown as EscrowService;

  const settlementService = {} as unknown as SettlementService;

  const listAllPayouts = jest.fn().mockResolvedValue([]);
  const payoutService = { listAllPayouts } as unknown as PayoutService;

  const listAllIntents = jest.fn().mockResolvedValue([]);
  const paymentsService = { listAllIntents } as unknown as PaymentsService;

  const waitlistFindAll = jest.fn().mockResolvedValue({ items: [], total: 0 });
  const waitlistService = { findAll: waitlistFindAll } as unknown as WaitlistService;

  const chatService = {} as unknown as ChatService;

  const revokeAllForUser = jest.fn().mockResolvedValue(undefined);
  const tokenService = { revokeAllForUser } as unknown as TokenService;

  const setVerificationEnabled = jest
    .fn()
    .mockResolvedValue({ before: true, after: false });
  const getPlatformSettings = jest
    .fn()
    .mockResolvedValue({ verificationEnabled: false, updatedAt: new Date(), updatedById: ADMIN_ID });
  const settingsService = {
    setVerificationEnabled,
    getPlatformSettings,
  } as unknown as SettingsService;

  const riskConfig: Record<string, number> = {
    ADMIN_RISK_UNSHIPPED_HOURS: 48,
    ESCROW_INVITE_EXPIRY_HOURS: 72,
    DISPUTE_EVIDENCE_WINDOW_HOURS: 72,
    ADMIN_RISK_STALE_PAYOUT_HOURS: 24,
    ADMIN_RISK_STALE_INTENT_HOURS: 6,
    ADMIN_RISK_UNSETTLED_HOURS: 1,
  };
  const configService = {
    getOrThrow: <T>(key: string): T => riskConfig[key] as T,
  } as unknown as ConfigService;

  const service = new AdminService(
    disputeService,
    arbitrationService,
    ledgerService,
    reconciliationService,
    kycService,
    usersService,
    auditService,
    requestContext,
    escrowService,
    settlementService,
    payoutService,
    paymentsService,
    settingsService,
    configService,
    waitlistService,
    chatService,
    tokenService,
  );

  return {
    service,
    listByState,
    getPacket,
    listForDispute,
    postTransaction,
    listEntriesForPosting,
    listPostingsByCorrelationId,
    listEntriesByAccountRef,
    reconcile,
    listVerifications,
    overrideTier,
    listDocuments,
    approveVerification,
    rejectVerification,
    findAll,
    search,
    updateStatus,
    auditRecord,
    auditList,
    setVerificationEnabled,
    waitlistFindAll,
    revokeAllForUser,
  };
}

describe('AdminService.setVerificationEnabled', () => {
  it('records who turned verification off and why', async () => {
    const harness = buildHarness();

    await harness.service.setVerificationEnabled(ADMIN_ID, {
      enabled: false,
      reason: 'Provider integration not live yet',
    });

    expect(harness.setVerificationEnabled).toHaveBeenCalledWith(ADMIN_ID, false);
    expect(harness.auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN_ID,
        action: 'VERIFICATION_AVAILABILITY_CHANGED',
        entityType: 'platform_flag',
        reason: 'Provider integration not live yet',
        before: { verificationEnabled: true },
        after: { verificationEnabled: false },
      }),
    );
  });
});

describe('AdminService.listDisputes', () => {
  it('passes the state filter straight through', async () => {
    const harness = buildHarness();

    await harness.service.listDisputes(DisputeState.UNDER_REVIEW);

    expect(harness.listByState).toHaveBeenCalledWith(DisputeState.UNDER_REVIEW);
  });

  it('attaches the latest arbitration recommendation to each dispute', async () => {
    const harness = buildHarness({
      disputes: [{ id: DISPUTE_ID, escrowId: 'escrow-1', state: DisputeState.UNDER_REVIEW }],
      records: [{ id: 'record-newest' }, { id: 'record-older' }],
    });

    const summaries = await harness.service.listDisputes();

    expect(harness.listForDispute).toHaveBeenCalledWith(DISPUTE_ID);
    expect(summaries).toHaveLength(1);
  });

  it('copes with a dispute that has no recommendation yet', async () => {
    const harness = buildHarness({
      disputes: [{ id: DISPUTE_ID, escrowId: 'escrow-1', state: DisputeState.EVIDENCE }],
      records: [],
    });

    await expect(harness.service.listDisputes()).resolves.toHaveLength(1);
  });
});

describe('AdminService.getDisputePacket', () => {
  it('returns the packet together with every recommendation on record', async () => {
    const harness = buildHarness({ records: [] });

    const result = await harness.service.getDisputePacket(DISPUTE_ID, admin);

    expect(harness.getPacket).toHaveBeenCalledWith(DISPUTE_ID, admin);
    expect(result.arbitrationRecords).toEqual([]);
  });
});

describe('AdminService.postAdjustment', () => {
  const dto = {
    debitAccountRef: 'platform:fee-revenue',
    creditAccountRef: 'user:user-1:wallet',
    amount: 5_000,
    currency: 'NGN' as const,
    reason: 'Goodwill credit after a support case',
  };

  it('posts a balanced two-sided adjustment', async () => {
    const harness = buildHarness();

    await harness.service.postAdjustment(ADMIN_ID, dto);

    const lines = callArg<PostingLine[]>(harness.postTransaction, 0, 0);
    expect(lines).toEqual([
      expect.objectContaining({
        accountRef: 'platform:fee-revenue',
        direction: EntryDirection.DEBIT,
        money: expect.objectContaining({ amount: 5_000, currency: 'NGN' }) as Money,
      }),
      expect.objectContaining({
        accountRef: 'user:user-1:wallet',
        direction: EntryDirection.CREDIT,
        money: expect.objectContaining({ amount: 5_000, currency: 'NGN' }) as Money,
      }),
    ]);
  });

  it('records who made the adjustment and why', async () => {
    const harness = buildHarness();

    await harness.service.postAdjustment(ADMIN_ID, dto);

    expect(harness.auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN_ID,
        action: 'LEDGER_ADJUSTMENT_POSTED',
        entityType: 'ledger_posting',
        entityId: 'posting-1',
        reason: dto.reason,
        correlationId: 'corr-1',
      }),
    );
  });

  it('scopes the idempotency key to the actor and the exact amounts', async () => {
    const harness = buildHarness();

    await harness.service.postAdjustment(ADMIN_ID, dto);

    const key = callArg<{ idempotencyKey: string }>(harness.postTransaction, 0, 1).idempotencyKey;
    expect(key).toContain(`admin-adjustment:${ADMIN_ID}`);
    expect(key).toContain('platform:fee-revenue');
    expect(key).toContain('5000');
  });
});

describe('AdminService.overrideKycTier', () => {
  it('returns both sides of the tier change', async () => {
    const harness = buildHarness();

    const result = await harness.service.overrideKycTier(ADMIN_ID, 'user-1', {
      tier: KycTier.TIER_2,
      reason: 'Verified documents by hand',
    });

    expect(result).toEqual({ before: KycTier.TIER_0, after: KycTier.TIER_2 });
    expect(harness.overrideTier).toHaveBeenCalledWith('user-1', KycTier.TIER_2);
  });

  it('records the override with both tiers for the audit trail', async () => {
    const harness = buildHarness();

    await harness.service.overrideKycTier(ADMIN_ID, 'user-1', {
      tier: KycTier.TIER_2,
      reason: 'Verified documents by hand',
    });

    expect(harness.auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'KYC_TIER_OVERRIDE',
        entityType: 'user',
        entityId: 'user-1',
        before: { tier: KycTier.TIER_0 },
        after: { tier: KycTier.TIER_2 },
      }),
    );
  });
});

describe('AdminService.approveKycVerification', () => {
  it('approves the verification and records the audit trail', async () => {
    const harness = buildHarness();

    const result = await harness.service.approveKycVerification(ADMIN_ID, 'verification-1', {
      reason: 'Documents check out',
    });

    expect(harness.approveVerification).toHaveBeenCalledWith('verification-1');
    expect(result.status).toBe('APPROVED');
    expect(harness.auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN_ID,
        action: 'KYC_VERIFICATION_APPROVED',
        entityType: 'kyc_verification',
        entityId: 'verification-1',
        reason: 'Documents check out',
        before: { status: 'PENDING' },
        after: { status: 'APPROVED' },
      }),
    );
  });
});

describe('AdminService.rejectKycVerification', () => {
  it('rejects the verification and records the audit trail', async () => {
    const harness = buildHarness();

    const result = await harness.service.rejectKycVerification(ADMIN_ID, 'verification-1', {
      reason: 'Photo is illegible',
    });

    expect(harness.rejectVerification).toHaveBeenCalledWith('verification-1');
    expect(result.status).toBe('REJECTED');
    expect(harness.auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN_ID,
        action: 'KYC_VERIFICATION_REJECTED',
        entityType: 'kyc_verification',
        entityId: 'verification-1',
        reason: 'Photo is illegible',
        before: { status: 'PENDING' },
        after: { status: 'REJECTED' },
      }),
    );
  });
});

describe('AdminService ledger and kyc queries', () => {
  it('hydrates the entries of every posting for a correlation id', async () => {
    const harness = buildHarness({ postings: [{ id: 'posting-1' }, { id: 'posting-2' }] });

    await harness.service.listPostingsByCorrelationId('corr-1');

    expect(harness.listEntriesForPosting).toHaveBeenCalledWith('posting-1');
    expect(harness.listEntriesForPosting).toHaveBeenCalledWith('posting-2');
  });

  it('passes the account ref and limit through to the ledger', async () => {
    const harness = buildHarness();

    await harness.service.listEntriesByAccountRef('user:user-1:wallet', 10);

    expect(harness.listEntriesByAccountRef).toHaveBeenCalledWith('user:user-1:wallet', 10);
  });

  it('reports the live reconciliation status', async () => {
    const harness = buildHarness();

    const report = await harness.service.getReconciliationStatus();

    expect(report.globalBalanced).toBe(true);
    expect(harness.reconcile).toHaveBeenCalledTimes(1);
  });

  it('filters the kyc queue by status when one is given', async () => {
    const harness = buildHarness();

    await harness.service.listKycQueue(KycVerificationStatus.PENDING);

    expect(harness.listVerifications).toHaveBeenCalledWith(KycVerificationStatus.PENDING);
  });

  it('narrows the audit log to one entity', async () => {
    const harness = buildHarness();

    await harness.service.listAuditEvents('dispute', DISPUTE_ID);

    expect(harness.auditList).toHaveBeenCalledWith({
      entityType: 'dispute',
      entityId: DISPUTE_ID,
    });
  });

  it('lists every user for the admin console', async () => {
    const harness = buildHarness();

    await harness.service.listUsers({ page: 1, pageSize: 20 });

    expect(harness.search).toHaveBeenCalledTimes(1);
  });
});

describe('AdminService.updateUserStatus', () => {
  it('revokes active sessions when suspending a user', async () => {
    const harness = buildHarness();

    await harness.service.updateUserStatus(ADMIN_ID, 'user-1', {
      status: UserStatus.SUSPENDED,
      reason: 'Fraud report',
    });

    expect(harness.updateStatus).toHaveBeenCalledWith('user-1', UserStatus.SUSPENDED);
    expect(harness.revokeAllForUser).toHaveBeenCalledWith('user-1');
    expect(harness.auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_STATUS_CHANGED', reason: 'Fraud report' }),
    );
  });

  it('does not revoke sessions when reactivating a user', async () => {
    const harness = buildHarness();
    harness.updateStatus.mockResolvedValue({ before: UserStatus.SUSPENDED, after: UserStatus.ACTIVE });

    await harness.service.updateUserStatus(ADMIN_ID, 'user-1', {
      status: UserStatus.ACTIVE,
      reason: 'Appeal approved',
    });

    expect(harness.revokeAllForUser).not.toHaveBeenCalled();
  });
});
