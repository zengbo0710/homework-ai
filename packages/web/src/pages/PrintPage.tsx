import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../lib/api';

interface PracticeQuestion {
  id: string;
  questionText: string;
  answer: string;
  topic: string | null;
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

export function PrintPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<PracticeSession | null>(null);

  useEffect(() => {
    apiClient.get(`/practice/sessions/${sessionId}`)
      .then((r) => {
        setSession(r.data);
        setTimeout(() => window.print(), 500);
      });
  }, [sessionId]);

  if (!session) return <div className="p-4">Loading…</div>;

  return (
    <div className="print-page p-8 max-w-2xl mx-auto">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          .print-page { padding: 20mm; }
        }
        .answer-section { margin-top: 40mm; border-top: 1px solid #ccc; padding-top: 10mm; }
      `}</style>

      <div className="no-print mb-4">
        <button onClick={() => window.print()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm">
          Print
        </button>
        <button onClick={() => window.history.back()} className="ml-2 text-sm text-gray-600">
          ← Back
        </button>
      </div>

      <h1 className="text-2xl font-bold mb-1">Practice Worksheet</h1>
      <p className="text-sm text-gray-600 mb-6">
        Subject: {SUBJECT_LABELS[session.subject] ?? session.subject} · {session.totalQuestions} questions
      </p>

      <div className="space-y-6">
        {session.questions.map((q) => (
          <div key={q.id}>
            <p className="font-semibold text-sm mb-1">Q{q.sortOrder}{q.topic ? ` (${q.topic})` : ''}</p>
            <p className="text-sm mb-4">{q.questionText}</p>
            <div className="border-b border-dotted border-gray-300 mb-2" style={{ height: '24px' }} />
          </div>
        ))}
      </div>

      <div className="answer-section">
        <h2 className="text-lg font-bold mb-4">Answers</h2>
        <div className="space-y-2">
          {session.questions.map((q) => (
            <p key={q.id} className="text-sm">
              Q{q.sortOrder}: {q.answer}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
