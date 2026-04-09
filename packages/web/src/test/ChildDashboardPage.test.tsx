import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChildDashboardPage } from '../pages/ChildDashboardPage';

describe('ChildDashboardPage', () => {
  it('renders all 5 subject blocks', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/child-1']}>
        <Routes>
          <Route path="/dashboard/:childId" element={<ChildDashboardPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /math/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /english/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /science/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chinese' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /higher chinese/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scan homework/i })).toBeInTheDocument();
  });
});
