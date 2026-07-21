import { Controller, Get, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UserRole } from './entities/user-role.enum';
import { toUserResponse, UserResponse } from './dto/user-response';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(@CurrentUser() currentUser: AuthenticatedUser): Promise<UserResponse> {
    const user = await this.usersService.findById(currentUser.id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return toUserResponse(user);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  async findAll(): Promise<UserResponse[]> {
    const users = await this.usersService.findAll();
    return users.map(toUserResponse);
  }
}
