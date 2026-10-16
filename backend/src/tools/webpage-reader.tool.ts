import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ToolResult } from './time.tool';

@Injectable()
export class WebpageReaderTool {
  private readonly logger = new Logger(WebpageReaderTool.name);

  readonly name = 'read_webpage';
  readonly description =
    'Read and extract key information from a website or URL using clean markdown text extraction. Use this whenever the user asks about a website, portfolio, link, domain, or asks to check a specific web address.';
  readonly parameters = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL or website domain to read, e.g. https://ismailabbasi.qzz.io or ismailabbasi.qzz.io',
      },
    },
    required: ['url'],
  };

  async execute(input: { url: string }): Promise<ToolResult> {
    let target = (input.url || '').trim();
    if (!target) {
      return { success: false, error: 'URL was empty' };
    }

    if (!/^https?:\/\//i.test(target)) {
      target = `https://${target}`;
    }

    // Try Jina Reader first (fast, bypasses Cloudflare, clean markdown)
    try {
      this.logger.log(`Fetching webpage via Jina Reader: ${target}`);
      const jinaUrl = `https://r.jina.ai/${target}`;
      const res = await axios.get(jinaUrl, {
        headers: {
          Accept: 'text/plain',
          'X-Return-Format': 'text',
        },
        timeout: 8000,
      });

      if (res.status === 200 && typeof res.data === 'string' && res.data.length > 50) {
        // Cap to ~2,500 characters (~500 tokens) to ensure rapid voice synthesis and minimal token usage
        const truncated = res.data.slice(0, 2500);
        return {
          success: true,
          data: {
            url: target,
            content: truncated,
          },
        };
      }
    } catch (err: any) {
      this.logger.warn(`Jina Reader fetch failed for ${target}: ${err?.message}, falling back to direct fetch`);
    }

    // Fallback: Direct HTTP fetch with clean text extraction
    try {
      const res = await axios.get(target, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 8000,
        maxContentLength: 2 * 1024 * 1024,
      });

      const html = typeof res.data === 'string' ? res.data : '';
      const clean = this.cleanHtml(html);
      return {
        success: true,
        data: {
          url: target,
          content: clean.slice(0, 2500),
        },
      };
    } catch (err: any) {
      this.logger.error(`Direct fetch failed for ${target}: ${err?.message}`);
      return {
        success: false,
        error: `Could not reach ${target}. The website may be down or unreachable.`,
      };
    }
  }

  private cleanHtml(html: string): string {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
