import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SubmissionResultPage } from '../pages/SubmissionResultPage';

vi.mock('../lib/api', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

import { apiClient } from '../lib/api';

const completedSubmission = {
  id: 'sub-1',
  status: 'completed',
  detectedSubject: 'math',
  imageCount: 1,
  errorMessage: null,
  aiResponse: {
    summary: 'Good work overall',
    totalQuestions: 2,
    correctCount: 1,
    partialCorrectCount: 0,
    wrongCount: 1,
  },
  wrongAnswers: [
    {
      id: 'wa-1',
      questionNumber: 2,
      questionText: '5×3=?',
      childAnswer: '14',
      correctAnswer: '15',
      status: 'wrong',
      explanation: 'Multiplication error',
      topic: 'multiplication',
    },
  ],
};

function renderPage(id = 'sub-1') {
  return render(
    <MemoryRouter initialEntries={[`/submissions/${id}`]}>
      <Routes>
        <Route path="/submissions/:id" element={<SubmissionResultPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SubmissionResultPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows spinner while polling, then renders completed result', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: { ...completedSubmission, status: 'processing' } })
      .mockResolvedValue({ data: completedSubmission });

    renderPage();

    // Initially shows loading, then transitions to spinner once first fetch resolves
    await waitFor(() => {
      expect(screen.getByText(/Analysing homework/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('5×3=?')).toBeInTheDocument();
    }, { timeout: 5000 });

    expect(screen.getByText(/multiplication error/i)).toBeInTheDocument();
  });

  it('shows error state on failed submission', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...completedSubmission, status: 'failed', errorMessage: 'AI timeout', aiResponse: null, wrongAnswers: [] },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Analysis failed/i)).toBeInTheDocument();
    });
    expect(screen.getByText('AI timeout')).toBeInTheDocument();
  });

  it('shows all-correct celebration when no wrong answers', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...completedSubmission, wrongAnswers: [], aiResponse: { ...completedSubmission.aiResponse, wrongCount: 0, correctCount: 2 } },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/All correct/i)).toBeInTheDocument();
    });
  });
});
