import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders with default variant', () => {
    render(<Badge data-testid="default-badge">Default Badge</Badge>);

    const badge = screen.getByTestId('default-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe('Default Badge');
    expect(badge).toHaveClass('inline-flex');
  });

  it('renders with accent variant', () => {
    render(<Badge variant="accent" data-testid="accent-badge">Accent</Badge>);

    const badge = screen.getByTestId('accent-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe('Accent');
    expect(badge).toHaveClass('bg-accent-solid');
  });

  it('renders with destructive variant', () => {
    render(<Badge variant="destructive" data-testid="destructive-badge">Error</Badge>);

    const badge = screen.getByTestId('destructive-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe('Error');
    expect(badge).toHaveClass('bg-error');
  });

  it('renders with custom className', () => {
    render(<Badge className="custom-class" data-testid="custom-badge">Custom</Badge>);

    const badge = screen.getByTestId('custom-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('custom-class');
    expect(badge).toHaveClass('inline-flex'); // Still has base classes
  });

  it('renders with success and warning variants', () => {
    const { rerender } = render(<Badge variant="success" data-testid="status-badge">Success</Badge>);

    let badge = screen.getByTestId('status-badge');
    expect(badge).toHaveClass('bg-success');
    expect(badge.textContent).toBe('Success');

    rerender(<Badge variant="warning" data-testid="status-badge">Warning</Badge>);

    badge = screen.getByTestId('status-badge');
    expect(badge).toHaveClass('bg-warning');
    expect(badge.textContent).toBe('Warning');
  });
});
