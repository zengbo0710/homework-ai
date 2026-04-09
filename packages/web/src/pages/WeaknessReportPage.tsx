import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../lib/api';

interface TopicGroup {
  topic: string;
  wrongCount: number;
  partialCount: number;
}

interface Weakness {
  rank: number;
  topic: string;
  severity: 'high' | 'medium' | 'low';
  pattern: string;
  suggestion: string;
}

interface WeaknessReport {
  id: string;
  subject: string;
  summary: string;
  topicGroups: TopicGroup[];
  weaknesses: Weakness[];
  totalQuestions: number;
  totalTopics: number;
  createdAt: string;
}

const SUBJECT_LABELS: Record<string, string> = {
  math: 'Math', english: 'English', science: 'Science',
  chinese: 'Chinese', higher_chinese: 'Higher Chinese',
};

const SEVERITY_COLOR: Record<string, string> = {
  high: 'text-red-600 bg-red-50 border-red-200',
  medium: 'text-amber-600 bg-amber-50 border-amber-200',
  low: 'text-green-600 bg-green-50 border-green-200',
};

export function WeaknessReportPage() {
  const { childId, subject } = useParams<{ childId: string; subject: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<WeaknessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!childId || !subject) return;
    apiClient
      .get(`/reports/weakness?childId=${childId}&subject=${subject}`)
      .then((r) => setReport(r.data))
      .catch((err) => {
        if (err.response?.status !== 404) {
          setError('Failed to load report.');
        }
        // 404 means no report yet — show generate button
      })
      .finally(() => setLoading(false));
  }, [childId, subject]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await apiClient.post('/reports/weakness', { childId, subject });
      setReport(res.data);
    } catch (err: any) {
      if (err.response?.status === 402) {
        setError('Insufficient tokens. Please purchase more tokens.');
      } else if (err.response?.data?.error === 'no_wrong_answers') {
        setError('No unresolved wrong answers found for this subject.');
      } else {
        setError('Failed to generate report. Please try again.');
      }
    } finally {
      setGenerating(false);
    }
  }

  const maxWrong = Math.max(1, ...((report?.topicGroups ?? []).map((g) => g.wrongCount + g.partialCount)));

  if (loading) return <div className="p-4">Loading…</div>;

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="text-indigo-600 text-sm">← Back</button>
        <h1 className="text-xl font-bold">
          Weakness Report — {SUBJECT_LABELS[subject ?? ''] ?? subject}
        </h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {!report ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No report generated yet.</p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate Report (1 token)'}
          </button>
        </div>
      ) : (
        <>
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4">
            <p className="text-sm text-indigo-900">{report.summary}</p>
            <p className="text-xs text-indigo-600 mt-2">
              {report.totalQuestions} questions · {report.totalTopics} topics · {new Date(report.createdAt).toLocaleDateString()}
            </p>
          </div>

          {report.topicGroups.length > 0 && (
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">Topic Breakdown</h2>
              <div className="space-y-2">
                {report.topicGroups.map((g) => {
                  const total = g.wrongCount + g.partialCount;
                  const pct = Math.round((total / maxWrong) * 100);
                  return (
                    <div key={g.topic}>
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>{g.topic}</span>
                        <span>{g.wrongCount} wrong{g.partialCount > 0 ? ` · ${g.partialCount} partial` : ''}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-400 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {report.weaknesses.length > 0 && (
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">Weaknesses</h2>
              <div className="space-y-3">
                {report.weaknesses.map((w) => (
                  <div key={w.rank} className={`border rounded-xl p-4 ${SEVERITY_COLOR[w.severity]}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">#{w.rank} {w.topic}</span>
                      <span className="text-xs capitalize px-2 py-0.5 rounded-full border">{w.severity}</span>
                    </div>
                    <p className="text-xs mb-1"><strong>Pattern:</strong> {w.pattern}</p>
                    <p className="text-xs"><strong>Suggestion:</strong> {w.suggestion}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex-1 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg disabled:opacity-50"
            >
              {generating ? 'Regenerating…' : 'Regenerate Report'}
            </button>
            <button
              onClick={() => navigate(`/subjects/${childId}/${subject}`)}
              className="flex-1 py-2 text-sm bg-indigo-600 text-white rounded-lg"
            >
              Practice Weaknesses
            </button>
          </div>
        </>
      )}
    </div>
  );
}
