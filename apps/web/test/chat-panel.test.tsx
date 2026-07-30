import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  EscrowDetailResponse,
  EscrowRole,
  EscrowState,
} from "@mezzo/shared-types";
import { ChatPanel } from "../components/chat/chat-panel";
import { renderWithProviders } from "./render-with-providers";
import { useAuthStore } from "../lib/auth-store";
import { formatTime } from "../lib/format-date";
import { getChatMessages } from "../lib/chat-client";

const BUYER_ID = "buyer-id";
const SELLER_ID = "seller-id";
const STRANGER_ID = "stranger-id";

type Listener = (...args: unknown[]) => void;

let listeners: Record<string, Listener[]>;
let emitted: { event: string; payload: unknown }[];
let shouldConnect = true;

vi.mock("socket.io-client", () => ({
  io: () => {
    listeners = {};
    emitted = [];
    const socket = {
      on: (event: string, handler: Listener) => {
        listeners[event] = listeners[event] ?? [];
        listeners[event].push(handler);
        if (event === "connect" && shouldConnect) {
          queueMicrotask(() => handler());
        }
      },
      emit: (event: string, payload?: unknown) => {
        emitted.push({ event, payload });
      },
      io: { on: vi.fn() },
      close: vi.fn(),
    };
    return socket;
  },
}));

vi.mock("../lib/chat-client", () => ({
  getChatMessages: vi.fn(async () => []),
  getChatReadState: vi.fn(async () => []),
  markChatRead: vi.fn(async () => ({
    userId: BUYER_ID,
    lastReadAt: new Date(),
  })),
}));

function makeEscrow(state: EscrowState = "FUNDED"): EscrowDetailResponse {
  return {
    id: "escrow-1",
    state,
    version: 1,
    terms: {
      price: { amount: 100_000, currency: "NGN" },
      inspectionWindowHours: 48,
      deliveryMethod: "courier",
      itemDescription: "A vintage camera",
      feeBps: 250,
      requiresVerification: false,
      agreementText: null,
    },
    parties: [
      {
        userId: BUYER_ID,
        role: "BUYER" as EscrowRole,
        termsAcceptedAt: new Date(),
      },
      {
        userId: SELLER_ID,
        role: "SELLER" as EscrowRole,
        termsAcceptedAt: new Date(),
      },
    ],
    trackingReference: null,
    deliveredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("ChatPanel", () => {
  beforeEach(() => {
    shouldConnect = true;
  });

  it("denies a non-party access to the chat", async () => {
    useAuthStore.setState({
      status: "authenticated",
      accessToken: "token",
      user: {
        id: STRANGER_ID,
        email: "stranger@example.com",
        role: "USER",
        createdAt: new Date(),
      },
    });

    renderWithProviders(<ChatPanel escrow={makeEscrow()} />);

    expect(
      await screen.findByText("You do not have access to this conversation."),
    ).toBeInTheDocument();
  });

  it("shows an optimistic message immediately and reconciles it with the server copy", async () => {
    useAuthStore.setState({
      status: "authenticated",
      accessToken: "token",
      user: {
        id: BUYER_ID,
        email: "buyer@example.com",
        role: "USER",
        createdAt: new Date(),
      },
    });

    renderWithProviders(<ChatPanel escrow={makeEscrow()} />);
    await waitFor(() =>
      expect(listeners?.connect?.length ?? 0).toBeGreaterThan(0),
    );
    await waitFor(() =>
      expect(emitted.some((e) => e.event === "message:read")).toBe(true),
    );

    const textbox = screen.getByPlaceholderText("Write a message");
    await userEvent.type(textbox, "Is this still available?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("Is this still available?"),
    ).toBeInTheDocument();
    expect(emitted.some((e) => e.event === "message:send")).toBe(true);

    const messageNewHandler = listeners["message:new"]?.[0];
    expect(messageNewHandler).toBeTruthy();
    act(() => {
      messageNewHandler?.({
        id: "server-1",
        escrowId: "escrow-1",
        senderId: BUYER_ID,
        body: "Is this still available?",
        attachment: null,
        createdAt: new Date().toISOString(),
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText("Is this still available?")).toHaveLength(1);
    });
  });

  it("shows the time each message was sent", async () => {
    const createdAt = new Date("2026-01-15T10:32:00.000Z");
    vi.mocked(getChatMessages).mockResolvedValueOnce([
      {
        id: "server-1",
        escrowId: "escrow-1",
        senderId: SELLER_ID,
        body: "Sounds good",
        attachment: null,
        createdAt,
      },
    ]);
    useAuthStore.setState({
      status: "authenticated",
      accessToken: "token",
      user: {
        id: BUYER_ID,
        email: "buyer@example.com",
        role: "USER",
        createdAt: new Date(),
      },
    });

    renderWithProviders(<ChatPanel escrow={makeEscrow()} />);

    expect(await screen.findByText("Sounds good")).toBeInTheDocument();
    expect(screen.getByText(formatTime(createdAt))).toBeInTheDocument();
  });

  it("marks a send as failed and retryable when the socket is not connected", async () => {
    shouldConnect = false;
    useAuthStore.setState({
      status: "authenticated",
      accessToken: "token",
      user: {
        id: BUYER_ID,
        email: "buyer@example.com",
        role: "USER",
        createdAt: new Date(),
      },
    });

    renderWithProviders(<ChatPanel escrow={makeEscrow()} />);

    const textbox = await screen.findByPlaceholderText("Write a message");
    await userEvent.type(textbox, "hello?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("Failed to send — retry"),
    ).toBeInTheDocument();
  });
});
