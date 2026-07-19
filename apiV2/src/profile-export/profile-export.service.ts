import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

export interface ProfileExport {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: { street: string; city: string; postalCode: string };
}

const CITIES = ['Springfield', 'Riverside', 'Fairview', 'Georgetown', 'Madison'];

// PII-rich fixture endpoint (PLAN_ENTERPRISE.md decision 11; tflw PLAN.md decision 101d) — the
// dogfooding target for tflw's `redact`/`evidence` knobs (enterprise arc cluster 2, M23). `phone`/
// `address` aren't real columns on `User` (no migration needed for a fixture) — deterministically
// derived from the user's id so the same user always exports the same fake-but-realistic PII,
// reproducibly, without ever being a real person's data.
@Injectable()
export class ProfileExportService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async export(userId: string): Promise<ProfileExport> {
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    const digest = createHash('sha256').update(user.id).digest();

    const areaCode = 200 + (digest[0]! % 800);
    const exchange = 100 + (digest[1]! % 900);
    const line = String(digest.readUInt16BE(2) % 10000).padStart(4, '0');
    const phone = `+1-${areaCode}-${exchange}-${line}`;

    const houseNumber = 100 + (digest[4]! % 900);
    const city = CITIES[digest[5]! % CITIES.length]!;
    const postalCode = String(10000 + (digest.readUInt16BE(6) % 90000));

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone,
      address: { street: `${houseNumber} Maple Ave`, city, postalCode },
    };
  }
}
