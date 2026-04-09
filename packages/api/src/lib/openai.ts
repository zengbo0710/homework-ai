import OpenAI from 'openai';

const PROVIDER_CONFIG: Record<string, { baseURL?: string; envKey: string }> = {
  openai: { envKey: 'OPENAI_API_KEY' },
  deepseek: { baseURL: 'https://api.deepseek.com', envKey: 'DEEPSEEK_API_KEY' },
};

const _clients: Record<string, OpenAI> = {};

export function getAIClient(provider = 'openai'): OpenAI {
  if (_clients[provider]) return _clients[provider];

  const config = PROVIDER_CONFIG[provider] ?? PROVIDER_CONFIG['openai'];
  const apiKey = process.env[config.envKey] ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error(`${config.envKey} environment variable is required`);

  _clients[provider] = new OpenAI({ apiKey, ...(config.baseURL ? { baseURL: config.baseURL } : {}) });
  return _clients[provider];
}

/** @deprecated Use getAIClient(provider) instead */
export function getOpenAIClient(): OpenAI {
  return getAIClient('openai');
}
