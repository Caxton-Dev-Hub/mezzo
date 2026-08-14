import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Escrow } from '../database/entities/escrow.entity';
import { EscrowTerms } from '../database/entities/escrow-terms.entity';
import { EscrowParty } from '../database/entities/escrow-party.entity';
import { User } from '../database/entities/user.entity';
import { WhatsAppAccount } from '../database/entities/whatsapp-account.entity';
import { EscrowService } from '../escrow/escrow.service';
import { SettlementService } from '../escrow/settlement.service';
import { EscrowRole } from '../escrow/entities/escrow-role.enum';
import { computeFeeSplit } from '../escrow/fee-split';
import { Money } from '../common/money/money';
import { ChatService } from '../chat/chat.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UserRole } from '../users/entities/user-role.enum';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { DomainError } from '../common/errors/domain-error';
import { NormalizedInboundMessage } from './dto/whatsapp.schemas';
import { WHATSAPP_CLIENT, WhatsAppClient } from './client/whatsapp-client.interface';
import { WhatsAppLinkingService } from './whatsapp-linking.service';
import { WhatsAppPinService } from './whatsapp-pin.service';
import {
  ApproveConfirmationContext,
  ConversationSession,
  ReleaseConfirmationContext,
  WhatsAppConversationSessionService,
} from './whatsapp-conversation-session.service';
import { ConversationState } from './entities/conversation-state.enum';
import { WhatsAppLinkCodeInvalidError } from './errors/whatsapp-link-code-invalid.error';
import { WhatsAppTransactionalDisabledError } from './errors/whatsapp-transactional-disabled.error';
import { WhatsAppPinNotSetError } from './errors/whatsapp-pin-not-set.error';
import { WhatsAppPinIncorrectError } from './errors/whatsapp-pin-incorrect.error';
import { WhatsAppSessionExpiredError } from './errors/whatsapp-session-expired.error';

const HELP_TEXT = [
  'Mezzo commands:',
  'STATUS <code> — check an escrow',
  'LIST — list your escrows',
  'APPROVE <code> — confirm delivery',
  'RELEASE <code> — release funds to the seller',
  'DISPUTE <code> <message> — reply on a dispute',
  'EVIDENCE <code> — get an evidence upload link',
  'PIN SET <4-6 digits> — set your release PIN',
  'OPTOUT / OPTIN — toggle WhatsApp notifications',
].join('\n');

function formatMoney(money: Money): string {
  return `${money.currency} ${(money.amount / 100).toFixed(2)}`;
}

@Injectable()
export class WhatsAppCommandDispatcherService {
  constructor(
    @InjectRepository(Escrow)
    private readonly escrows: Repository<Escrow>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly escrowService: EscrowService,
    private readonly settlementService: SettlementService,
    private readonly chatService: ChatService,
    private readonly auditService: AuditService,
    private readonly linkingService: WhatsAppLinkingService,
    private readonly pinService: WhatsAppPinService,
    private readonly sessionService: WhatsAppConversationSessionService,
    private readonly settingsService: SettingsService,
    private readonly configService: ConfigService,
    @Inject(WHATSAPP_CLIENT)
    private readonly client: WhatsAppClient,
  ) {}

  async handle(message: NormalizedInboundMessage): Promise<void> {
    const phoneNumber = message.from;
    const text = (message.buttonReplyId ?? message.text ?? '').trim();
    const session = await this.sessionService.get(phoneNumber);

    if (session && session.state !== ConversationState.IDLE) {
      await this.handlePinConfirmation(phoneNumber, session, text);
      return;
    }

    const account = await this.linkingService.findByPhoneNumber(phoneNumber);

    if (!account) {
      await this.handleUnlinkedMessage(phoneNumber, text);
      return;
    }

    await this.handleCommand(phoneNumber, account, text);
  }

  private async handleUnlinkedMessage(phoneNumber: string, text: string): Promise<void> {
    if (/^\d{6}$/.test(text)) {
      try {
        const account = await this.linkingService.confirmLink(phoneNumber, text);
        await this.auditService.record({
          actorId: account.userId,
          action: 'WHATSAPP_ACCOUNT_LINKED',
          entityType: 'user',
          entityId: account.userId,
          after: { phoneNumber },
          correlationId: randomUUID(),
        });
        await this.client.sendText(
          phoneNumber,
          'Your WhatsApp number is now linked to Mezzo. Send HELP to see what you can do.',
        );
      } catch (error) {
        if (error instanceof WhatsAppLinkCodeInvalidError) {
          await this.client.sendText(phoneNumber, error.message);
          return;
        }
        throw error;
      }
      return;
    }

    await this.client.sendText(
      phoneNumber,
      'This number is not linked to a Mezzo account yet. Start linking from the Mezzo app, then reply here with the 6-digit code.',
    );
  }

  private async handleCommand(
    phoneNumber: string,
    account: WhatsAppAccount,
    text: string,
  ): Promise<void> {
    const [rawCommand, ...rest] = text.split(/\s+/).filter(Boolean);
    const command = (rawCommand ?? '').toUpperCase();
    const userId = account.userId;

    try {
      switch (command) {
        case 'HELP':
        case '':
          await this.client.sendText(phoneNumber, HELP_TEXT);
          return;
        case 'STATUS':
          await this.handleStatus(phoneNumber, userId, rest[0]);
          return;
        case 'LIST':
          await this.handleList(phoneNumber, userId);
          return;
        case 'APPROVE':
          await this.handleApprove(phoneNumber, account, rest[0]);
          return;
        case 'RELEASE':
          await this.handleRelease(phoneNumber, account, rest[0]);
          return;
        case 'PIN':
          await this.handlePinSet(phoneNumber, userId, rest);
          return;
        case 'DISPUTE':
          await this.handleDisputeReply(phoneNumber, userId, rest[0], rest.slice(1).join(' '));
          return;
        case 'EVIDENCE':
          await this.handleEvidenceLink(phoneNumber, userId, rest[0]);
          return;
        case 'OPTOUT':
          await this.linkingService.setOptedOut(userId, true);
          await this.client.sendText(phoneNumber, 'You are opted out of WhatsApp notifications.');
          return;
        case 'OPTIN':
          await this.linkingService.setOptedOut(userId, false);
          await this.client.sendText(phoneNumber, 'You are opted back in to WhatsApp notifications.');
          return;
        default:
          await this.client.sendText(phoneNumber, `Unrecognized command. ${HELP_TEXT}`);
      }
    } catch (error) {
      if (error instanceof DomainError) {
        await this.client.sendText(phoneNumber, error.message);
        return;
      }
      if (error instanceof NotFoundException) {
        await this.client.sendText(phoneNumber, 'Escrow not found.');
        return;
      }
      throw error;
    }
  }

  private async findEscrowByCode(
    code: string | undefined,
    userId: string,
  ): Promise<{ escrow: Escrow; terms: EscrowTerms | null; parties: EscrowParty[] }> {
    if (!code) {
      throw new NotFoundException('Escrow not found');
    }
    const escrow = await this.escrows.findOne({ where: { code: code.toUpperCase() } });
    if (!escrow) {
      throw new NotFoundException('Escrow not found');
    }
    await this.escrowService.assertIsParty(escrow.id, userId);
    return this.escrowService.getDetail(escrow.id);
  }

  private async handleStatus(phoneNumber: string, userId: string, code?: string): Promise<void> {
    const { escrow, terms } = await this.findEscrowByCode(code, userId);
    const priceLine = terms ? formatMoney(Money.of(terms.priceAmount, terms.priceCurrency)) : 'n/a';
    await this.client.sendText(
      phoneNumber,
      `Escrow ${escrow.code}: ${escrow.state}. Price: ${priceLine}.`,
    );
  }

  private async handleList(phoneNumber: string, userId: string): Promise<void> {
    const rows = await this.escrowService.listForUser(userId);
    if (rows.length === 0) {
      await this.client.sendText(phoneNumber, 'You have no escrows yet.');
      return;
    }
    const lines = rows.map((row) => `${row.escrow.code}: ${row.escrow.state}`);
    await this.client.sendText(phoneNumber, ['Your escrows:', ...lines].join('\n'));
  }

  private async handleApprove(
    phoneNumber: string,
    account: WhatsAppAccount,
    code?: string,
  ): Promise<void> {
    await this.assertTransactionalEnabled();
    if (!this.pinService.hasPin(account)) {
      throw new WhatsAppPinNotSetError();
    }

    const { escrow } = await this.findEscrowByCode(code, account.userId);
    const context: ApproveConfirmationContext = { escrowId: escrow.id, escrowCode: escrow.code };
    await this.sessionService.set(phoneNumber, {
      state: ConversationState.CONFIRMING_APPROVE,
      userId: account.userId,
      approve: context,
    });
    await this.client.sendText(
      phoneNumber,
      `Confirm delivery for ${escrow.code}? This starts the inspection window. Reply with your PIN to confirm, or CANCEL to abort.`,
    );
  }

  private async handleRelease(
    phoneNumber: string,
    account: WhatsAppAccount,
    code?: string,
  ): Promise<void> {
    await this.assertTransactionalEnabled();
    if (!this.pinService.hasPin(account)) {
      throw new WhatsAppPinNotSetError();
    }

    const { escrow, terms, parties } = await this.findEscrowByCode(code, account.userId);
    if (!terms) {
      throw new NotFoundException('Escrow terms not found');
    }
    const seller = parties.find((party) => party.role === EscrowRole.SELLER);
    if (!seller) {
      throw new NotFoundException('Seller party not found');
    }

    const price = Money.of(terms.priceAmount, terms.priceCurrency);
    const { netAmount } = computeFeeSplit(price, terms.feeBps);
    const sellerUser = await this.users.findOne({ where: { id: seller.userId } });

    const context: ReleaseConfirmationContext = {
      escrowId: escrow.id,
      escrowCode: escrow.code,
      expectedAmount: netAmount.amount,
      expectedCurrency: netAmount.currency,
      counterpartyUserId: seller.userId,
    };
    await this.sessionService.set(phoneNumber, {
      state: ConversationState.CONFIRMING_RELEASE,
      userId: account.userId,
      release: context,
    });
    await this.client.sendText(
      phoneNumber,
      `Release ${formatMoney(netAmount)} to ${sellerUser?.email ?? seller.userId} for ${escrow.code}? Reply with your PIN to confirm, or CANCEL to abort.`,
    );
  }

  private async handlePinSet(phoneNumber: string, userId: string, rest: string[]): Promise<void> {
    const [subcommand, pin] = rest;
    if (subcommand?.toUpperCase() !== 'SET' || !pin || !/^\d{4,6}$/.test(pin)) {
      await this.client.sendText(phoneNumber, 'Usage: PIN SET 1234 (4-6 digits)');
      return;
    }
    await this.pinService.setPin(userId, pin);
    await this.client.sendText(phoneNumber, 'Your release PIN has been set.');
  }

  private async handleDisputeReply(
    phoneNumber: string,
    userId: string,
    code: string | undefined,
    body: string,
  ): Promise<void> {
    if (!body) {
      await this.client.sendText(phoneNumber, 'Usage: DISPUTE <code> <your message>');
      return;
    }
    const { escrow } = await this.findEscrowByCode(code, userId);
    const actor: AuthenticatedUser = { id: userId, role: UserRole.USER };
    await this.chatService.send(escrow.id, actor, { body });
    await this.client.sendText(phoneNumber, `Reply sent on ${escrow.code}.`);
  }

  private async handleEvidenceLink(phoneNumber: string, userId: string, code?: string): Promise<void> {
    const { escrow } = await this.findEscrowByCode(code, userId);
    const webAppUrl = this.configService.getOrThrow<string>('WEB_APP_URL');
    await this.client.sendText(
      phoneNumber,
      `Attach evidence for ${escrow.code} here: ${webAppUrl}/escrows/${escrow.id}/evidence`,
    );
  }

  private async handlePinConfirmation(
    phoneNumber: string,
    session: ConversationSession,
    text: string,
  ): Promise<void> {
    if (text.toUpperCase() === 'CANCEL') {
      await this.sessionService.clear(phoneNumber);
      await this.client.sendText(phoneNumber, 'Cancelled.');
      return;
    }

    const account = await this.linkingService.findByPhoneNumber(phoneNumber);
    if (!account) {
      await this.sessionService.clear(phoneNumber);
      await this.client.sendText(phoneNumber, 'This number is no longer linked to a Mezzo account.');
      return;
    }

    try {
      await this.pinService.verify(account, text);
    } catch (error) {
      if (error instanceof DomainError) {
        if (!(error instanceof WhatsAppPinIncorrectError)) {
          await this.sessionService.clear(phoneNumber);
        }
        await this.client.sendText(phoneNumber, error.message);
        return;
      }
      throw error;
    }

    const correlationId = randomUUID();

    try {
      if (session.state === ConversationState.CONFIRMING_RELEASE) {
        await this.completeRelease(phoneNumber, session, correlationId);
      } else if (session.state === ConversationState.CONFIRMING_APPROVE) {
        await this.completeApprove(phoneNumber, session, correlationId);
      }
    } finally {
      await this.sessionService.clear(phoneNumber);
    }
  }

  private async completeRelease(
    phoneNumber: string,
    session: ConversationSession,
    correlationId: string,
  ): Promise<void> {
    const release = session.release;
    if (!release) {
      throw new WhatsAppSessionExpiredError();
    }

    try {
      const before = await this.escrowService.getDetail(release.escrowId);
      const escrow = await this.settlementService.release(release.escrowId, session.userId);

      await this.auditService.record({
        actorId: session.userId,
        action: 'WHATSAPP_RELEASE_FUNDS',
        entityType: 'escrow',
        entityId: release.escrowId,
        before: { state: before.escrow.state },
        after: {
          state: escrow.state,
          amount: release.expectedAmount,
          currency: release.expectedCurrency,
          counterpartyUserId: release.counterpartyUserId,
        },
        correlationId,
      });

      await this.client.sendText(
        phoneNumber,
        `Released ${formatMoney(Money.of(release.expectedAmount, release.expectedCurrency))} for ${release.escrowCode}.`,
      );
    } catch (error) {
      if (error instanceof DomainError) {
        await this.client.sendText(phoneNumber, error.message);
        return;
      }
      throw error;
    }
  }

  private async completeApprove(
    phoneNumber: string,
    session: ConversationSession,
    correlationId: string,
  ): Promise<void> {
    const approve = session.approve;
    if (!approve) {
      throw new WhatsAppSessionExpiredError();
    }

    try {
      const before = await this.escrowService.getDetail(approve.escrowId);
      const escrow = await this.settlementService.confirmDelivery(approve.escrowId, session.userId);

      await this.auditService.record({
        actorId: session.userId,
        action: 'WHATSAPP_APPROVE_DELIVERY',
        entityType: 'escrow',
        entityId: approve.escrowId,
        before: { state: before.escrow.state },
        after: { state: escrow.state },
        correlationId,
      });

      await this.client.sendText(phoneNumber, `Delivery confirmed for ${approve.escrowCode}.`);
    } catch (error) {
      if (error instanceof DomainError) {
        await this.client.sendText(phoneNumber, error.message);
        return;
      }
      throw error;
    }
  }

  private async assertTransactionalEnabled(): Promise<void> {
    if (!(await this.settingsService.isWhatsappTransactionalEnabled())) {
      throw new WhatsAppTransactionalDisabledError();
    }
  }
}
