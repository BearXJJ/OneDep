import { CopilotService } from './copilot.service.js';
import { Module } from '@nestjs/common';

import { DepositionsController } from './depositions.controller.js';
import { DepositionsService } from './depositions.service.js';

@Module({
  controllers: [DepositionsController],
  providers: [DepositionsService, CopilotService],
})
export class DepositionsModule {}
