import { useMutation } from '@tanstack/react-query';
import type { JoinWaitlistDto } from '@mezzo/shared-types';
import { joinWaitlist } from '../lib/waitlist-client';

export function useJoinWaitlist() {
  return useMutation({
    mutationFn: (dto: JoinWaitlistDto) => joinWaitlist(dto),
  });
}
