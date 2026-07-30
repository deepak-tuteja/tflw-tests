import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Warehouse } from "../entities/warehouse.entity";
import { CreateWarehouseDto } from "./dto/create-warehouse.dto";
import { UpdateWarehouseDto } from "./dto/update-warehouse.dto";

@Injectable()
export class WarehousesService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouses: Repository<Warehouse>,
  ) {}

  findAll(): Promise<Warehouse[]> {
    return this.warehouses.find({ order: { createdAt: "ASC" } });
  }

  async findOne(id: string): Promise<Warehouse> {
    const warehouse = await this.warehouses.findOne({ where: { id } });
    if (!warehouse) throw new NotFoundException("warehouse not found");
    return warehouse;
  }

  create(dto: CreateWarehouseDto): Promise<Warehouse> {
    return this.warehouses.save(this.warehouses.create(dto));
  }

  async update(id: string, dto: UpdateWarehouseDto): Promise<Warehouse> {
    const warehouse = await this.findOne(id);
    Object.assign(warehouse, dto);
    return this.warehouses.save(warehouse);
  }

  async remove(id: string): Promise<void> {
    const warehouse = await this.findOne(id);
    await this.warehouses.remove(warehouse);
  }
}
