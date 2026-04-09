import OpenAI from 'openai';
import { AiConfig } from './ai-config';

export interface AiQuestion {
  questionNumber: number;
  imageOrder: number;
  questionText: string;
  childAnswer: string | null;
  correctAnswer: string;
  status: 'correct' | 'wrong' | 'partial_correct';
  explanation: string;
  topic: string | null;
  difficulty: string | null;
}

export interface AiAnalysisResult {
  subject: string;
  summary: string;
  totalQuestions: number;
  correctCount: number;
  partialCorrectCount: number;
  wrongCount: number;
  questions: AiQuestion[];
  latencyMs: number;
}

export async function analyzeHomework(
  client: OpenAI,
  imageBuffers: Buffer[],
  grade: number,
  config: AiConfig
): Promise<AiAnalysisResult> {
  const start = Date.now();

  const imageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = imageBuffers.map((buf) => ({
    type: 'image_url',
    image_url: {
      url: `data:image/jpeg;base64,${buf.toString('base64')}`,
      detail: 'high',
    },
  }));

  const systemPrompt = `You are an expert Singapore primary school homework checker. The student is in Primary ${grade} (aged ${grade + 6}). Your task is to:
1. Detect which subject the homework belongs to (math, english, science, chinese, higher_chinese)
2. Identify every question in the image(s)
3. Grade each question as correct, wrong, or partial_correct
4. Provide a clear, age-appropriate explanation for wrong or partial answers
5. Tag each question with a topic (e.g. "fractions", "grammar", "photosynthesis")
6. Return ONLY a valid JSON object matching the schema below. No markdown, no preamble.

Schema:
{
  "subject": "math|english|science|chinese|higher_chinese",
  "summary": "Brief overall summary (1-2 sentences)",
  "totalQuestions": number,
  "correctCount": number,
  "partialCorrectCount": number,
  "wrongCount": number,
  "questions": [{
    "questionNumber": number,
    "imageOrder": number,
    "questionText": "The question as written",
    "childAnswer": "What the child wrote (null if blank)",
    "correctAnswer": "The correct answer",
    "status": "correct|wrong|partial_correct",
    "explanation": "Why the answer is wrong/partial (empty string if correct)",
    "topic": "Topic tag (e.g. addition, grammar, forces)",
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
        content: [
          {
            type: 'text',
            text: `Here are ${imageBuffers.length} homework image(s) for a Primary ${grade} student. Please grade all questions.`,
          },
          ...imageContent,
        ],
      },
    ],
  });

  const latencyMs = Date.now() - start;
  const raw = response.choices[0]?.message?.content ?? '';

  let parsed: Omit<AiAnalysisResult, 'latencyMs'>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`AI returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  return { ...parsed, latencyMs };
}
