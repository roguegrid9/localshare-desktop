import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './input';
import { createRef } from 'react';

describe('Input', () => {
  it('renders with default props', () => {
    render(<Input data-testid="default-input" />);

    const input = screen.getByTestId('default-input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveClass('flex', 'h-10', 'w-full', 'rounded-md');
    expect(input).not.toBeDisabled();
  });

  it('renders with type password', () => {
    render(<Input type="password" data-testid="password-input" />);

    const input = screen.getByTestId('password-input');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('renders with placeholder text', () => {
    render(<Input placeholder="Enter your email" data-testid="placeholder-input" />);

    const input = screen.getByTestId('placeholder-input');
    expect(input).toHaveAttribute('placeholder', 'Enter your email');
    expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument();
  });

  it('renders with disabled state', () => {
    render(<Input disabled data-testid="disabled-input" />);

    const input = screen.getByTestId('disabled-input');
    expect(input).toBeDisabled();
    expect(input).toHaveClass('disabled:cursor-not-allowed', 'disabled:opacity-disabled');
  });

  it('handles ref forwarding and onChange event', async () => {
    const ref = createRef<HTMLInputElement>();
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(<Input ref={ref} onChange={handleChange} data-testid="ref-input" />);

    const input = screen.getByTestId('ref-input');
    expect(ref.current).toBe(input);

    await user.type(input, 'test');
    expect(handleChange).toHaveBeenCalled();
    expect(input).toHaveValue('test');
  });
});
