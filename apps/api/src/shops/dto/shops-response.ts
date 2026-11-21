import { Shop } from '../../database/entities/shop.entity';
import { StaffAssignment } from '../../database/entities/staff-assignment.entity';
import {
  VerificationSubmission,
  VerificationSubmissionStatus,
} from '../../database/entities/verification-submission.entity';

export interface ShopResponse {
  id: string;
  name: string;
  location: string;
  createdAt: string;
  updatedAt: string;
}

export function toShopResponse(shop: Shop): ShopResponse {
  return {
    id: shop.id,
    name: shop.name,
    location: shop.location,
    createdAt: shop.createdAt.toISOString(),
    updatedAt: shop.updatedAt.toISOString(),
  };
}

export interface StaffAssignmentResponse {
  id: string;
  userId: string;
  userEmail: string;
  shopId: string;
  assignedAt: string;
}

export function toStaffAssignmentResponse(
  assignment: StaffAssignment,
  userEmail: string,
): StaffAssignmentResponse {
  return {
    id: assignment.id,
    userId: assignment.userId,
    userEmail,
    shopId: assignment.shopId,
    assignedAt: assignment.createdAt.toISOString(),
  };
}

export interface VerificationSubmissionResponse {
  id: string;
  userId: string;
  fullName: string;
  phoneNumber: string;
  photoStorageKey: string;
  status: VerificationSubmissionStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
}

export function toVerificationSubmissionResponse(
  submission: VerificationSubmission,
): VerificationSubmissionResponse {
  return {
    id: submission.id,
    userId: submission.userId,
    fullName: submission.fullName,
    phoneNumber: submission.phoneNumber,
    photoStorageKey: submission.photoStorageKey,
    status: submission.status,
    submittedAt: submission.submittedAt.toISOString(),
    reviewedAt: submission.reviewedAt ? submission.reviewedAt.toISOString() : null,
    reviewedBy: submission.reviewedBy,
    reviewNotes: submission.reviewNotes,
  };
}
