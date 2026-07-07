import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenRecord } from '../entities/token-record.entity';

@Injectable()
export class TokenRecordsService {
  constructor(
    @InjectRepository(TokenRecord) private readonly records: Repository<TokenRecord>,
  ) {}

  async issue(userId: string, ttlMs: number): Promise<TokenRecord> {
    return this.records.save(
      this.records.create({
        userId,
        expiresAt: new Date(Date.now() + ttlMs),
        revokedAt: null,
      }),
    );
  }

  /** Throws if the jti is unknown, revoked, or past its own expiry. */
  async assertLive(jti: string): Promise<TokenRecord> {
    const row = await this.records.findOne({ where: { id: jti } });
    if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('token is revoked or expired');
    }
    return row;
  }

  async revoke(jti: string): Promise<void> {
    await this.records.update({ id: jti }, { revokedAt: new Date() });
  }
}
