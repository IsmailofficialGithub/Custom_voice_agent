import { Injectable } from '@nestjs/common';

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

@Injectable()
export class TimeTool {
  readonly name = 'get_time';
  readonly description = 'Get the current date and time, optionally in a specific timezone';
  readonly parameters = {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'IANA timezone name e.g. America/New_York. Defaults to UTC.',
      },
    },
    required: [],
  };

  execute(input: { timezone?: string }): ToolResult {
    try {
      const tz = input.timezone ?? 'UTC';
      const now = new Date();
      const formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        dateStyle: 'full',
        timeStyle: 'long',
      }).format(now);

      return {
        success: true,
        data: {
          datetime: formatted,
          timezone: tz,
          iso: now.toISOString(),
        },
      };
    } catch {
      return {
        success: false,
        error: `Invalid timezone: ${input.timezone}`,
      };
    }
  }
}
