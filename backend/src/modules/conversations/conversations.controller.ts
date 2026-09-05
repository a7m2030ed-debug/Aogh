import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../identity/current-user.decorator';
import { DealersService } from '../identity/dealers.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationsService } from './conversations.service';

@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly dealersService: DealersService,
  ) {}

  // There's no POST to start one: a conversation only comes into being
  // when a dealer answers a request (POST /requests/:id/answer).
  @Get()
  listMine(@CurrentUser() user: { userId: string }) {
    return this.conversationsService.listForCustomer(user.userId);
  }

  // Declared before ':id' so "dealer" isn't read as a conversation id.
  @Get('dealer')
  async listForDealer(@CurrentUser() user: { userId: string }) {
    const dealer = await this.dealersService.findByOwner(user.userId);
    return this.conversationsService.listForDealer(dealer.id);
  }

  // Sender side is derived from the caller's own membership in the
  // thread, never from the request body — see assertParticipant.
  @Get(':id/messages')
  messages(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.conversationsService.listMessages(id, user.userId);
  }

  @Post(':id/messages')
  sendMessage(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: SendMessageDto,
  ) {
    return this.conversationsService.sendMessage(id, user.userId, dto);
  }
}
