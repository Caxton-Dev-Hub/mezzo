import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { Currency } from '../common/money/currency';
import { ConversationState } from './entities/conversation-state.enum';

export interface ReleaseConfirmationContext {
  escrowId: string;
  escrowCode: string;
  expectedAmount: number;
  expectedCurrency: Currency;
  counterpartyUserId: string;
}

export interface ApproveConfirmationContext {
  escrowId: string;
  escrowCode: string;
}

export interface ConversationSession {
  state: ConversationState;
  userId: string;
  release?: ReleaseConfirmationContext;
  approve?: ApproveConfirmationContext;
}

function sessionKey(phoneNumber: string): string {
  return `whatsapp:session:${phoneNumber}`;
}

@Injectable()
export class WhatsAppConversationSessionService {
  constructor(
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async get(phoneNumber: string): Promise<ConversationSession | null> {
    const raw = await this.redis.get(sessionKey(phoneNumber));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as ConversationSession;
  }

  async set(phoneNumber: string, session: ConversationSession): Promise<void> {
    const ttlSeconds = this.configService.getOrThrow<number>('WHATSAPP_SESSION_TTL_SECONDS');
    await this.redis.set(sessionKey(phoneNumber), JSON.stringify(session), 'EX', ttlSeconds);
  }

  async clear(phoneNumber: string): Promise<void> {
    await this.redis.del(sessionKey(phoneNumber));
  }
}
