import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeHomework } from '../lib/ai-analysis';

const mockCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

const mockConfig = { model: 'gpt-4o-mini', maxTokens: 4096, temperature: 0.1, provider: 'openai' };

const validAiResponse = {
  subject: 'math',
  summary: 'Good work',
  totalQuestions: 2,
  correctCount: 1,
  partialCorrectCount: 0,
  wrongCount: 1,
  questions: [
    {
      questionNumber: 1, imageOrder: 1, questionText: '1+1=?', childAnswer: '2',
      correctAnswer: '2', status: 'correct', explanation: '', topic: 'addition', difficulty: 'easy',
    },
    {
      questionNumber: 2, imageOrder: 1, questionText: '5×3=?', childAnswer: '14',
      correctAnswer: '15', status: 'wrong', explanation: 'Multiplication error',
      topic: 'multiplication', difficulty: 'medium',
    },
  ],
};

describe('analyzeHomework', () => {
  beforeEach(() => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(validAiResponse) } }],
    });
  });

  it('returns parsed AI result with latencyMs', async () => {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: 'sk-test' });
    const imageBuffer = Buffer.from('fake-image');

    const result = await analyzeHomework(client, [imageBuffer], 3, mockConfig);

    expect(result.subject).toBe('math');
    expect(result.totalQuestions).toBe(2);
    expect(result.questions).toHaveLength(2);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('throws when AI returns invalid JSON', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'not json' } }] });
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: 'sk-test' });

    await expect(analyzeHomework(client, [Buffer.from('x')], 3, mockConfig)).rejects.toThrow('AI returned invalid JSON');
  });
});
