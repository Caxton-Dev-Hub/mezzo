'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { AuthGuard } from '@/components/auth-guard';
import { Navbar } from '@/components/layout/navbar';
import { StaffAssignmentModal } from '@/components/staff-assignment-modal';
import { getShopsForAdmin, createShop } from '@/lib/api-client';

function ShopsContent() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [shopName, setShopName] = useState('');
  const [shopLocation, setShopLocation] = useState('');
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const queryClient = useQueryClient();

  const { data: shops, isLoading } = useQuery({
    queryKey: ['shops'],
    queryFn: getShopsForAdmin,
  });

  const createMutation = useMutation({
    mutationFn: () => createShop({ name: shopName, location: shopLocation }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shops'] });
      setShopName('');
      setShopLocation('');
      setShowCreateForm(false);
      setSuccess('Shop created successfully');
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to create shop');
    },
  });

  const handleCreateShop = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!shopName.trim()) {
      setError('Shop name is required');
      return;
    }
    if (!shopLocation.trim()) {
      setError('Shop location is required');
      return;
    }

    createMutation.mutate();
  };

  const handleOpenStaffModal = (shopId: string) => {
    setSelectedShopId(shopId);
    setShowStaffModal(true);
  };

  const currentShop = shops?.find((s) => s.id === selectedShopId);

  return (
    <div className="min-h-screen bg-ink">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-display mb-2">Manage Shops</h1>
            <p className="text-fog">Create shops and assign staff members</p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-6 py-3 bg-mint text-white rounded-lg hover:bg-mint-deep transition-colors font-medium flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Shop
          </button>
        </div>

        {success && (
          <div className="mb-6 p-4 bg-mint/10 border border-mint/20 rounded-lg text-sm text-mint">
            ✓ {success}
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-seller/10 border border-seller/20 rounded-lg text-sm text-seller">
            {error}
          </div>
        )}

        {showCreateForm && (
          <div className="bg-surface rounded-2xl shadow-card p-8 mb-8">
            <h2 className="text-2xl font-display mb-6">Create New Shop</h2>
            <form onSubmit={handleCreateShop} className="space-y-4">
              <div>
                <label htmlFor="shop-name" className="block text-sm font-medium mb-2">
                  Shop Name
                </label>
                <input
                  id="shop-name"
                  type="text"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder="e.g., Victoria Island Shop"
                  disabled={createMutation.isPending}
                  className="w-full px-4 py-3 bg-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-mint"
                />
              </div>

              <div>
                <label htmlFor="shop-location" className="block text-sm font-medium mb-2">
                  Location
                </label>
                <input
                  id="shop-location"
                  type="text"
                  value={shopLocation}
                  onChange={(e) => setShopLocation(e.target.value)}
                  placeholder="e.g., 123 Main Street, Lagos VI"
                  disabled={createMutation.isPending}
                  className="w-full px-4 py-3 bg-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-mint"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 px-4 py-3 border border-line rounded-lg hover:bg-surface-2 transition-colors font-medium"
                  disabled={createMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 px-4 py-3 bg-mint text-white rounded-lg hover:bg-mint-deep transition-colors font-medium disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Shop'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-12 text-fog">Loading shops...</div>
          ) : shops && shops.length > 0 ? (
            shops.map((shop) => (
              <div key={shop.id} className="bg-surface rounded-2xl shadow-card p-6">
                <div className="mb-6">
                  <h3 className="text-2xl font-display text-vellum">{shop.name}</h3>
                  <p className="text-sm text-fog mt-1">{shop.location}</p>
                  <p className="text-xs text-mute mt-2">
                    Created: {new Date(shop.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => handleOpenStaffModal(shop.id)}
                    className="px-4 py-2 bg-mint text-white rounded-lg hover:bg-mint-deep transition-colors font-medium text-sm"
                  >
                    <Plus className="w-4 h-4 inline mr-2" />
                    Assign Staff
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-surface rounded-2xl shadow-card p-12 text-center text-fog">
              <p>No shops yet. Create one to get started.</p>
            </div>
          )}
        </div>
      </main>

      {currentShop && (
        <StaffAssignmentModal
          isOpen={showStaffModal}
          shopId={currentShop.id}
          shopName={currentShop.name}
          onClose={() => {
            setShowStaffModal(false);
            setSelectedShopId(null);
          }}
        />
      )}
    </div>
  );
}

export default function ShopsPage() {
  return (
    <AuthGuard requireAdmin>
      <ShopsContent />
    </AuthGuard>
  );
}
