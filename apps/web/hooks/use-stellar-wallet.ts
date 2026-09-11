'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getStellarWallet, linkStellarWallet, unlinkStellarWallet } from '../lib/stellar-client';
import { connectWallet } from '../lib/stellar-wallet';

const WALLET_QUERY_KEY = ['stellar-wallet'];

export function useStellarWallet(enabled: boolean) {
  return useQuery({ queryKey: WALLET_QUERY_KEY, queryFn: getStellarWallet, enabled });
}

export function useConnectStellarWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => linkStellarWallet(await connectWallet()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEY });
    },
  });
}

export function useDisconnectStellarWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: unlinkStellarWallet,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEY });
    },
  });
}
