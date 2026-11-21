'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import {
  getPowerbank,
  markPowerbankAvailable,
  markPowerbankMaintenance,
  markPowerbankLost,
  markPowerbankUnreturned,
  PowerbankDto,
} from '@/lib/api-client';

interface PowerbankScannerPanelProps {
  initialPowerbankId?: string;
}

type StatusAction = 'AVAILABLE' | 'MAINTENANCE' | 'LOST' | 'UNRETURNED';

export function PowerbankScannerPanel({ initialPowerbankId }: PowerbankScannerPanelProps) {
  const [powerbankId, setPowerbankId] = useState(initialPowerbankId || '');
  const [powerbank, setPowerbank] = useState<PowerbankDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<StatusAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchPowerbank = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      const data = await getPowerbank(id);
      setPowerbank(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch powerbank';
      setError(message);
      setPowerbank(null);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (status: StatusAction) => {
    if (!powerbank) return;

    try {
      setUpdatingStatus(status);
      setError(null);
      setSuccess(null);

      let updated: PowerbankDto;
      switch (status) {
        case 'AVAILABLE':
          updated = await markPowerbankAvailable(powerbank.id);
          break;
        case 'MAINTENANCE':
          updated = await markPowerbankMaintenance(powerbank.id);
          break;
        case 'LOST':
          updated = await markPowerbankLost(powerbank.id);
          break;
        case 'UNRETURNED':
          updated = await markPowerbankUnreturned(powerbank.id);
          break;
      }

      setPowerbank(updated);
      setSuccess(`Powerbank marked as ${status}`);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update status';
      setError(message);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (powerbankId.trim()) {
      await fetchPowerbank(powerbankId);
    }
  };

  const statusColors: Record<string, string> = {
    AVAILABLE: 'bg-green-500/10 text-green-700 border-green-500/30',
    RENTED: 'bg-blue-500/10 text-blue-700 border-blue-500/30',
    OVERDUE: 'bg-orange-500/10 text-orange-700 border-orange-500/30',
    MAINTENANCE: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30',
    LOST: 'bg-red-500/10 text-red-700 border-red-500/30',
    UNRETURNED: 'bg-red-500/10 text-red-700 border-red-500/30',
  };

  return (
    <div className="bg-surface rounded-xl p-6 shadow-card">
      <form onSubmit={handleManualSearch} className="mb-8">
        <div className="flex gap-2">
          <input
            type="text"
            value={powerbankId}
            onChange={(e) => setPowerbankId(e.target.value)}
            placeholder="Enter powerbank ID or scan QR code..."
            className="flex-1 px-4 py-3 bg-ink border border-line rounded-lg text-white placeholder-fog focus:outline-none focus:border-mint transition-colors"
          />
          <button
            type="submit"
            disabled={loading || !powerbankId.trim()}
            className="px-6 py-3 bg-mint text-white rounded-lg hover:bg-mint-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Search'}
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-600 font-medium">Error</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-6 flex gap-3">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-600 font-medium">{success}</p>
        </div>
      )}

      {loading && (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-mint mx-auto mb-4" />
          <p className="text-fog">Loading powerbank details...</p>
        </div>
      )}

      {powerbank && !loading && (
        <div>
          <div className="grid grid-cols-2 gap-4 mb-8 p-4 bg-ink rounded-lg">
            <div>
              <p className="text-xs uppercase tracking-wider text-mute mb-1">ID</p>
              <p className="font-mono text-sm text-vellum break-all">{powerbank.id}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-mute mb-1">Number</p>
              <p className="font-display text-lg text-white">{powerbank.number}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-mute mb-1">Shop ID</p>
              <p className="font-mono text-sm text-vellum">{powerbank.shopId}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-mute mb-1">Current Status</p>
              <div
                className={`inline-block px-3 py-1 rounded-full text-sm font-medium border ${
                  statusColors[powerbank.status] || statusColors.AVAILABLE
                }`}
              >
                {powerbank.status}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-mute mb-4">Update Status</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <button
                onClick={() => handleStatusChange('AVAILABLE')}
                disabled={updatingStatus !== null}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-green-500/10 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
              >
                {updatingStatus === 'AVAILABLE' && <Loader2 className="w-4 h-4 animate-spin" />}
                Available
              </button>
              <button
                onClick={() => handleStatusChange('MAINTENANCE')}
                disabled={updatingStatus !== null}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 rounded-lg hover:bg-yellow-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
              >
                {updatingStatus === 'MAINTENANCE' && <Loader2 className="w-4 h-4 animate-spin" />}
                Maintenance
              </button>
              <button
                onClick={() => handleStatusChange('LOST')}
                disabled={updatingStatus !== null}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
              >
                {updatingStatus === 'LOST' && <Loader2 className="w-4 h-4 animate-spin" />}
                Lost
              </button>
              <button
                onClick={() => handleStatusChange('UNRETURNED')}
                disabled={updatingStatus !== null}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
              >
                {updatingStatus === 'UNRETURNED' && <Loader2 className="w-4 h-4 animate-spin" />}
                Unreturned
              </button>
            </div>
          </div>
        </div>
      )}

      {!powerbank && !loading && !error && (
        <div className="text-center py-12 text-fog">
          <p>Enter a powerbank ID or scan a QR code to get started</p>
        </div>
      )}
    </div>
  );
}
