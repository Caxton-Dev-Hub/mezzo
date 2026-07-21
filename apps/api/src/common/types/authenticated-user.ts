import { UserRole } from '../../users/entities/user-role.enum';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}
