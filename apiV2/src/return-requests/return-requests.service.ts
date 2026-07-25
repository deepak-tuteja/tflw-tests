import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../entities/order.entity';
import { ReturnRequest, ReturnRequestStatus } from '../entities/return-request.entity';
import { CreateReturnRequestDto } from './dto/create-return-request.dto';
import {
  DecideReturnRequestDto,
  ReturnRequestDecision,
} from './dto/decide-return-request.dto';
import { AuthedUser } from '../auth/guards/bearer-auth.guard';
import { UserRole } from '../entities/user.entity';
import { isUniqueViolation } from '../common/db-errors';
import { JobsService } from '../jobs/jobs.service';

// PLAN_RETURNS.md R1/R2 — sync submit/approve/reject mechanics, plus (R2) kicking off
// JobsService's refund job from `decide`'s APPROVED branch. REJECTED stays exactly as built in
// R1 — no job at all, the order's status simply never changes on that path.
@Injectable()
export class ReturnRequestsService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(ReturnRequest)
    private readonly returnRequests: Repository<ReturnRequest>,
    private readonly jobsService: JobsService,
  ) {}

  // Deliberately a plain 404 (not findOneScoped's 403-if-exists-but-not-yours convention) —
  // unlike every other order sub-resource, there's no admin-bypass use case for *submitting* a
  // return on someone else's order, so there's no reason to confirm the order's existence to a
  // non-owner at all.
  async submit(
    orderId: string,
    userId: string,
    dto: CreateReturnRequestDto,
  ): Promise<ReturnRequest> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('order not found');
    }
    if (order.status !== OrderStatus.FULFILLED) {
      throw new ConflictException(
        'only a fulfilled order can have a return requested',
      );
    }

    const existing = await this.returnRequests.findOne({
      where: { orderId },
    });
    if (existing) {
      throw new ConflictException(
        'a return request already exists for this order',
      );
    }

    const created = this.returnRequests.create({
      orderId,
      userId,
      reason: dto.reason,
    });
    try {
      return await this.returnRequests.save(created);
    } catch (err) {
      // The UNIQUE constraint on order_id is what actually makes a concurrent double-submission
      // safe — the findOne above is just a fast pre-check, same TOCTOU-hardening pattern M19
      // applied to order creation's own Idempotency-Key race.
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'a return request already exists for this order',
        );
      }
      throw err;
    }
  }

  async findOneScoped(
    id: string,
    requester: AuthedUser,
  ): Promise<ReturnRequest> {
    const rr = await this.returnRequests.findOne({ where: { id } });
    if (!rr) throw new NotFoundException('return request not found');
    if (requester.role !== UserRole.ADMIN && rr.userId !== requester.id) {
      throw new ForbiddenException('not your return request');
    }
    return rr;
  }

  // Admin-only (enforced by the controller's @Roles guard, same convention as
  // orders.service.ts's fulfill()) — a decision is final: only a currently REQUESTED request can
  // be decided, and there is no path back to REQUESTED afterward (decision 6).
  //
  // Deciding the request itself is always synchronous (200, not 202) — approving/rejecting is
  // instant either way. Only the APPROVED branch has any further async work (the refund job); its
  // id is surfaced as `refundJobId` alongside the saved ReturnRequest rather than switching the
  // whole response to the job-only shape `POST /orders/:id/fulfill` uses, since the primary
  // resource this endpoint mutates is the ReturnRequest, not a Job (direct analogy with
  // `DELETE /users/me`, which *is* purely job-creating and so returns the Job itself outright —
  // documenting the divergence PLAN_RETURNS.md's R1 write-up flagged between the two).
  async decide(
    id: string,
    dto: DecideReturnRequestDto,
    adminId: string,
  ): Promise<ReturnRequest & { refundJobId?: string }> {
    const rr = await this.returnRequests.findOne({ where: { id } });
    if (!rr) throw new NotFoundException('return request not found');
    if (rr.status !== ReturnRequestStatus.REQUESTED) {
      throw new ConflictException(
        'this return request has already been decided',
      );
    }

    rr.status =
      dto.decision === ReturnRequestDecision.APPROVED
        ? ReturnRequestStatus.APPROVED
        : ReturnRequestStatus.REJECTED;
    rr.decidedBy = adminId;
    rr.decisionReason = dto.reason ?? null;
    rr.decidedAt = new Date();

    const saved = await this.returnRequests.save(rr);

    if (dto.decision === ReturnRequestDecision.APPROVED) {
      const order = await this.orders.findOne({ where: { id: saved.orderId } });
      if (!order) throw new NotFoundException('order not found');
      const job = await this.jobsService.startRefund(order);
      return { ...saved, refundJobId: job.id };
    }

    return saved;
  }
}
