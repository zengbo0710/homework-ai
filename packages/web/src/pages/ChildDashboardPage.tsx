import { useNavigate, useParams, Link } from 'react-router-dom';

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
            disabled
            aria-label={subject.label}
            className="flex flex-col items-center p-5 border rounded-xl shadow-sm opacity-60 cursor-not-allowed"
          >
            <span className="text-3xl mb-2">{subject.emoji}</span>
            <span className="font-medium text-sm">{subject.label}</span>
          </button>
        ))}
      </div>
      {/* Camera FAB — placeholder until M2 */}
      <button
        disabled
        aria-label="Scan homework"
        className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center text-white text-2xl shadow-lg opacity-60 cursor-not-allowed"
      >
        📷
      </button>
    </div>
  );
}
