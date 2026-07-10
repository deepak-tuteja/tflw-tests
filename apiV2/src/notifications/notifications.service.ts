import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from '../entities/notification.entity';

// Flattens `payload` into the top-level response object alongside `id`/`type`/`createdAt` — a
// real polymorphic shape (SPEC-relevant for M13's gap-hunting), not a nested envelope, so
// `expect any body matches subset { type: "price_drop", oldPrice: ... }` reads naturally.
export type NotificationResponse = { id: string; type: NotificationType; createdAt: Date } & Record<
  string,
  unknown
>;

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
  ) {}

  // No public create endpoint (M13 decision 3) — every notification is a real side-effect of
  // another action, called from that action's own service.
  async create(
    userId: string,
    type: NotificationType,
    payload: Record<string, unknown>,
  ): Promise<Notification> {
    const notification = this.notifications.create({ userId, type, payload });
    return this.notifications.save(notification);
  }

  async findAllForUser(userId: string): Promise<NotificationResponse[]> {
    const rows = await this.notifications.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      createdAt: row.createdAt,
      ...row.payload,
    }));
  }
}
