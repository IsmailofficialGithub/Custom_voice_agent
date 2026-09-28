import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ToolResult } from './time.tool';

type SearchHit = { title: string; description: string; url: string };

@Injectable()
export class WebSearchTool {
  private readonly logger = new Logger(WebSearchTool.name);

  readonly name = 'web_search';
  readonly description = 'Search the web for current, real-time information like prices, news, rates';
  readonly parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query',
      },
    },
    required: ['query'],
  };

  constructor(private readonly config: ConfigService) {}

  async execute(input: { query: string }): Promise<ToolResult> {
    const query = (input.query || '').trim();
    if (!query) {
      return { success: false, error: 'Search query was empty' };
    }

    const apiKey = (this.config.get<string>('BRAVE_SEARCH_API_KEY') || '').trim();
    const hasBraveKey = apiKey.length > 0 && !this.isPlaceholderKey(apiKey);

    if (hasBraveKey) {
      try {
        const results = await this.searchBrave(query, apiKey);
        if (results.length > 0) {
          return { success: true, data: results };
        }
        this.logger.warn(`Brave returned 0 results for "${query}", trying fallback`);
      } catch (err) {
        this.logger.error(`Brave web_search failed: ${this.formatAxiosError(err)}`);
      }
    } else {
      this.logger.warn(
        'BRAVE_SEARCH_API_KEY is missing or still a placeholder — using DuckDuckGo fallback',
      );
    }

    try {
      const results = await this.searchDuckDuckGo(query);
      if (results.length > 0) {
        return { success: true, data: results };
      }
      return { success: false, error: 'No web results found for that query' };
    } catch (err) {
      this.logger.error(`DuckDuckGo web_search failed: ${this.formatAxiosError(err)}`);
      return { success: false, error: "Couldn't reach web search right now" };
    }
  }

  private isPlaceholderKey(key: string): boolean {
    const normalized = key.toLowerCase();
    return (
      normalized.includes('your-brave') ||
      normalized.includes('your-api') ||
      normalized.includes('changeme') ||
      normalized.includes('placeholder') ||
      normalized === 'xxx'
    );
  }

  private async searchBrave(query: string, apiKey: string): Promise<SearchHit[]> {
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      params: { q: query, count: 5 },
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      timeout: 8000,
    });

    const results = response.data?.web?.results ?? [];
    return results.map((r: { title: string; description: string; url: string }) => ({
      title: r.title,
      description: r.description,
      url: r.url,
    }));
  }

  private async searchDuckDuckGo(query: string): Promise<SearchHit[]> {
    const hits: SearchHit[] = [];

    // 1) Instant Answer API (free, no key)
    const instant = await axios.get('https://api.duckduckgo.com/', {
      params: {
        q: query,
        format: 'json',
        no_html: 1,
        skip_disambig: 1,
      },
      timeout: 8000,
      headers: { 'User-Agent': 'VoiceAgent/1.0' },
    });

    const data = instant.data ?? {};
    if (data.AbstractText) {
      hits.push({
        title: data.Heading || query,
        description: data.AbstractText,
        url: data.AbstractURL || data.AbstractSource || 'https://duckduckgo.com',
      });
    }

    const related = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
    for (const topic of related) {
      if (hits.length >= 5) break;
      if (topic?.Text && topic?.FirstURL) {
        hits.push({
          title: String(topic.Text).split(' - ')[0].slice(0, 120),
          description: topic.Text,
          url: topic.FirstURL,
        });
      } else if (Array.isArray(topic?.Topics)) {
        for (const nested of topic.Topics) {
          if (hits.length >= 5) break;
          if (nested?.Text && nested?.FirstURL) {
            hits.push({
              title: String(nested.Text).split(' - ')[0].slice(0, 120),
              description: nested.Text,
              url: nested.FirstURL,
            });
          }
        }
      }
    }

    if (hits.length >= 3) return hits.slice(0, 5);

    // 2) HTML results page as organic fallback
    const htmlRes = await axios.get('https://html.duckduckgo.com/html/', {
      params: { q: query },
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VoiceAgent/1.0)',
        Accept: 'text/html',
      },
    });

    const html = typeof htmlRes.data === 'string' ? htmlRes.data : '';
    const resultRegex =
      /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td)/gi;

    let match: RegExpExecArray | null;
    while ((match = resultRegex.exec(html)) !== null && hits.length < 5) {
      const url = this.decodeDuckDuckGoUrl(match[1]);
      const title = this.stripHtml(match[2]);
      const description = this.stripHtml(match[3]);
      if (!url || !title) continue;
      if (hits.some((h) => h.url === url)) continue;
      hits.push({ title, description, url });
    }

    return hits.slice(0, 5);
  }

  private decodeDuckDuckGoUrl(href: string): string {
    try {
      if (href.startsWith('//')) href = `https:${href}`;
      const parsed = new URL(href, 'https://duckduckgo.com');
      const uddg = parsed.searchParams.get('uddg');
      return uddg ? decodeURIComponent(uddg) : parsed.toString();
    } catch {
      return href;
    }
  }

  private stripHtml(value: string): string {
    return value
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatAxiosError(err: unknown): string {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const body = err.response?.data;
      const detail =
        typeof body === 'object' && body !== null
          ? JSON.stringify(body).slice(0, 300)
          : String(body ?? err.message);
      return `HTTP ${status ?? '??'}: ${detail}`;
    }
    return err instanceof Error ? err.message : String(err);
  }
}
