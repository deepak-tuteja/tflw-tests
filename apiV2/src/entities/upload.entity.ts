import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

// PLAN_FILEFORMATS.md D2 — curated allowlist; the whole point of this fixture module is proving
// out tflw's new content-aware body parsing (gap #19) against real CSV/TXT/PDF bytes, not an
// open-ended file store.
export enum UploadContentType {
  CSV = 'text/csv',
  TXT = 'text/plain',
  PDF = 'application/pdf',
}

@Entity('uploads')
export class Upload {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'owner_id' })
  ownerUser: User;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @Column({ type: 'text' })
  filename: string;

  @Column({ name: 'content_type', type: 'enum', enum: UploadContentType })
  contentType: UploadContentType;

  // Stored inline (this app's Postgres already stores other blobs this way, e.g. no object-store
  // dependency needed for a fixture module) — never returned directly in a JSON response body;
  // only via the raw-stream or base64-envelope download endpoints.
  @Column({ type: 'bytea' })
  data: Buffer;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
