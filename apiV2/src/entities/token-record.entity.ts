import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

// One row per issued revocable token — bearer refresh, cookie session, and cookie
// session_refresh all share this table (their JWT's `jti` claim is this row's id). Refresh
// rotates on use, logout revokes — both just flip `revokedAt`, so a stolen or reused token is
// rejected even though its signature still verifies. Genuinely revocable "sessions" (as opposed
// to purely stateless access tokens) are what let logout actually invalidate a cookie, not just
// clear it client-side.
@Entity('token_records')
export class TokenRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
