import { NormalizedInboundMessage } from './dto/whatsapp.schemas';

export const WHATSAPP_INBOUND_QUEUE = 'whatsapp-inbound';
export const WHATSAPP_INBOUND_JOB = 'process-inbound-message';

export type WhatsAppInboundJobData = NormalizedInboundMessage;
