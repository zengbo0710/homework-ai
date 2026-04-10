import { PrismaClient } from '@prisma/client';

export interface AiConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  provider: string;
}

let _cache: AiConfig | null = null;
let _visionCache: AiConfig | null = null;
let _cacheTime = 0;
let _visionCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

const TEXT_KEYS = ['ai_model', 'ai_max_tokens', 'ai_temperature', 'ai_provider'];
const VISION_KEYS = ['ai_vision_model', 'ai_vision_max_tokens', 'ai_vision_temperature', 'ai_vision_provider'];

export async function getAiConfig(prisma: PrismaClient): Promise<AiConfig> {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) return _cache;
  const rows = await prisma.systemConfig.findMany({ where: { key: { in: TEXT_KEYS } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  _cache = {
    model: (map['ai_model'] as string) ?? 'deepseek-chat',
    maxTokens: Number(map['ai_max_tokens'] ?? 4096),
    temperature: Number(map['ai_temperature'] ?? 0.1),
    provider: (map['ai_provider'] as string) ?? 'deepseek',
  };
  _cacheTime = Date.now();
  return _cache;
}

/** Vision config — for homework scanning (requires vision-capable model). */
export async function getAiVisionConfig(prisma: PrismaClient): Promise<AiConfig> {
  if (_visionCache && Date.now() - _visionCacheTime < CACHE_TTL_MS) return _visionCache;
  const rows = await prisma.systemConfig.findMany({ where: { key: { in: [...TEXT_KEYS, ...VISION_KEYS] } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  // Vision keys override text keys — fall back to text config if vision not set
  _visionCache = {
    model: (map['ai_vision_model'] as string) ?? (map['ai_model'] as string) ?? 'gpt-4o-mini',
    maxTokens: Number(map['ai_vision_max_tokens'] ?? map['ai_max_tokens'] ?? 4096),
    temperature: Number(map['ai_vision_temperature'] ?? map['ai_temperature'] ?? 0.1),
    provider: (map['ai_vision_provider'] as string) ?? (map['ai_provider'] as string) ?? 'openai',
  };
  _visionCacheTime = Date.now();
  return _visionCache;
}

export function clearAiConfigCache(): void {
  _cache = null;
  _visionCache = null;
  _cacheTime = 0;
  _visionCacheTime = 0;
}
