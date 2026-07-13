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

  // Atomic check-and-revoke for rotation (refresh/session-refresh): a separate `assertLive` +
  // `revoke` pair is racy — two concurrent requests bearing the same not-yet-revoked token can
  // both pass `assertLive` before either `revoke` commits, each minting its own successor pair
  // from one token instead of exactly one winner (M19 finding, found via a real 4-concurrent-
  // refresh curl repro: 2×200 + 2×401 instead of 1×200 + 3×401). A single conditional UPDATE
  // closes the gap: only the request that actually flips `revoked_at` from null wins.
  async claimForRotation(jti: string): Promise<TokenRecord> {
    const result = await this.records
      .createQueryBuilder()
      .update(TokenRecord)
      .set({ revokedAt: () => 'now()' })
      .where('id = :jti AND revoked_at IS NULL AND expires_at > now()', { jti })
      .returning('*')
      .execute();
    const row = result.raw[0] as TokenRecord | undefined;
    if (!row) {
      throw new UnauthorizedException('token is revoked or expired');
    }
    return row;
  }
}
