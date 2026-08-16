import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaitlistSignup } from '../database/entities/waitlist-signup.entity';
import { toWaitlistSignupResponse, WaitlistSignupResponse } from './dto/waitlist-response';

export interface WaitlistPageQuery {
  page: number;
  pageSize: number;
}

export interface WaitlistPageResult {
  items: WaitlistSignupResponse[];
  total: number;
}

@Injectable()
export class WaitlistService {
  constructor(
    @InjectRepository(WaitlistSignup)
    private readonly waitlistRepository: Repository<WaitlistSignup>,
  ) {}

  async join(email: string): Promise<WaitlistSignupResponse> {
    const normalizedEmail = email.toLowerCase();
    const existing = await this.waitlistRepository.findOne({ where: { email: normalizedEmail } });

    if (existing) {
      return toWaitlistSignupResponse(existing);
    }

    const signup = this.waitlistRepository.create({ email: normalizedEmail });
    const saved = await this.waitlistRepository.save(signup);
    return toWaitlistSignupResponse(saved);
  }

  async findAll(query: WaitlistPageQuery): Promise<WaitlistPageResult> {
    const [signups, total] = await this.waitlistRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return { items: signups.map(toWaitlistSignupResponse), total };
  }
}
