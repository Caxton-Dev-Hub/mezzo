import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { UserRole } from './entities/user-role.enum';
import { EmailAlreadyRegisteredError } from './errors/email-already-registered.error';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(email: string, passwordHash: string): Promise<User> {
    const normalizedEmail = email.toLowerCase();
    const existing = await this.usersRepository.findOne({ where: { email: normalizedEmail } });

    if (existing) {
      throw new EmailAlreadyRegisteredError();
    }

    const user = this.usersRepository.create({
      email: normalizedEmail,
      passwordHash,
      role: UserRole.USER,
    });

    return this.usersRepository.save(user);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email: email.toLowerCase() } });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  findAll(): Promise<User[]> {
    return this.usersRepository.find({ order: { createdAt: 'ASC' } });
  }
}
