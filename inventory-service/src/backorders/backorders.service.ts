import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  BackorderRequest,
  BackorderStatus,
} from "../entities/backorder-request.entity";

@Injectable()
export class BackordersService {
  constructor(
    @InjectRepository(BackorderRequest)
    private readonly backorders: Repository<BackorderRequest>,
  ) {}

  findAll(productId?: string): Promise<BackorderRequest[]> {
    return this.backorders.find({
      where: productId ? { productId } : {},
      order: { createdAt: "DESC" },
    });
  }

  async findOne(id: string): Promise<BackorderRequest> {
    const backorder = await this.backorders.findOne({ where: { id } });
    if (!backorder) throw new NotFoundException("backorder request not found");
    return backorder;
  }

  create(
    productId: string,
    orderId: string | null,
    quantity: number,
  ): Promise<BackorderRequest> {
    return this.backorders.save(
      this.backorders.create({
        productId,
        orderId,
        quantity,
        status: BackorderStatus.OPEN,
      }),
    );
  }

  async setStatus(
    id: string,
    status: BackorderStatus,
  ): Promise<BackorderRequest> {
    const backorder = await this.findOne(id);
    backorder.status = status;
    return this.backorders.save(backorder);
  }
}
