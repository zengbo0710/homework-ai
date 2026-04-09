import OpenAI from 'openai';
import { AiConfig } from './ai-config';
import { WrongAnswer } from '@prisma/client';

export interface PracticeQuestion {
  questionText: string;
  answer: string;
  explanation: string;
  topic: string | null;
  difficulty: string | null;
}

export interface PracticeGenerationResult {
  questions: PracticeQuestion[];
}

export async function generatePracticeQuestions(
  client: OpenAI,
  wrongAnswers: WrongAnswer[],
  grade: number,
  multiplier: number,
  config: AiConfig
): Promise<PracticeGenerationResult> {
  const questionList = wrongAnswers
    .map((wa, i) =>
      `${i + 1}. Topic: ${wa.topic ?? 'general'}\n   Question: ${wa.questionText}\n   Correct answer: ${wa.correctAnswer}`
    )
    .join('\n\n');

  const totalToGenerate = wrongAnswers.length * multiplier;

  const systemPrompt = `You are an expert Singapore primary school question writer for Primary ${grade} students. Given a list of questions a student got wrong, generate similar practice questions to reinforce the same topics.
Generate exactly ${totalToGenerate} practice questions total (${multiplier} per source question).
Return ONLY a valid JSON object. No markdown, no preamble.

Schema:
{
  "questions": [{
    "questionText": "The practice question",
    "answer": "The correct answer",
    "explanation": "Brief explanation of the answer",
    "topic": "Topic tag matching the source question",
    "difficulty": "easy|medium|hard"
  }]
}`;

  const response = await client.chat.completions.create({
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Here are the questions the student got wrong. Generate ${multiplier} similar practice questions for each:\n\n${questionList}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? '';
  let parsed: PracticeGenerationResult;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`AI returned invalid JSON: ${raw.slice(0, 200)}`);
  }
  return parsed;
}
