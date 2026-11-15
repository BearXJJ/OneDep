import { CommunicationController } from './communication.controller.js';
import { CopilotService } from './copilot.service.js';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';

import { DepositionsController } from './depositions.controller.js';
import { DepositionsService } from './depositions.service.js';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          files: 1,
          fileSize:
            config.getOrThrow<number>('UPLOAD_MAX_FILE_MB') * 1024 * 1024,
        },
      }),
    }),
  ],
  controllers: [DepositionsController, CommunicationController],
  providers: [DepositionsService, CopilotService],
})
export class DepositionsModule {}
