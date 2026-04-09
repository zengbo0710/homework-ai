import OpenAI from 'openai';
import { AiConfig } from './ai-config';
import { WrongAnswer } from '@prisma/client';

export interface TopicGroup {
  topic: string;
  wrongCount: number;
  partialCount: number;
}

export interface Weakness {
  rank: number;
  topic: string;
  severity: 'high' | 'medium' | 'low';
  pattern: string;
  suggestion: string;
}

export interface WeaknessAnalysisResult {
  summary: string;
  topicGroups: TopicGroup[];
  weaknesses: Weakness[];
}

export async function analyzeWeaknesses(
  client: OpenAI,
  wrongAnswers: WrongAnswer[],
  grade: number,
  config: AiConfig
): Promise<WeaknessAnalysisResult> {
  const questionList = wrongAnswers
    .map((wa, i) =>
      `${i + 1}. Topic: ${wa.topic ?? 'general'} | Status: ${wa.status} | Q: ${wa.questionText} | Correct: ${wa.correctAnswer}`
    )
    .join('\n');

  const systemPrompt = `You are an expert Singapore primary school learning analyst for Primary ${grade} students. Analyse the student's wrong and partially correct answers. Identify patterns, group by topic, and rank weaknesses by severity.
Return ONLY a valid JSON object. No markdown, no preamble.

Schema:
{
  "summary": "2-3 sentence overall weakness summary",
  "topicGroups": [{ "topic": "topic name", "wrongCount": number, "partialCount": number }],
  "weaknesses": [{ "rank": number, "topic": "topic name", "severity": "high|medium|low", "pattern": "Observed error pattern", "suggestion": "Targeted improvement suggestion" }]
}`;

  const response = await client.chat.completions.create({
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Here are ${wrongAnswers.length} wrong/partial answers for a Primary ${grade} student:\n\n${questionList}` },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? '';
  let parsed: WeaknessAnalysisResult;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`AI returned invalid JSON: ${raw.slice(0, 200)}`);
  }
  return parsed;
}
