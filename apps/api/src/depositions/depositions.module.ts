import { Module } from '@nestjs/common';

import { DepositionsController } from './depositions.controller.js';
import { DepositionsService } from './depositions.service.js';

@Module({
  controllers: [DepositionsController],
  providers: [DepositionsService],
})
export class DepositionsModule {}
