import { Module } from '@nestjs/common';
import { SignedController } from './signed.controller';

@Module({ controllers: [SignedController] })
export class SignedModule {}
