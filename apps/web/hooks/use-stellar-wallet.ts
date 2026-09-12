'use client';

import { useEffect } from 'react';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StellarNetworkName } from '@mezzo/shared-types';
import { useAuthStore } from '../lib/auth-store';
import {
  getStellarRailConfig,
  getStellarWallet,
  linkStellarWallet,
  requestStellarLinkChallenge,
  unlinkStellarWallet,
} from '../lib/stellar-client';
import {
  connectWallet,
  disconnectWallet,
  restoreWalletAddress,
  signWalletMessage,
} from '../lib/stellar-wallet';

const WALLET_QUERY_KEY = ['stellar-wallet'];
const RAIL_CONFIG_QUERY_KEY = ['stellar-rail-config'];
const WALLET_ADDRESS_QUERY_KEY = ['stellar-wallet-address'];

function resolveNetwork(queryClient: QueryClient): Promise<StellarNetworkName> {
  return queryClient
    .ensureQueryData({ queryKey: RAIL_CONFIG_QUERY_KEY, queryFn: getStellarRailConfig })
    .then((config) => config.network);
}

export function useStellarRailConfig(enabled: boolean) {
  return useQuery({
    queryKey: RAIL_CONFIG_QUERY_KEY,
    queryFn: getStellarRailConfig,
    enabled,
    staleTime: Infinity,
  });
}

export function useStellarWallet(enabled: boolean) {
  return useQuery({ queryKey: WALLET_QUERY_KEY, queryFn: getStellarWallet, enabled });
}

export function useWalletAddress(enabled: boolean) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: WALLET_ADDRESS_QUERY_KEY,
    queryFn: async () => restoreWalletAddress(await resolveNetwork(queryClient)),
    enabled,
  });
}

export function useConnectStellarWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const network = await resolveNetwork(queryClient);
      const accountId = await connectWallet(network);
      const challenge = await requestStellarLinkChallenge(accountId);
      const signature = await signWalletMessage(network, accountId, challenge.message);

      return linkStellarWallet({ accountId, signature });
    },
    onSuccess: (account) => {
      queryClient.setQueryData(WALLET_QUERY_KEY, account);
      queryClient.setQueryData(WALLET_ADDRESS_QUERY_KEY, account.accountId);
    },
  });
}

export function useDisconnectStellarWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await unlinkStellarWallet();
      await disconnectWallet();
    },
    onSettled: () => {
      queryClient.setQueryData(WALLET_QUERY_KEY, null);
      queryClient.setQueryData(WALLET_ADDRESS_QUERY_KEY, null);
    },
  });
}

export function useStellarWalletSessionSync(): void {
  const status = useAuthStore((state) => state.status);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status !== 'unauthenticated') {
      return;
    }

    void disconnectWallet();
    queryClient.removeQueries({ queryKey: WALLET_QUERY_KEY });
    queryClient.removeQueries({ queryKey: WALLET_ADDRESS_QUERY_KEY });
  }, [status, queryClient]);
}
