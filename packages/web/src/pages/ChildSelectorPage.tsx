import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../lib/api';

interface Child {
  id: string;
  name: string;
  gradeLevel: string;
  avatarUrl: string | null;
}

export function ChildSelectorPage() {
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    apiClient.get('/children').then((res) => setChildren(res.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4">Loading…</div>;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Select a child</h1>
      <div className="grid grid-cols-2 gap-3">
        {children.map((child) => (
          <button
            key={child.id}
            onClick={() => navigate(`/dashboard/${child.id}`)}
            className="flex flex-col items-center p-4 border rounded-xl shadow-sm hover:bg-indigo-50 transition"
          >
            {child.avatarUrl ? (
              <img src={child.avatarUrl} alt={child.name} className="w-16 h-16 rounded-full object-cover mb-2" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-indigo-200 flex items-center justify-center mb-2 text-2xl font-bold text-indigo-700">
                {child.name[0]}
              </div>
            )}
            <span className="font-medium">{child.name}</span>
            <span className="text-xs text-gray-500">{child.gradeLevel}</span>
          </button>
        ))}
        <Link
          to="/children/new"
          aria-disabled={children.length >= 5}
          onClick={(e) => children.length >= 5 && e.preventDefault()}
          className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl transition ${
            children.length >= 5
              ? 'border-gray-200 text-gray-300 cursor-not-allowed'
              : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50'
          }`}
        >
          <span className="text-3xl">+</span>
          <span className="text-sm font-medium">Add Child</span>
        </Link>
      </div>
    </div>
  );
}
