import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { apiClient } from '../lib/api';

const SUBJECTS = [
  { key: 'math', label: 'Math', emoji: '🔢' },
  { key: 'english', label: 'English', emoji: '📖' },
  { key: 'science', label: 'Science', emoji: '🔬' },
  { key: 'chinese', label: 'Chinese', emoji: '汉' },
  { key: 'higher_chinese', label: 'Higher Chinese', emoji: '高' },
] as const;

export function ChildDashboardPage() {
  const { childId } = useParams<{ childId: string }>();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!childId) return;
    apiClient.get(`/wrong-answers/summary?childId=${childId}`)
      .then((r) => setSummary(r.data))
      .catch(() => {});
  }, [childId]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate('/dashboard')} className="text-indigo-600 text-sm">← Back</button>
        <Link to={`/children/${childId}/edit`} className="text-sm text-gray-500">Edit</Link>
      </div>
      <h1 className="text-xl font-bold mb-4">Choose a subject</h1>
      <div className="grid grid-cols-2 gap-3">
        {SUBJECTS.map((subject) => (
          <button
            key={subject.key}
            aria-label={subject.label}
            onClick={() => navigate(`/subjects/${childId}/${subject.key}`)}
            className="relative flex flex-col items-center p-5 border rounded-xl shadow-sm"
          >
            {summary[subject.key] > 0 && (
              <span className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {summary[subject.key] > 9 ? '9+' : summary[subject.key]}
              </span>
            )}
            <span className="text-3xl mb-2">{subject.emoji}</span>
            <span className="font-medium text-sm">{subject.label}</span>
          </button>
        ))}
      </div>
      {/* Camera FAB */}
      <button
        aria-label="Scan homework"
        onClick={() => navigate(`/scan/${childId}`)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center text-white text-2xl shadow-lg"
      >
        📷
      </button>
    </div>
  );
}
