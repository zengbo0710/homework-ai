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
  figureRegion?: { x: number; y: number; w: number; h: number } | null;
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

IMPORTANT — questionText must always be self-contained with full context:
- For standalone questions: copy the full question text as written.
- For word problems: include the ENTIRE passage/scenario, then the specific sub-question. A reader must be able to understand the question without seeing the image.
- For sub-questions (a), (b), (c)…: always prepend the parent question's scenario/stem so the sub-question makes sense on its own. e.g. "There were 192 pupils and 24 teachers on a trip. The ratio of pupils to teachers was 8:1. (b) What was the new number of pupils per teacher if 5 more teachers joined?"
- Never truncate. If a word problem is long, include it in full.

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
    "questionText": "Full self-contained question including any necessary context/scenario",
    "childAnswer": "What the child wrote (null if blank)",
    "correctAnswer": "The correct answer",
    "status": "correct|wrong|partial_correct",
    "explanation": "Why the answer is wrong/partial (empty string if correct)",
    "topic": "Topic tag (e.g. addition, grammar, forces)",
    "difficulty": "easy|medium|hard",
    "figureRegion": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 0.3} or null
  }]
}

figureRegion is a normalized bounding box (0–1) of the diagram, table, or figure the question directly references in that image. Include it whenever the question cannot be answered without seeing the visual (e.g. a flower diagram, data table, graph, map). Set to null if the question is purely text-based. x/y = top-left corner, w/h = width/height, all as fractions of the image dimensions.`;

  const response = await client.chat.completions.create({
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    response_format: { type: 'json_object' },
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

  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let parsed: Omit<AiAnalysisResult, 'latencyMs'>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`AI returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  return { ...parsed, latencyMs };
}
