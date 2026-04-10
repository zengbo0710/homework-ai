import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../lib/api';

interface SubmissionImage {
  id: string;
  imageUrl: string;
  sortOrder: number;
}

interface WrongAnswer {
  id: string;
  questionNumber: number;
  imageOrder: number;
  questionText: string;
  childAnswer: string | null;
  correctAnswer: string;
  status: 'wrong' | 'partial_correct';
  explanation: string;
  topic: string | null;
}

interface SubmissionResult {
  id: string;
  status: string;
  detectedSubject: string | null;
  imageCount: number;
  errorMessage: string | null;
  images: SubmissionImage[];
  aiResponse: {
    summary: string | null;
    totalQuestions: number | null;
    correctCount: number | null;
    partialCorrectCount: number | null;
    wrongCount: number | null;
  } | null;
  wrongAnswers: WrongAnswer[];
}

const STATUS_COLOR: Record<string, string> = {
  wrong: 'bg-red-50 border-red-200',
  partial_correct: 'bg-yellow-50 border-yellow-200',
};

const STATUS_LABEL: Record<string, string> = {
  wrong: 'Wrong',
  partial_correct: 'Partial',
};

function QuestionImage({ imageUrl }: { imageUrl: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mb-3">
      <img
        src={imageUrl}
        alt="Homework page"
        onClick={() => setExpanded((v) => !v)}
        className={`rounded-lg border border-gray-200 cursor-pointer w-full object-contain transition-all ${
          expanded ? 'max-h-[600px]' : 'max-h-32'
        }`}
      />
      <p className="text-xs text-gray-400 text-center mt-1">
        {expanded ? 'Tap to collapse' : 'Tap to expand'}
      </p>
    </div>
  );
}

export function SubmissionResultPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    async function fetchResult() {
      try {
        const res = await apiClient.get(`/submissions/${id}`);
        setResult(res.data);
        if (res.data.status === 'pending' || res.data.status === 'processing') {
          interval = setInterval(async () => {
            const r = await apiClient.get(`/submissions/${id}`);
            setResult(r.data);
            if (r.data.status !== 'pending' && r.data.status !== 'processing') {
              clearInterval(interval);
            }
          }, 3000);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    fetchResult();
    return () => clearInterval(interval);
  }, [id]);

  if (loading) return <div className="p-4">Loading…</div>;
  if (!result) return <div className="p-4 text-red-600">Result not found.</div>;

  const isPending = result.status === 'pending' || result.status === 'processing';

  // Map sortOrder → imageUrl for quick lookup
  const imageByOrder = Object.fromEntries(
    (result.images ?? []).map((img) => [img.sortOrder, img.imageUrl])
  );

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="text-indigo-600 text-sm">← Back</button>
        <h1 className="text-xl font-bold">Result</h1>
        {result.detectedSubject && (
          <span className="ml-auto bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full font-medium capitalize">
            {result.detectedSubject.replace('_', ' ')}
          </span>
        )}
      </div>

      {isPending && (
        <div className="flex flex-col items-center py-12 gap-3 text-gray-500">
          <div className="w-10 h-10 border-4 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
          <p>Analysing homework…</p>
        </div>
      )}

      {result.status === 'failed' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
          <p className="font-medium">Analysis failed</p>
          <p className="text-sm mt-1">{result.errorMessage ?? 'Unknown error'}</p>
        </div>
      )}

      {result.status === 'completed' && result.aiResponse && (
        <>
          {/* Summary card */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4">
            <p className="text-sm text-gray-700">{result.aiResponse.summary}</p>
            <div className="flex gap-4 mt-3 text-sm font-medium">
              <span className="text-green-700">✓ {result.aiResponse.correctCount ?? 0} correct</span>
              <span className="text-yellow-700">~ {result.aiResponse.partialCorrectCount ?? 0} partial</span>
              <span className="text-red-700">✗ {result.aiResponse.wrongCount ?? 0} wrong</span>
            </div>
          </div>

          {/* Wrong answer list */}
          {result.wrongAnswers.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold text-gray-800">Needs attention ({result.wrongAnswers.length})</h2>
              {result.wrongAnswers.map((wa) => {
                const imgUrl = imageByOrder[wa.imageOrder];
                return (
                  <div key={wa.id} className={`border rounded-xl p-4 ${STATUS_COLOR[wa.status] ?? ''}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold text-gray-500">
                        Q{wa.questionNumber}{wa.topic ? ` · ${wa.topic}` : ''}
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        wa.status === 'wrong' ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'
                      }`}>
                        {STATUS_LABEL[wa.status]}
                      </span>
                    </div>

                    {/* Source image — collapsible */}
                    {imgUrl && <QuestionImage imageUrl={imgUrl} />}

                    <p className="text-sm font-medium mb-1">{wa.questionText}</p>
                    {wa.childAnswer && (
                      <p className="text-sm text-red-700">Child answered: {wa.childAnswer}</p>
                    )}
                    <p className="text-sm text-green-700">Correct: {wa.correctAnswer}</p>
                    <p className="text-xs text-gray-600 mt-2 italic">{wa.explanation}</p>
                  </div>
                );
              })}
            </div>
          )}

          {result.wrongAnswers.length === 0 && (
            <div className="text-center py-8 text-green-700">
              <p className="text-4xl mb-2">🎉</p>
              <p className="font-bold text-lg">All correct!</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
