import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../lib/api';

interface PracticeQuestion {
  id: string;
  questionText: string;
  answer: string;
  topic: string | null;
  difficulty: string | null;
  sortOrder: number;
}

interface PracticeSession {
  id: string;
  subject: string;
  totalQuestions: number;
  questions: PracticeQuestion[];
}

const SUBJECT_LABELS: Record<string, string> = {
  math: 'Math', english: 'English', science: 'Science',
  chinese: 'Chinese', higher_chinese: 'Higher Chinese',
};

export function PracticePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiClient.get(`/practice/sessions/${sessionId}`)
      .then((r) => setSession(r.data))
      .finally(() => setLoading(false));
  }, [sessionId]);

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (loading) return <div className="p-4">Loading…</div>;
  if (!session) return <div className="p-4 text-red-600">Session not found.</div>;

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="text-indigo-600 text-sm">← Back</button>
        <h1 className="text-xl font-bold">Practice — {SUBJECT_LABELS[session.subject] ?? session.subject}</h1>
        <button
          onClick={() => navigate(`/practice/${sessionId}/print`)}
          className="ml-auto text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg"
        >
          Print
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-4">{session.totalQuestions} questions</p>

      <div className="space-y-4">
        {session.questions.map((q) => (
          <div key={q.id} className="border border-gray-200 rounded-xl p-4 bg-white">
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-gray-400">Q{q.sortOrder}{q.topic ? ` · ${q.topic}` : ''}</span>
              {q.difficulty && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">{q.difficulty}</span>
              )}
            </div>
            <p className="text-sm font-medium mb-3">{q.questionText}</p>
            {revealed.has(q.id) ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-green-800">Answer: {q.answer}</p>
              </div>
            ) : (
              <button
                onClick={() => toggleReveal(q.id)}
                className="text-sm text-indigo-600 border border-indigo-200 px-3 py-1 rounded-lg"
              >
                Show Answer
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
