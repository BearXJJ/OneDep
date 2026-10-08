import { Body, Controller, Get, Post } from '@nestjs/common';

import { MessagesService } from './messages.service.js';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  list() {
    return this.messages.list();
  }

  @Post()
  create(@Body('content') content: unknown) {
    return this.messages.create(content);
  }
}
