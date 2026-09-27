import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Upload, UploadContentType } from '../entities/upload.entity';
import { AuthedUser } from '../auth/guards/bearer-auth.guard';
import { UserRole } from '../entities/user.entity';

const ALLOWED_CONTENT_TYPES = new Set<string>(Object.values(UploadContentType));

// PLAN_FILEFORMATS.md D3 — POST's response is metadata only; `data` never appears in a JSON body
// (that's what the two GET download modes are for). No global serialization-exclude convention
// exists in this app (see /auth/profile's own hand-built response), so this is built explicitly.
export interface UploadMetadata {
  id: string;
  ownerId: string;
  filename: string;
  contentType: UploadContentType;
  createdAt: Date;
}

function toMetadata(upload: Upload): UploadMetadata {
  return {
    id: upload.id,
    ownerId: upload.ownerId,
    filename: upload.filename,
    contentType: upload.contentType,
    createdAt: upload.createdAt,
  };
}

@Injectable()
export class UploadsService {
  constructor(
    @InjectRepository(Upload) private readonly uploads: Repository<Upload>,
  ) {}

  async create(
    ownerId: string,
    file: Express.Multer.File | undefined,
  ): Promise<UploadMetadata> {
    if (!file) throw new BadRequestException('file is required');
    if (!ALLOWED_CONTENT_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `unsupported content type "${file.mimetype}" — allowed: ${Array.from(ALLOWED_CONTENT_TYPES).join(', ')}`,
      );
    }

    const upload = this.uploads.create({
      ownerId,
      filename: file.originalname,
      contentType: file.mimetype as UploadContentType,
      data: file.buffer,
    });
    const saved = await this.uploads.save(upload);
    return toMetadata(saved);
  }

  /**
   * `POST /uploads/batch` (tflw `M245`) — several files in one multipart request, stored in the
   * order they arrived. Every file is validated before any is saved, so a batch with one
   * unsupported file stores nothing: a test that sends three and gets a 400 can trust that none of
   * the three exists.
   */
  async createMany(
    ownerId: string,
    files: readonly Express.Multer.File[] | undefined,
  ): Promise<(UploadMetadata & { field: string })[]> {
    if (!files || files.length === 0) throw new BadRequestException('at least one file is required');
    for (const file of files) {
      if (!ALLOWED_CONTENT_TYPES.has(file.mimetype)) {
        throw new BadRequestException(
          `unsupported content type "${file.mimetype}" on "${file.originalname}" — allowed: ${Array.from(ALLOWED_CONTENT_TYPES).join(', ')}`,
        );
      }
    }
    const out: (UploadMetadata & { field: string })[] = [];
    for (const file of files) {
      const saved = await this.uploads.save(
        this.uploads.create({
          ownerId,
          filename: file.originalname,
          contentType: file.mimetype as UploadContentType,
          data: file.buffer,
        }),
      );
      out.push({ field: file.fieldname, ...toMetadata(saved) });
    }
    return out;
  }

  async findOneScoped(id: string, requester: AuthedUser): Promise<Upload> {
    const upload = await this.uploads.findOne({ where: { id } });
    if (!upload) throw new NotFoundException('upload not found');
    if (requester.role !== UserRole.ADMIN && upload.ownerId !== requester.id) {
      throw new ForbiddenException('not your upload');
    }
    return upload;
  }
}
