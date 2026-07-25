import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, JobStatus, JobType } from '../entities/job.entity';
import { Order, OrderStatus } from '../entities/order.entity';
import { AuthedUser } from '../auth/guards/bearer-auth.guard';
import { User, UserRole } from '../entities/user.entity';
import { NotificationType } from '../entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { TokenRecordsService } from '../auth/token-records.service';

const STAGE_DELAY_MS = 150;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The 202-Accepted async-job cluster: fulfilling an order kicks off real background work (not a
// fake instant transition) that a client polls for via `GET /jobs/:id`, same as it would poll
// `Order.status` directly — the job is just the pollable handle for "did the work finish."
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
    private readonly tokenRecords: TokenRecordsService,
  ) {}

  async startFulfillment(order: Order): Promise<Job> {
    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictException(
        `order is "${order.status}", not "pending" — it cannot be fulfilled again`,
      );
    }

    const job = this.jobs.create({
      type: JobType.ORDER_FULFILLMENT,
      orderId: order.id,
    });
    const saved = await this.jobs.save(job);

    // The pending -> processing transition happens synchronously, before this call returns —
    // not inside the fire-and-forget continuation below. Otherwise a client that immediately
    // retries `fulfill` could race this job's own first write and see "pending" (and thus start
    // a second job) instead of the 409 a truly-in-progress order should give.
    await this.jobs.update(saved.id, { status: JobStatus.PROCESSING });
    await this.orders.update(order.id, { status: OrderStatus.PROCESSING });
    saved.status = JobStatus.PROCESSING;

    // Everything past this point is the real fire-and-forget async work: the triggering request
    // already has its 202, this is what `GET /jobs/:id` polls for.
    void this.continueFulfillment(
      saved.id,
      order.id,
      order.userId,
      order.webhookUrl,
    );

    return saved;
  }

  // Each real status transition also fires an `order_status_changed` notification for the
  // order's owner (M13, plan_v2.md Part F decision 3) — a genuine side-effect of the async work
  // actually completing, not a notification manufactured just to have one to test.
  private async continueFulfillment(
    jobId: string,
    orderId: string,
    userId: string,
    webhookUrl: string | null,
  ): Promise<void> {
    await delay(STAGE_DELAY_MS);
    await this.orders.update(orderId, { status: OrderStatus.READY });
    await this.notifications.create(
      userId,
      NotificationType.ORDER_STATUS_CHANGED,
      {
        orderId,
        oldStatus: OrderStatus.PROCESSING,
        newStatus: OrderStatus.READY,
      },
    );

    await delay(STAGE_DELAY_MS);
    await this.orders.update(orderId, { status: OrderStatus.FULFILLED });
    await this.notifications.create(
      userId,
      NotificationType.ORDER_STATUS_CHANGED,
      {
        orderId,
        oldStatus: OrderStatus.READY,
        newStatus: OrderStatus.FULFILLED,
      },
    );
    await this.jobs.update(jobId, { status: JobStatus.COMPLETED });

    // Outbound-webhook cluster (M33, plan_v2.md Part R Cluster C): a real order-completion
    // webhook, fired only once fulfillment has genuinely reached its terminal state. Best-effort
    // and non-blocking by design — same as any real webhook integration (Stripe, Shopify), a
    // delivery failure (receiver down/unreachable) never rolls back or retries the order itself,
    // it's just logged.
    if (webhookUrl) void this.deliverWebhook(webhookUrl, orderId);
  }

  private async deliverWebhook(
    webhookUrl: string,
    orderId: string,
  ): Promise<void> {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'order.fulfilled',
          orderId,
          status: OrderStatus.FULFILLED,
          occurredAt: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) {
        this.logger.warn(
          `webhook delivery to ${webhookUrl} for order ${orderId} returned ${res.status}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `webhook delivery to ${webhookUrl} for order ${orderId} failed: ${(err as Error).message}`,
      );
    }
  }

  // Self-service account deletion (PLAN_LIFECYCLE.md L2) — same sync-transition-then-async-
  // continuation shape as startFulfillment: the deactivation + revocation that blocks re-auth
  // happens before this call returns, everything else (attribute wipe, a defensive second
  // revocation sweep) is the fire-and-forget continuation `GET /jobs/:id` polls for.
  async startAccountDeletion(user: User): Promise<Job> {
    if (user.deactivatedAt) {
      throw new ConflictException('account is already deactivated');
    }

    await this.users.update(user.id, { deactivatedAt: new Date() });
    await this.tokenRecords.revokeAllForUser(user.id);

    const job = this.jobs.create({
      type: JobType.ACCOUNT_DELETION,
      userId: user.id,
    });
    const saved = await this.jobs.save(job);

    await this.jobs.update(saved.id, { status: JobStatus.PROCESSING });
    saved.status = JobStatus.PROCESSING;

    void this.continueAccountDeletion(saved.id, user.id);

    return saved;
  }

  private async continueAccountDeletion(jobId: string, userId: string): Promise<void> {
    await delay(STAGE_DELAY_MS);
    await this.users.update(userId, { attributes: {} });

    // A defensive second sweep: catches any token record minted in the race window between the
    // synchronous revocation above and now (e.g. a refresh rotation that was already in flight
    // when the deletion request landed).
    await delay(STAGE_DELAY_MS);
    await this.tokenRecords.revokeAllForUser(userId);

    await this.jobs.update(jobId, { status: JobStatus.COMPLETED });
  }

  // Refund job (PLAN_RETURNS.md R2) — kicked off by ReturnRequestsService.decide's APPROVED
  // branch, same sync-transition-then-async-continuation shape as startFulfillment: the order is
  // already known FULFILLED (the caller only reaches here via an approved return request, which
  // itself requires a FULFILLED order per decision 6), so there's no precondition check here —
  // that's the return request's job, not this one's.
  async startRefund(order: Order): Promise<Job> {
    const job = this.jobs.create({
      type: JobType.REFUND,
      orderId: order.id,
    });
    const saved = await this.jobs.save(job);

    await this.jobs.update(saved.id, { status: JobStatus.PROCESSING });
    saved.status = JobStatus.PROCESSING;

    void this.continueRefund(saved.id, order.id, order.userId);

    return saved;
  }

  private async continueRefund(
    jobId: string,
    orderId: string,
    userId: string,
  ): Promise<void> {
    await delay(STAGE_DELAY_MS);
    await this.orders.update(orderId, { status: OrderStatus.REFUNDED });
    await this.notifications.create(
      userId,
      NotificationType.ORDER_STATUS_CHANGED,
      {
        orderId,
        oldStatus: OrderStatus.FULFILLED,
        newStatus: OrderStatus.REFUNDED,
      },
    );

    await this.jobs.update(jobId, { status: JobStatus.COMPLETED });
  }

  async findOneScoped(id: string, requester: AuthedUser): Promise<Job> {
    const job = await this.jobs.findOne({ where: { id } });
    if (!job) throw new NotFoundException('job not found');

    if (requester.role !== UserRole.ADMIN) {
      if (job.userId) {
        if (job.userId !== requester.id) {
          throw new ForbiddenException('not your job');
        }
      } else if (job.orderId) {
        const order = await this.orders.findOne({ where: { id: job.orderId } });
        if (!order || order.userId !== requester.id) {
          throw new ForbiddenException('not your job');
        }
      }
    }

    return job;
  }
}
