import { Module } from "@nestjs/common";
import { OpsSessionController } from "./ops-session.controller";

@Module({ controllers: [OpsSessionController] })
export class OpsSessionModule {}
