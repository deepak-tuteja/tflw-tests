import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../entities/user.entity';
import { SetUserRoleDto } from './dto/set-user-role.dto';

export interface UserRoleView {
  id: string;
  email: string;
  role: UserRole;
}

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  // ADMIN-only (enforced by the controller's @Roles guard), the same division of labour
  // TicketsService.assign uses: the guard decides who may call, the service decides whether the
  // call makes sense.
  async setRole(id: string, dto: SetUserRoleDto): Promise<UserRoleView> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('user not found');

    user.role = dto.role;
    const saved = await this.users.save(user);
    // Deliberately narrow: id, email, role. `User` carries `passwordHash` and the `attributes`
    // bag, and returning the entity would put both on the wire for every promotion.
    return { id: saved.id, email: saved.email, role: saved.role };
  }
}
