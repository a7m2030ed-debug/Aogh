import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { MediaService } from './media.service';

@ApiTags('media')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('media/uploads')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  // Client uploads directly to `uploadUrl` with an HTTP PUT (body = raw
  // file bytes, header Content-Type matching what was requested here),
  // then uses `publicUrl` for AI recognition (POST /ai/vision/recognize-part)
  // and, once the dealer confirms, for the listing itself
  // (POST /inventory/listings imageUrls).
  @Post('presign')
  presign(@Body() dto: PresignUploadDto) {
    return this.mediaService.presignUpload(dto);
  }
}
