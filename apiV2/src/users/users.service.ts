import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Job } from '../entities/job.entity';
import { JobsService } from '../jobs/jobs.service';
import { UpdateAttributesDto } from './dto/update-attributes.dto';

// Same opaque-version-as-ETag convention as products.service.ts's etagFor. Takes just the
// version so it works against both the User entity and the trimmed UserProfileResponse.
export function etagFor(versioned: { version: number }): string {
  return `"${versioned.version}"`;
}

export type UserProfileResponse = Pick<
  User,
  'id' | 'name' | 'email' | 'role' | 'attributes' | 'version'
>;

function toResponse(user: User): UserProfileResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    attributes: user.attributes,
    version: user.version,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jobsService: JobsService,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('user not found');
    return user;
  }

  async profile(id: string): Promise<UserProfileResponse> {
    return toResponse(await this.findById(id));
  }

  // RFC 7386 JSON Merge Patch onto the flat `attributes` bag: a key present with a non-null
  // value is added/overwritten, a key present with literal `null` is deleted, keys omitted are
  // left untouched. If-Match is optional (optimistic concurrency, not a mandatory lock) — same
  // shape as products.service.ts's update().
  async patchAttributes(
    id: string,
    patch: UpdateAttributesDto,
    ifMatch: string | undefined,
  ): Promise<UserProfileResponse> {
    if (!isPlainObject(patch)) {
      throw new BadRequestException(
        'body must be a JSON object — a merge patch applied to attributes',
      );
    }

    const user = await this.findById(id);

    if (ifMatch !== undefined && ifMatch !== etagFor(user)) {
      throw new PreconditionFailedException(
        'user has been modified since you last read it — refetch and retry with its current ETag',
      );
    }

    const merged = { ...user.attributes };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) delete merged[key];
      else merged[key] = value;
    }
    user.attributes = merged;

    const saved = await this.users.save(user);
    return toResponse(saved);
  }

  // Async self-deletion (PLAN_LIFECYCLE.md L2) — hands off to JobsService.startAccountDeletion,
  // which does the real work (sync deactivation + revocation, then the fire-and-forget wipe
  // continuation); this is just the self-service entry point.
  async requestDeletion(id: string): Promise<Job> {
    const user = await this.findById(id);
    return this.jobsService.startAccountDeletion(user);
  }
}
