import { IsString, IsOptional, IsIn, MinLength } from 'class-validator';

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  contextPrompt?: string;

  @IsOptional()
  @IsIn(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'])
  ttsVoice?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'neutral'])
  ttsGender?: string;
}

export class UpdateConversationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  contextPrompt?: string;

  @IsOptional()
  @IsIn(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'])
  ttsVoice?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'neutral'])
  ttsGender?: string;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  content: string;
}
