import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { UserRole } from './entities/user-role.enum';
import { UserStatus } from './entities/user-status.enum';
import { KycTier } from '../kyc/entities/kyc-tier.enum';
import { EmailAlreadyRegisteredError } from './errors/email-already-registered.error';

export interface UserSearchQuery {
  q?: string;
  role?: UserRole;
  status?: UserStatus;
  kycTier?: KycTier;
  page: number;
  pageSize: number;
}

export interface UserSearchResult {
  items: User[];
  total: number;
}

@Injectable()
export class UsersService {
  private readonly bootstrapAdminEmails: ReadonlySet<string>;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    configService: ConfigService,
  ) {
    this.bootstrapAdminEmails = new Set(
      (configService.get<string>('BOOTSTRAP_ADMIN_EMAILS') ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0),
    );
  }

  async create(email: string, passwordHash: string): Promise<User> {
    const normalizedEmail = email.toLowerCase();
    const existing = await this.usersRepository.findOne({ where: { email: normalizedEmail } });

    if (existing) {
      throw new EmailAlreadyRegisteredError();
    }

    const user = this.usersRepository.create({
      email: normalizedEmail,
      passwordHash,
      role: this.bootstrapAdminEmails.has(normalizedEmail) ? UserRole.ADMIN : UserRole.USER,
    });

    return this.usersRepository.save(user);
  }

  async linkOrCreateGoogleUser(googleSub: string, email: string): Promise<User> {
    const linked = await this.usersRepository.findOne({ where: { googleSub } });

    if (linked) {
      return linked;
    }

    const normalizedEmail = email.toLowerCase();
    const existing = await this.usersRepository.findOne({ where: { email: normalizedEmail } });

    if (existing) {
      existing.googleSub = googleSub;
      existing.emailVerifiedAt ??= new Date();
      return this.usersRepository.save(existing);
    }

    const user = this.usersRepository.create({
      email: normalizedEmail,
      passwordHash: null,
      googleSub,
      emailVerifiedAt: new Date(),
      role: this.bootstrapAdminEmails.has(normalizedEmail) ? UserRole.ADMIN : UserRole.USER,
    });

    return this.usersRepository.save(user);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email: email.toLowerCase() } });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async getById(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  findAll(): Promise<User[]> {
    return this.usersRepository.find({ order: { createdAt: 'ASC' } });
  }

  async search(query: UserSearchQuery): Promise<UserSearchResult> {
    const [items, total] = await this.usersRepository.findAndCount({
      where: {
        ...(query.q ? { email: ILike(`%${query.q}%`) } : {}),
        ...(query.role ? { role: query.role } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.kycTier ? { kycTier: query.kycTier } : {}),
      },
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return { items, total };
  }

  async updateRole(id: string, role: UserRole): Promise<{ before: UserRole; after: UserRole }> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const before = user.role;
    user.role = role;
    await this.usersRepository.save(user);

    return { before, after: role };
  }

  async updateStatus(
    id: string,
    status: UserStatus,
  ): Promise<{ before: UserStatus; after: UserStatus }> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const before = user.status;
    user.status = status;
    await this.usersRepository.save(user);

    return { before, after: status };
  }

  async findEmailsByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }

    const users = await this.usersRepository.find({
      where: { id: In(ids) },
      select: { id: true, email: true },
    });

    return new Map(users.map((user) => [user.id, user.email]));
  }
}
