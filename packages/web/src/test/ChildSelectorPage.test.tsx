import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChildSelectorPage } from '../pages/ChildSelectorPage';

vi.mock('../lib/api', () => ({
  apiClient: { get: vi.fn() },
  setAccessToken: vi.fn(),
}));

import { apiClient } from '../lib/api';

describe('ChildSelectorPage', () => {
  it('renders child cards and Add Child button', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [
        { id: '1', name: 'Alice', gradeLevel: 'P3', avatarUrl: null },
        { id: '2', name: 'Bob', gradeLevel: 'P1', avatarUrl: null },
      ],
    });
    render(
      <MemoryRouter>
        <ChildSelectorPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
    expect(screen.getByText('Add Child')).toBeInTheDocument();
  });

  it('disables Add Child when 5 children exist', async () => {
    const fiveChildren = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      name: `Child ${i}`,
      gradeLevel: 'P1',
      avatarUrl: null,
    }));
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: fiveChildren });

    render(
      <MemoryRouter>
        <ChildSelectorPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('Add Child')).toBeInTheDocument());
    const addLink = screen.getByText('Add Child').closest('a')!;
    expect(addLink).toHaveAttribute('aria-disabled', 'true');
  });
});
