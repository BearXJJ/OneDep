import { CommunicationController } from './communication.controller.js';
import { CopilotService } from './copilot.service.js';
import { Module } from '@nestjs/common';

import { DepositionsController } from './depositions.controller.js';
import { DepositionsService } from './depositions.service.js';

@Module({
  controllers: [DepositionsController, CommunicationController],
  providers: [DepositionsService, CopilotService],
})
export class DepositionsModule {}
