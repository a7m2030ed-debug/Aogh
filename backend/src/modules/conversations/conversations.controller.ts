import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MessageSenderType } from '@prisma/client';
import { CurrentUser } from '../identity/current-user.decorator';
import { StartConversationDto } from './dto/start-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ProposePriceDto } from './dto/propose-price.dto';
import { ConversationsService } from './conversations.service';

@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  start(@CurrentUser() user: { userId: string }, @Body() dto: StartConversationDto) {
    return this.conversationsService.startConversation(user.userId, dto);
  }

  @Get(':id/messages')
  messages(@Param('id') id: string) {
    return this.conversationsService.listMessages(id);
  }

  @Post(':id/messages')
  sendMessage(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: SendMessageDto,
  ) {
    return this.conversationsService.sendMessage(id, MessageSenderType.USER, user.userId, dto);
  }

  @Post(':id/offers')
  proposePrice(@Param('id') id: string, @Body() dto: ProposePriceDto) {
    return this.conversationsService.proposePrice(id, MessageSenderType.USER, dto);
  }

  @Post(':id/offers/accept')
  acceptLatestOffer(@Param('id') id: string) {
    return this.conversationsService.acceptLatestOffer(id);
  }
}
