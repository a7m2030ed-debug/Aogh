import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RecognizePartDto } from './dto/recognize-part.dto';
import { AiVisionService } from './ai-vision.service';

@ApiTags('ai')
@Controller('ai/vision')
export class AiVisionController {
  constructor(private readonly aiVisionService: AiVisionService) {}

  @Post('recognize-part')
  recognizePart(@Body() dto: RecognizePartDto) {
    return this.aiVisionService.recognizePart(dto);
  }
}
