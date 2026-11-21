'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { assignStaffToShop, getUsers } from '@/lib/api-client';

interface StaffAssignmentModalProps {
  isOpen: boolean;
  shopId: string;
  shopName: string;
  onClose: () => void;
}

export function StaffAssignmentModal({ isOpen, shopId, shopName, onClose }: StaffAssignmentModalProps) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ['users-for-assignment'],
    queryFn: getUsers,
    enabled: isOpen,
  });

  const assignMutation = useMutation({
    mutationFn: () => assignStaffToShop(shopId, selectedUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shops'] });
      setSelectedUserId('');
      setError('');
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to assign staff');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedUserId) {
      setError('Please select a staff member');
      return;
    }

    assignMutation.mutate();
  };

  // Filter for any non-admin users that can be assigned to shops
  const availableUsers = users?.filter((u) => u.role !== 'ADMIN') || [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface rounded-2xl shadow-float max-w-md w-full mx-4 overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-line">
          <h2 className="text-2xl font-display">Assign Staff</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-ink rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-4">
            <p className="text-sm text-fog mb-4">
              Assign staff member to: <span className="font-medium text-vellum">{shopName}</span>
            </p>
          </div>

          <div className="mb-6">
            <label htmlFor="user-select" className="block text-sm font-medium mb-2">
              Select Staff Member
            </label>
            <div className="space-y-2">
              {isLoading ? (
                <div className="text-sm text-fog">Loading users...</div>
              ) : (
                <select
                  id="user-select"
                  value={selectedUserId}
                  onChange={(e) => {
                    setSelectedUserId(e.target.value);
                    setError('');
                  }}
                  disabled={isLoading || assignMutation.isPending}
                  className="w-full px-4 py-3 bg-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-mint focus:border-transparent"
                >
                  <option value="">Choose a user...</option>
                  {availableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.email} ({user.role})
                    </option>
                  ))}
                </select>
              )}
              {selectedUserId && availableUsers.length > 0 && (
                <div className="flex items-center gap-3 p-3 bg-ink rounded-lg border border-line">
                  {availableUsers.find((u) => u.id === selectedUserId)?.avatarUrl ? (
                    <img
                      src={availableUsers.find((u) => u.id === selectedUserId)!.avatarUrl!}
                      alt="Profile"
                      className="w-10 h-10 rounded-full object-cover border-2 border-line"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-mint/20 flex items-center justify-center text-mint font-medium text-sm">
                      {availableUsers
                        .find((u) => u.id === selectedUserId)
                        ?.email[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-vellum truncate">
                      {availableUsers.find((u) => u.id === selectedUserId)?.email}
                    </div>
                    <div className="text-sm text-fog">
                      {availableUsers.find((u) => u.id === selectedUserId)?.role}
                    </div>
                  </div>
                </div>
              )}
              {availableUsers.length === 0 && !isLoading && (
                <p className="text-sm text-seller mt-2">No users available to assign</p>
              )}
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-seller/10 border border-seller/20 rounded-lg text-sm text-seller">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-line rounded-lg hover:bg-ink transition-colors font-medium"
              disabled={assignMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedUserId || assignMutation.isPending}
              className="flex-1 px-6 py-3 bg-mint text-white rounded-lg hover:bg-mint-deep transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {assignMutation.isPending ? 'Assigning...' : 'Assign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
