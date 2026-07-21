import { User } from '../../database/entities/user.entity';
import { UserRole } from '../entities/user-role.enum';

export interface UserResponse {
  id: string;
  email: string;
  role: UserRole;
  createdAt: Date;
}

export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}
