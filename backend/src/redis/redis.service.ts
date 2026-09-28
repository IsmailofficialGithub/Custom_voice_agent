import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSec: number;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;

  // Fallback in-memory cache when Redis server is offline
  private inMemoryStore = new Map<string, { value: string; expiresAt: number }>();
  private inMemoryAudio = new Map<string, { chunks: string[]; expiresAt: number }>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const host = this.config.get<string>('REDIS_HOST', 'localhost');
    const port = this.config.get<number>('REDIS_PORT', 6379);
    const password = this.config.get<string>('REDIS_PASSWORD', '');
    const prefix = this.config.get<string>('REDIS_KEY_PREFIX', 'voiceagent:');

    try {
      this.client = new Redis({
        host,
        port,
        password: password || undefined,
        keyPrefix: prefix,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          if (times > 2) {
            this.logger.warn('Redis connection failed. Falling back to robust in-memory cache provider.');
            return null; // Stop retrying
          }
          return 500;
        },
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`Connected to Redis at ${host}:${port}`);
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        this.logger.warn(`Redis connection error: ${err.message}. Using fallback in-memory cache.`);
      });

      this.client.connect().catch((err) => {
        this.isConnected = false;
        this.logger.warn(`Redis connection failed on startup: ${err.message}. Using fallback in-memory cache.`);
      });
    } catch (err) {
      this.isConnected = false;
      this.logger.warn(`Redis initialization error: ${err}. Using fallback in-memory cache.`);
    }
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.isConnected && this.client) {
      try {
        const val = await this.client.get(key);
        return val ? (JSON.parse(val) as T) : null;
      } catch (err) {
        this.logger.warn(`Redis GET failed for key ${key}: ${err}`);
      }
    }

    // Fallback implementation
    const item = this.inMemoryStore.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.inMemoryStore.delete(key);
      return null;
    }
    return JSON.parse(item.value) as T;
  }

  async set(key: string, value: unknown, ttlSec = 3600): Promise<void> {
    const serialized = JSON.stringify(value);

    if (this.isConnected && this.client) {
      try {
        await this.client.set(key, serialized, 'EX', ttlSec);
        return;
      } catch (err) {
        this.logger.warn(`Redis SET failed for key ${key}: ${err}`);
      }
    }

    // Fallback implementation
    this.inMemoryStore.set(key, {
      value: serialized,
      expiresAt: Date.now() + ttlSec * 1000,
    });
  }

  async del(key: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
        return;
      } catch (err) {
        this.logger.warn(`Redis DEL failed for key ${key}: ${err}`);
      }
    }

    this.inMemoryStore.delete(key);
  }

  // Session State Storage
  async setSession(conversationId: string, sessionData: unknown, ttlSec = 600): Promise<void> {
    await this.set(`session:${conversationId}`, sessionData, ttlSec);
  }

  async getSession<T>(conversationId: string): Promise<T | null> {
    return this.get<T>(`session:${conversationId}`);
  }

  async deleteSession(conversationId: string): Promise<void> {
    await this.del(`session:${conversationId}`);
  }

  // Voice Audio Buffer Management
  async pushAudioChunk(conversationId: string, base64Chunk: string, ttlSec = 300): Promise<void> {
    const key = `audio:${conversationId}`;

    if (this.isConnected && this.client) {
      try {
        await this.client.rpush(key, base64Chunk);
        await this.client.expire(key, ttlSec);
        return;
      } catch (err) {
        this.logger.warn(`Redis RPUSH failed for audio chunk ${key}: ${err}`);
      }
    }

    // Fallback
    const existing = this.inMemoryAudio.get(key) || { chunks: [], expiresAt: Date.now() + ttlSec * 1000 };
    existing.chunks.push(base64Chunk);
    existing.expiresAt = Date.now() + ttlSec * 1000;
    this.inMemoryAudio.set(key, existing);
  }

  async getAudioChunks(conversationId: string): Promise<Buffer[]> {
    const key = `audio:${conversationId}`;

    if (this.isConnected && this.client) {
      try {
        const rawChunks = await this.client.lrange(key, 0, -1);
        return rawChunks.map((chunk) => Buffer.from(chunk, 'base64'));
      } catch (err) {
        this.logger.warn(`Redis LRANGE failed for audio chunks ${key}: ${err}`);
      }
    }

    // Fallback
    const item = this.inMemoryAudio.get(key);
    if (!item || Date.now() > item.expiresAt) {
      this.inMemoryAudio.delete(key);
      return [];
    }
    return item.chunks.map((chunk) => Buffer.from(chunk, 'base64'));
  }

  async clearAudioChunks(conversationId: string): Promise<void> {
    const key = `audio:${conversationId}`;

    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
        return;
      } catch (err) {
        this.logger.warn(`Redis DEL audio failed ${key}: ${err}`);
      }
    }

    this.inMemoryAudio.delete(key);
  }

  // Rate-Limiting Sliding Window Engine
  async checkRateLimit(identifier: string, limit = 30, windowSec = 60): Promise<RateLimitResult> {
    const key = `ratelimit:${identifier}`;
    const now = Date.now();
    const windowMs = windowSec * 1000;

    if (this.isConnected && this.client) {
      try {
        const multi = this.client.multi();
        multi.zremrangebyscore(key, 0, now - windowMs);
        multi.zadd(key, now, `${now}-${Math.random()}`);
        multi.zcard(key);
        multi.expire(key, windowSec);

        const results = await multi.exec();
        const count = (results?.[2]?.[1] as number) || 1;

        const allowed = count <= limit;
        const remaining = Math.max(0, limit - count);

        return {
          allowed,
          remaining,
          resetSec: windowSec,
        };
      } catch (err) {
        this.logger.warn(`Redis RateLimit check failed for ${identifier}: ${err}`);
      }
    }

    // Fallback in-memory rate limiter
    const stored = this.get<{ timestamps: number[] }>(key) as unknown as { timestamps: number[] } | null;
    const timestamps = (stored?.timestamps || []).filter((t) => t > now - windowMs);
    timestamps.push(now);

    const allowed = timestamps.length <= limit;
    const remaining = Math.max(0, limit - timestamps.length);

    this.set(key, { timestamps }, windowSec);

    return {
      allowed,
      remaining,
      resetSec: windowSec,
    };
  }
}
