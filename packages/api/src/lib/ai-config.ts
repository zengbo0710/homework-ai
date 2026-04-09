import { PrismaClient } from '@prisma/client';

export interface AiConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  provider: string;
}

let _cache: AiConfig | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getAiConfig(prisma: PrismaClient): Promise<AiConfig> {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) return _cache;
  const rows = await prisma.systemConfig.findMany({
    where: { key: { in: ['ai_model', 'ai_max_tokens', 'ai_temperature', 'ai_provider'] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  _cache = {
    model: (map['ai_model'] as string) ?? 'gpt-4o-mini',
    maxTokens: Number(map['ai_max_tokens'] ?? 4096),
    temperature: Number(map['ai_temperature'] ?? 0.1),
    provider: (map['ai_provider'] as string) ?? 'openai',
  };
  _cacheTime = Date.now();
  return _cache;
}

export function clearAiConfigCache(): void {
  _cache = null;
  _cacheTime = 0;
}
