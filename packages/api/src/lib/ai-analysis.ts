import OpenAI from 'openai';
import { AiConfig } from './ai-config';

export interface AiFigure {
  id: number;
  imageOrder: number;
  description: string;
  region: { x: number; y: number; w: number; h: number };
}

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
  figureId?: number | null;
  region?: { x: number; y: number; w: number; h: number };
}

export interface AiAnalysisResult {
  subject: string;
  summary: string;
  totalQuestions: number;
  correctCount: number;
  partialCorrectCount: number;
  wrongCount: number;
  figures: AiFigure[];
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
  "figures": [
    {
      "id": 1,
      "imageOrder": 1,
      "description": "Short description of the figure (e.g. 'Flower A/B/C diagram')",
      "region": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 0.3}
    }
  ],
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
    "figureId": 1 or null,
    "region": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 0.2}
  }]
}

IMPORTANT — figures array rules:
Step 1 — identify ALL diagrams, tables, graphs, images and illustrations in every homework image. Add each one to the "figures" array with a tight bounding box (x/y = top-left corner, w/h = width/height, all as fractions 0.0–1.0 of image dimensions). Do NOT include question text in the bounding box — crop only the visual element itself.
Step 2 — for each question, set "figureId" to the id of the figure the question references. Set to null only for purely text-based questions with no visual.
- Multi-part questions (i)(ii)(iii)(iv) or (a)(b)(c) referencing the same figure must ALL use the same figureId.
- Any question containing "study the", "as shown", "based on the diagram/figure/table/graph/observations", "refer to", "shown below/above", "the diagram/figure/table/graph/observations show(s)" MUST have a non-null figureId.

IMPORTANT — questions[].region rules:
Every question MUST include a "region" bounding box on its own imageOrder. The box covers the FULL content of the question: question number, stem, all sub-parts, answer blanks, and the child's handwritten answer. Include a small margin (a few pixels) but do NOT include unrelated neighbour questions. x/y are fractions of the image's top-left origin, w/h are fractions of the image dimensions, all in [0.0, 1.0].`;

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

  return { ...parsed, figures: parsed.figures ?? [], latencyMs };
}
