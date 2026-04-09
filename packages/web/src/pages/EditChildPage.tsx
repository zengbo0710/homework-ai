import { useState, FormEvent, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../lib/api';

const GRADE_LEVELS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const;

export function EditChildPage() {
  const { id } = useParams<{ id: string }>();
  const [name, setName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('P1');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiClient
      .get('/children')
      .then((res) => {
        const child = res.data.find(
          (c: { id: string; name: string; gradeLevel: string; avatarUrl: string | null }) => c.id === id
        );
        if (child) {
          setName(child.name);
          setGradeLevel(child.gradeLevel);
          if (child.avatarUrl) setAvatarPreview(child.avatarUrl);
        } else {
          setError('Child not found.');
        }
      })
      .catch(() => setError('Failed to load child data.'))
      .finally(() => setLoadingData(false));
  }, [id]);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiClient.put(`/children/${id}`, { name, gradeLevel });
      if (avatarFile) {
        const form = new FormData();
        form.append('avatar', avatarFile);
        await apiClient.post(`/children/${id}/avatar`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      navigate('/dashboard');
    } catch {
      setError('Failed to update. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (loadingData) return <div className="p-4">Loading…</div>;

  return (
    <div className="p-4 max-w-sm mx-auto">
      <h1 className="text-xl font-bold mb-4">Edit Child</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex flex-col items-center mb-2">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="relative">
            {avatarPreview ? (
              <img src={avatarPreview} alt="preview" className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm">
                Change photo
              </div>
            )}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="name">Name</label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="grade">Grade</label>
          <select
            id="grade"
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {GRADE_LEVELS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-2 rounded font-medium disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
