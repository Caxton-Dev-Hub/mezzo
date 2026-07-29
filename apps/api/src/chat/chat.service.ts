import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ChatMessage } from '../database/entities/chat-message.entity';
import { ChatRead } from '../database/entities/chat-read.entity';
import { EvidenceItem } from '../database/entities/evidence-item.entity';
import { EvidenceFlag } from '../database/entities/evidence-flag.entity';
import { EscrowService } from '../escrow/escrow.service';
import { NotEscrowPartyError } from '../escrow/errors/not-escrow-party.error';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UserRole } from '../users/entities/user-role.enum';
import { EvidenceItemResponse, toEvidenceItemResponse } from '../evidence/dto/evidence-response';
import { SendMessageDto } from './dto/chat.schemas';
import { ChatMessageResponse, ChatReadState, toChatMessageResponse } from './dto/chat-response';
import { EvidenceAttachmentNotFoundError } from './errors/evidence-attachment-not-found.error';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private readonly messages: Repository<ChatMessage>,
    @InjectRepository(EvidenceItem)
    private readonly evidenceItems: Repository<EvidenceItem>,
    @InjectRepository(EvidenceFlag)
    private readonly evidenceFlags: Repository<EvidenceFlag>,
    @InjectRepository(ChatRead)
    private readonly chatReads: Repository<ChatRead>,
    private readonly escrowService: EscrowService,
  ) {}

  async assertCanAccess(escrowId: string, user: AuthenticatedUser): Promise<void> {
    const { parties } = await this.escrowService.getDetail(escrowId);
    if (parties.some((party) => party.userId === user.id)) {
      return;
    }

    const isArbiterRole = user.role === UserRole.ARBITER || user.role === UserRole.ADMIN;
    if (isArbiterRole && (await this.escrowService.hasEverBeenDisputed(escrowId))) {
      return;
    }

    throw new NotEscrowPartyError();
  }

  async send(escrowId: string, actor: AuthenticatedUser, dto: SendMessageDto): Promise<ChatMessageResponse> {
    await this.assertCanAccess(escrowId, actor);

    let attachmentEvidenceItemId: string | null = null;
    let attachment: EvidenceItemResponse | null = null;

    if (dto.attachmentEvidenceItemId) {
      const item = await this.evidenceItems.findOne({
        where: { id: dto.attachmentEvidenceItemId, escrowId },
      });
      if (!item) {
        throw new EvidenceAttachmentNotFoundError();
      }
      const flags = await this.evidenceFlags.find({ where: { evidenceItemId: item.id } });
      attachmentEvidenceItemId = item.id;
      attachment = toEvidenceItemResponse(item, flags);
    }

    const saved = await this.messages.save(
      this.messages.create({
        escrowId,
        senderId: actor.id,
        body: dto.body,
        attachmentEvidenceItemId,
      }),
    );

    return toChatMessageResponse(saved, attachment);
  }

  async list(escrowId: string, actor: AuthenticatedUser): Promise<ChatMessageResponse[]> {
    await this.assertCanAccess(escrowId, actor);
    return this.fetchAll(escrowId);
  }

  async getTranscript(escrowId: string): Promise<ChatMessageResponse[]> {
    return this.fetchAll(escrowId);
  }

  async markRead(escrowId: string, actor: AuthenticatedUser): Promise<ChatReadState> {
    await this.assertCanAccess(escrowId, actor);

    const lastReadAt = new Date();
    await this.chatReads
      .createQueryBuilder()
      .insert()
      .values({ escrowId, userId: actor.id, lastReadAt })
      .orUpdate(['last_read_at'], ['escrow_id', 'user_id'])
      .execute();

    return { userId: actor.id, lastReadAt };
  }

  async getReadState(escrowId: string, actor: AuthenticatedUser): Promise<ChatReadState[]> {
    await this.assertCanAccess(escrowId, actor);
    const rows = await this.chatReads.find({ where: { escrowId } });
    return rows.map((row) => ({ userId: row.userId, lastReadAt: row.lastReadAt }));
  }

  private async fetchAll(escrowId: string): Promise<ChatMessageResponse[]> {
    const messages = await this.messages.find({
      where: { escrowId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    const attachmentIds = messages
      .map((message) => message.attachmentEvidenceItemId)
      .filter((id): id is string => id !== null);

    const items =
      attachmentIds.length > 0 ? await this.evidenceItems.find({ where: { id: In(attachmentIds) } }) : [];
    const itemIds = items.map((item) => item.id);
    const flags =
      itemIds.length > 0 ? await this.evidenceFlags.find({ where: { evidenceItemId: In(itemIds) } }) : [];
    const itemById = new Map(items.map((item) => [item.id, item]));

    return messages.map((message) => {
      const item = message.attachmentEvidenceItemId
        ? itemById.get(message.attachmentEvidenceItemId)
        : undefined;
      const attachment = item ? toEvidenceItemResponse(item, flags) : null;
      return toChatMessageResponse(message, attachment);
    });
  }
}
