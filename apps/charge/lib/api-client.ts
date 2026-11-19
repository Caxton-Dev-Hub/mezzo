import { useAuthStore } from './auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    useAuthStore.getState().clearAuth();
    throw new ApiError(401, 'Unauthorized', 'Session expired. Please log in again.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    console.log('[API Error]', { status: response.status, errorData }); // Debug log
    throw new ApiError(
      response.status,
      response.statusText,
      errorData.message || `Request failed: ${response.statusText}`,
      errorData.code,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

import type {
  LoginDto,
  LoginResponse,
  RegisterDto,
  RegisterResponse,
  VerifyEmailDto,
  ResendVerificationDto,
} from '@mezzo/shared-types';

export async function login(data: LoginDto): Promise<LoginResponse> {
  return fetchApi<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function register(data: RegisterDto): Promise<RegisterResponse> {
  return fetchApi<RegisterResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function verifyEmail(data: VerifyEmailDto): Promise<void> {
  return fetchApi<void>('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function resendVerification(data: ResendVerificationDto): Promise<void> {
  return fetchApi<void>('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface ShopResponse {
  id: string;
  name: string;
  location: string;
  createdAt: string;
}

export async function getShops(): Promise<ShopResponse[]> {
  return fetchApi<ShopResponse[]>('/shops');
}

export interface RentalResponse {
  id: string;
  powerbankId: string;
  userId: string;
  shopId: string;
  startedAt: string;
  dueAt: string;
  returnedAt: string | null;
  status: 'ACTIVE' | 'RETURNED' | 'OVERDUE' | 'UNRETURNED';
  baseChargeAmount: string;
  baseChargeCurrency: string;
  totalChargedAmount: string;
  totalChargedCurrency: string;
}

export interface RentalListResponse {
  rentals: RentalResponse[];
}

export async function getRentals(): Promise<RentalListResponse> {
  return fetchApi<RentalListResponse>('/rentals');
}

export async function getRental(id: string): Promise<RentalResponse> {
  return fetchApi<RentalResponse>(`/rentals/${id}`);
}

export interface CheckoutRequest {
  powerbankId: string;
  shopId: string;
}

export interface CheckoutResponse {
  rental: RentalResponse;
}

export async function checkout(data: CheckoutRequest): Promise<CheckoutResponse> {
  return fetchApi<CheckoutResponse>('/rentals/checkout', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function checkin(rentalId: string): Promise<RentalResponse> {
  return fetchApi<RentalResponse>(`/rentals/${rentalId}/checkin`, {
    method: 'POST',
  });
}

export interface SubmitVerificationRequest {
  fullName: string;
  phoneNumber: string;
  photoStorageKey: string;
}

export interface VerificationResponse {
  id: string;
  userId: string;
  fullName: string;
  phoneNumber: string;
  photoStorageKey: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
}

export async function submitVerification(
  data: SubmitVerificationRequest,
): Promise<VerificationResponse> {
  return fetchApi<VerificationResponse>('/shops/verifications', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getVerifications(status?: string): Promise<VerificationResponse[]> {
  const query = status ? `?status=${status}` : '';
  return fetchApi<VerificationResponse[]>(`/shops/verifications${query}`);
}

export async function getVerification(id: string): Promise<VerificationResponse> {
  return fetchApi<VerificationResponse>(`/shops/verifications/${id}`);
}

export interface ReviewVerificationRequest {
  notes?: string;
}

export async function approveVerification(
  id: string,
  data: ReviewVerificationRequest,
): Promise<VerificationResponse> {
  return fetchApi<VerificationResponse>(`/shops/verifications/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function rejectVerification(
  id: string,
  data: ReviewVerificationRequest,
): Promise<VerificationResponse> {
  return fetchApi<VerificationResponse>(`/shops/verifications/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface AccessoryResponse {
  id: string;
  shopId: string;
  name: string;
  priceAmount: string;
  priceCurrency: string;
  stockLevel: number;
  createdAt: string;
  updatedAt: string;
}

export interface AccessoryListResponse {
  items: AccessoryResponse[];
}

export async function getAccessories(shopId?: string): Promise<AccessoryListResponse> {
  const query = shopId ? `?shopId=${shopId}` : '';
  return fetchApi<AccessoryListResponse>(`/accessories${query}`);
}

export interface RecordSaleRequest {
  accessoryId: string;
  quantity: number;
}

export interface SaleResponse {
  id: string;
  accessoryId: string;
  soldBy: string;
  quantity: number;
  totalAmount: string;
  totalCurrency: string;
  soldAt: string;
}

export async function recordSale(data: RecordSaleRequest): Promise<SaleResponse> {
  return fetchApi<SaleResponse>('/accessories/sales', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface SaleListResponse {
  items: SaleResponse[];
}

export async function getSales(): Promise<SaleListResponse> {
  return fetchApi<SaleListResponse>('/accessories/sales');
}

export async function getPresignedUploadUrl(filename: string, contentType: string): Promise<{ uploadUrl: string; storageKey: string }> {
  return fetchApi<{ uploadUrl: string; storageKey: string }>('/evidence/presigned-upload', {
    method: 'POST',
    body: JSON.stringify({ filename, contentType }),
  });
}

export async function uploadFile(file: File): Promise<string> {
  const { uploadUrl, storageKey } = await getPresignedUploadUrl(file.name, file.type);
  
  await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type,
    },
  });

  return storageKey;
}

export interface WalletBalanceResponse {
  available: {
    amount: string;
    currency: string;
  };
  pending: {
    amount: string;
    currency: string;
  };
  heldInEscrow: {
    amount: string;
    currency: string;
  };
}

export async function getWalletBalance(): Promise<WalletBalanceResponse> {
  return fetchApi<WalletBalanceResponse>('/wallet');
}

export interface FundWalletRequest {
  amountKobo: number;
}

export interface FundWalletResponse {
  authorizationUrl: string;
  reference: string;
}

export async function fundWallet(data: FundWalletRequest): Promise<FundWalletResponse> {
  return fetchApi<FundWalletResponse>('/wallet/fund', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

import type {
  PowerbankDto,
  PowerbankListResponse,
  CreatePowerbankDto,
} from '@mezzo/shared-types';

export async function getAvailablePowerbanks(): Promise<PowerbankListResponse> {
  return fetchApi<PowerbankListResponse>('/powerbanks?status=AVAILABLE');
}

export async function getPowerbanks(shopId?: string): Promise<PowerbankListResponse> {
  const query = shopId ? `?shopId=${shopId}` : '';
  return fetchApi<PowerbankListResponse>(`/powerbanks${query}`);
}

export async function createPowerbank(data: CreatePowerbankDto): Promise<PowerbankDto> {
  return fetchApi<PowerbankDto>('/powerbanks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function markPowerbankAvailable(id: string): Promise<PowerbankDto> {
  return fetchApi<PowerbankDto>(`/powerbanks/${id}/mark-available`, {
    method: 'PATCH',
  });
}

export async function markPowerbankMaintenance(id: string): Promise<PowerbankDto> {
  return fetchApi<PowerbankDto>(`/powerbanks/${id}/mark-maintenance`, {
    method: 'PATCH',
  });
}
