import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationCenter } from "../components/notifications/notification-center";
import { renderWithProviders } from "./render-with-providers";
import { useAuthStore } from "../lib/auth-store";

vi.mock("socket.io-client", () => ({
  io: () => ({ on: vi.fn(), emit: vi.fn(), io: { on: vi.fn() }, close: vi.fn() }),
}));

const markAllRead = vi.fn(async () => undefined);
const markOneRead = vi.fn(async () => ({}));

vi.mock("../lib/notifications-client", () => ({
  getNotifications: vi.fn(async () => [
    {
      id: "notif-1",
      escrowId: "escrow-1",
      eventType: "SHIPPED",
      channel: "EMAIL",
      status: "SENT",
      isRead: false,
      readAt: null,
      createdAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
    },
  ]),
  markAllNotificationsRead: () => markAllRead(),
  markNotificationRead: (_id: string) => markOneRead(),
}));

describe("NotificationCenter", () => {
  beforeEach(() => {
    markAllRead.mockClear();
    markOneRead.mockClear();
    useAuthStore.setState({
      status: "authenticated",
      accessToken: "token",
      user: {
        id: "user-1",
        email: "buyer@example.com",
        role: "USER",
        createdAt: new Date(),
      },
    });
  });

  it("shows an unread badge and clears it once opened", async () => {
    renderWithProviders(<NotificationCenter />);

    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());

    await userEvent.click(
      screen.getByRole("button", { name: "Notifications" }),
    );

    expect(await screen.findByText("The item was shipped")).toBeInTheDocument();
    await waitFor(() => expect(markAllRead).toHaveBeenCalled());
  });

  it("closes the dropdown when clicking outside it", async () => {
    renderWithProviders(
      <div>
        <NotificationCenter />
        <button type="button">Outside</button>
      </div>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Notifications" }),
    );
    expect(await screen.findByText("The item was shipped")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Outside" }));

    await waitFor(() =>
      expect(screen.queryByText("The item was shipped")).not.toBeInTheDocument(),
    );
  });
});
