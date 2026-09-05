import { IsOptional, IsString, MaxLength } from 'class-validator';

// A dealer answering "عندي هذي القطعة". The opening message is optional —
// tapping the button alone opens the thread, and most dealers will then
// type in the chat itself.
export class AnswerRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
