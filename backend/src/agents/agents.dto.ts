import { IsString, IsArray, IsOptional, IsIn, MinLength } from 'class-validator';

export class CreateAgentDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(10)
  systemPrompt: string;

  @IsArray()
  @IsString({ each: true })
  enabledTools: string[];

  @IsOptional()
  @IsIn(['claude', 'openai'])
  llmProvider?: string;

  @IsOptional()
  @IsString()
  llmModel?: string;

  @IsOptional()
  @IsIn(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'])
  ttsVoice?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'neutral'])
  ttsGender?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  startPhrase?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  endPhrase?: string;

  @IsOptional()
  @IsString()
  farewellMessage?: string;
}

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledTools?: string[];

  @IsOptional()
  @IsIn(['claude', 'openai'])
  llmProvider?: string;

  @IsOptional()
  @IsString()
  llmModel?: string;

  @IsOptional()
  @IsIn(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'])
  ttsVoice?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'neutral'])
  ttsGender?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  startPhrase?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  endPhrase?: string;

  @IsOptional()
  @IsString()
  farewellMessage?: string;
}
