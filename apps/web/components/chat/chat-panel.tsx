"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, ShieldAlert } from "lucide-react";
import type {
  ChatMessageResponse,
  ChatReadState,
  EscrowDetailResponse,
} from "@mezzo/shared-types";
import { useAuthStore } from "../../lib/auth-store";
import { formatTime } from "../../lib/format-date";
import {
  getChatMessages,
  getChatReadState,
  markChatRead,
} from "../../lib/chat-client";
import { useChatSocket } from "../../hooks/use-chat-socket";
import { useChatAttachment } from "../../hooks/use-chat-attachment";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

interface ChatPanelProps {
  escrow: EscrowDetailResponse;
}

interface PendingMessage extends ChatMessageResponse {
  pending?: boolean;
  failed?: boolean;
}

let localIdCounter = 0;
function nextLocalId(): string {
  localIdCounter += 1;
  return `local-${Date.now()}-${localIdCounter}`;
}

function canAccessChat(
  escrow: EscrowDetailResponse,
  userId: string,
  role: string | undefined,
): boolean {
  const isParty = escrow.parties.some((party) => party.userId === userId);
  if (isParty) {
    return true;
  }
  const isArbiterRole = role === "ARBITER" || role === "ADMIN";
  return isArbiterRole && escrow.state === "DISPUTED";
}

export function ChatPanel({ escrow }: ChatPanelProps) {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const [localMessages, setLocalMessages] = useState<PendingMessage[]>([]);
  const [readByCounterparty, setReadByCounterparty] =
    useState<ChatReadState | null>(null);
  const [body, setBody] = useState("");
  const attachment = useChatAttachment(escrow.id);
  const listRef = useRef<HTMLDivElement>(null);

  const allowed = currentUser
    ? canAccessChat(escrow, currentUser.id, currentUser.role)
    : false;

  const messagesQuery = useQuery({
    queryKey: ["chat", escrow.id],
    queryFn: () => getChatMessages(escrow.id),
    enabled: allowed,
  });

  const readStateQuery = useQuery({
    queryKey: ["chat-read", escrow.id],
    queryFn: () => getChatReadState(escrow.id),
    enabled: allowed,
  });

  useEffect(() => {
    const others =
      readStateQuery.data?.filter(
        (state) => state.userId !== currentUser?.id,
      ) ?? [];
    setReadByCounterparty(others[0] ?? null);
  }, [readStateQuery.data, currentUser?.id]);

  const { status, sendMessage, markRead } = useChatSocket(escrow.id, {
    onMessage: (message) => {
      queryClient.setQueryData<ChatMessageResponse[]>(
        ["chat", escrow.id],
        (current) => [...(current ?? []), message],
      );
      setLocalMessages((current) =>
        current.filter((item) => item.body !== message.body || !item.pending),
      );
    },
    onRead: (readState) => {
      if (readState.userId !== currentUser?.id) {
        setReadByCounterparty(readState);
      }
    },
  });

  const messageCount = messagesQuery.data?.length ?? 0;

  useEffect(() => {
    if (!allowed) return;
    void markChatRead(escrow.id).catch(() => undefined);
    markRead();
  }, [allowed, escrow.id, markRead, messageCount]);

  useEffect(() => {
    const list = listRef.current;
    if (list && typeof list.scrollTo === "function") {
      list.scrollTo({ top: list.scrollHeight });
    }
  }, [messagesQuery.data, localMessages]);

  const messages = useMemo<PendingMessage[]>(
    () => [...(messagesQuery.data ?? []), ...localMessages],
    [messagesQuery.data, localMessages],
  );

  if (!currentUser) {
    return null;
  }

  if (!allowed) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed border-line px-4 py-10 text-center">
        <ShieldAlert className="h-5 w-5 text-mute" />
        <p className="mt-2 text-sm text-fog">
          You do not have access to this conversation.
        </p>
      </div>
    );
  }

  function retry(message: PendingMessage): void {
    setLocalMessages((current) =>
      current.map((item) =>
        item.id === message.id
          ? { ...item, failed: false, pending: true }
          : item,
      ),
    );
    submit(message.body, message.attachment?.id, message.id);
  }

  function submit(
    text: string,
    attachmentEvidenceItemId?: string,
    existingLocalId?: string,
  ): void {
    const trimmed = text.trim();
    if (!trimmed && !attachmentEvidenceItemId) {
      return;
    }

    const localId = existingLocalId ?? nextLocalId();
    if (!existingLocalId) {
      const localMessage: PendingMessage = {
        id: localId,
        escrowId: escrow.id,
        senderId: currentUser!.id,
        body: trimmed,
        attachment: attachment.confirmed,
        createdAt: new Date(),
        pending: true,
      };
      setLocalMessages((current) => [...current, localMessage]);
    }

    if (status !== "connected") {
      setLocalMessages((current) =>
        current.map((item) =>
          item.id === localId
            ? { ...item, pending: false, failed: true }
            : item,
        ),
      );
      return;
    }

    sendMessage(trimmed, attachmentEvidenceItemId);
    setTimeout(() => {
      setLocalMessages((current) =>
        current.map((item) =>
          item.id === localId && item.pending
            ? { ...item, pending: false, failed: true }
            : item,
        ),
      );
    }, 5000);
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    submit(body, attachment.confirmed?.id ?? undefined);
    setBody("");
    attachment.clear();
  }

  return (
    <div className="flex h-[28rem] flex-col rounded-xl border border-line-soft bg-surface">
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-mute">No messages yet.</p>
        ) : (
          messages.map((message) => {
            const isMine = message.senderId === currentUser.id;
            return (
              <div
                key={message.id}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    isMine
                      ? "bg-mint/20 text-vellum"
                      : "bg-surface-2 text-vellum"
                  } ${message.pending ? "opacity-60" : ""}`}
                >
                  {message.body ? <p>{message.body}</p> : null}
                  {message.attachment ? (
                    <a
                      href={message.attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 flex items-center gap-1 text-xs text-mint underline"
                    >
                      <Paperclip className="h-3 w-3" /> Attachment
                    </a>
                  ) : null}
                  {message.failed ? (
                    <button
                      type="button"
                      onClick={() => retry(message)}
                      className="mt-1 block text-xs text-danger underline"
                    >
                      Failed to send — retry
                    </button>
                  ) : (
                    <p className="mt-1 text-[10px] text-mute/70">
                      {formatTime(message.createdAt)}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
        {readByCounterparty ? (
          <p className="text-right text-xs text-mute">Seen</p>
        ) : null}
      </div>
      {status !== 'connected' ? (
        <p className="border-t border-line-soft px-3 py-1.5 text-xs text-mute">
          {status === 'forbidden'
            ? 'This conversation is closed to you.'
            : 'Reconnecting — messages you send now may not go through.'}
        </p>
      ) : null}
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 border-t border-line-soft p-3"
      >
        <label className="cursor-pointer text-mute hover:text-vellum">
          <Paperclip className="h-4 w-4" />
          <input
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void attachment.attach(file);
              }
            }}
          />
        </label>
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a message"
          rows={1}
          className="flex-1"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(body, attachment.confirmed?.id ?? undefined);
              setBody("");
              attachment.clear();
            }
          }}
        />
        <Button
          type="submit"
          size="sm"
          disabled={attachment.status === "uploading"}
        >
          Send
        </Button>
      </form>
      {attachment.status === "uploading" ? (
        <p className="px-3 pb-2 text-xs text-mute">Uploading attachment…</p>
      ) : null}
      {attachment.status === "confirmed" ? (
        <p className="px-3 pb-2 text-xs text-mint">
          Attachment ready: {attachment.fileName}
        </p>
      ) : null}
      {attachment.status === "error" ? (
        <p className="px-3 pb-2 text-xs text-danger">
          {attachment.errorMessage}
        </p>
      ) : null}
    </div>
  );
}
