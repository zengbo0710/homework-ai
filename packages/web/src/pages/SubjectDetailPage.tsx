import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { apiClient } from '../lib/api';

interface WrongAnswer {
  id: string;
  questionNumber: number;
  questionText: string;
  childAnswer: string | null;
  correctAnswer: string;
  status: 'wrong' | 'partial_correct';
  explanation: string;
  topic: string | null;
  figureImageUrl: string | null;
  questionImageUrl: string | null;
  pageImageUrl: string | null;
  resolvedAt: string | null;
}

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

const SUBJECT_LABELS: Record<string, string> = {
  math: 'Math', english: 'English', science: 'Science',
  chinese: 'Chinese', higher_chinese: 'Higher Chinese',
};

export function SubjectDetailPage() {
  const { childId, subject } = useParams<{ childId: string; subject: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'active' | 'resolved'>('active');
  const [activeItems, setActiveItems] = useState<WrongAnswer[]>([]);
  const [resolvedItems, setResolvedItems] = useState<WrongAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const [activeRes, resolvedRes] = await Promise.all([
        apiClient.get(`/wrong-answers?childId=${childId}&subject=${subject}&resolved=false&limit=50`),
        apiClient.get(`/wrong-answers?childId=${childId}&subject=${subject}&resolved=true&limit=50`),
      ]);
      setActiveItems(activeRes.data.data);
      setResolvedItems(resolvedRes.data.data);
    } finally {
      setLoading(false);
    }
  }, [childId, subject]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  async function resolve(id: string) {
    setActiveItems((prev) => prev.filter((w) => w.id !== id));
    try {
      await apiClient.patch(`/wrong-answers/${id}/resolve`);
      fetchItems();
    } catch {
      fetchItems();
    }
  }

  async function unresolve(id: string) {
    setResolvedItems((prev) => prev.filter((w) => w.id !== id));
    try {
      await apiClient.patch(`/wrong-answers/${id}/unresolve`);
      fetchItems();
    } catch {
      fetchItems();
    }
  }

  async function handleGeneratePractice() {
    setGenerating(true);
    try {
      const res = await apiClient.post('/practice/generate', {
        childId,
        subject,
        source: tab === 'active' ? 'active' : 'resolved',
        multiplier: 2,
      });
      navigate(`/practice/${res.data.id}`);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 402) {
        alert('Insufficient tokens. Please purchase more tokens.');
      } else if (
        axios.isAxiosError(err) &&
        err.response?.status === 400 &&
        err.response?.data?.error === 'no_wrong_answers'
      ) {
        alert('No wrong answers found for this subject and filter.');
      } else {
        alert('Failed to generate practice. Please try again.');
      }
    } finally {
      setGenerating(false);
    }
  }

  async function remove(id: string) {
    setActiveItems((prev) => prev.filter((w) => w.id !== id));
    setResolvedItems((prev) => prev.filter((w) => w.id !== id));
    try {
      await apiClient.delete(`/wrong-answers/${id}`);
    } catch {
      fetchItems();
    }
  }

  const items = tab === 'active' ? activeItems : resolvedItems;

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="text-indigo-600 text-sm">← Back</button>
        <h1 className="text-xl font-bold">{SUBJECT_LABELS[subject ?? ''] ?? subject}</h1>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('active')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium ${tab === 'active' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          Active ({activeItems.length})
        </button>
        <button
          onClick={() => setTab('resolved')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium ${tab === 'resolved' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          Resolved ({resolvedItems.length})
        </button>
      </div>

      <button
        onClick={() => navigate(`/reports/${childId}/${subject}`)}
        className="w-full py-2 text-sm font-medium bg-purple-600 text-white rounded-lg mb-2"
      >
        View Weakness Report
      </button>

      <button
        onClick={handleGeneratePractice}
        disabled={generating || items.length === 0}
        className="w-full py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg disabled:opacity-50 mb-4"
      >
        {generating ? 'Generating…' : 'Generate Practice'}
      </button>

      {loading && <p className="text-gray-400 text-sm">Loading…</p>}

      {!loading && items.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">No {tab} questions</p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((wa) => (
          <div key={wa.id} className={`border rounded-xl p-4 ${wa.status === 'wrong' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-gray-500">
                Q{wa.questionNumber}{wa.topic ? ` · ${wa.topic}` : ''}
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${wa.status === 'wrong' ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'}`}>
                {wa.status === 'wrong' ? 'Wrong' : 'Partial'}
              </span>
            </div>
            {wa.figureImageUrl && (
              <img
                src={wa.figureImageUrl}
                alt="Figure"
                className="rounded-lg border border-gray-200 w-full object-contain mb-3 max-h-64"
              />
            )}
            {wa.questionImageUrl && (
              <img
                src={wa.questionImageUrl}
                alt="Question"
                className="rounded-lg border border-gray-200 w-full object-contain mb-3 max-h-80"
              />
            )}
            {!wa.figureImageUrl && !wa.questionImageUrl && wa.pageImageUrl && (
              <QuestionImage imageUrl={wa.pageImageUrl} />
            )}

            <p className="text-sm font-medium mb-1">{wa.questionText}</p>
            {wa.childAnswer && <p className="text-sm text-red-700">Answered: {wa.childAnswer}</p>}
            <p className="text-sm text-green-700">Correct: {wa.correctAnswer}</p>
            <p className="text-xs text-gray-600 mt-2 italic">{wa.explanation}</p>
            <div className="flex gap-2 mt-3">
              {tab === 'active' && (
                <button
                  onClick={() => resolve(wa.id)}
                  className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium"
                >
                  Mark Resolved
                </button>
              )}
              {tab === 'resolved' && (
                <button
                  onClick={() => unresolve(wa.id)}
                  className="text-xs bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full font-medium"
                >
                  Unresolve
                </button>
              )}
              <button
                onClick={() => remove(wa.id)}
                className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
