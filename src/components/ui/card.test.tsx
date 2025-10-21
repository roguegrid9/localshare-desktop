import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';

describe('Card Component', () => {
  it('renders Card with default classes', () => {
    render(<Card data-testid="card">Card Content</Card>);
    const card = screen.getByTestId('card');

    expect(card).toBeInTheDocument();
    expect(card).toHaveClass('rounded-md');
    expect(card).toHaveClass('border');
    expect(card).toHaveClass('bg-bg-surface');
  });

  it('renders CardHeader with correct structure', () => {
    render(<CardHeader data-testid="card-header">Header Content</CardHeader>);
    const header = screen.getByTestId('card-header');

    expect(header).toBeInTheDocument();
    expect(header).toHaveClass('flex');
    expect(header).toHaveClass('flex-col');
    expect(header).toHaveClass('p-6');
  });

  it('renders CardTitle as h3 element with correct text', () => {
    render(<CardTitle>Test Title</CardTitle>);
    const title = screen.getByRole('heading', { level: 3 });

    expect(title).toBeInTheDocument();
    expect(title).toHaveTextContent('Test Title');
    expect(title).toHaveClass('text-2xl');
    expect(title).toHaveClass('font-heading');
  });

  it('renders CardContent with children correctly', () => {
    render(
      <CardContent data-testid="card-content">
        <p>Content text</p>
      </CardContent>
    );
    const content = screen.getByTestId('card-content');

    expect(content).toBeInTheDocument();
    expect(content).toHaveClass('p-6');
    expect(content).toHaveClass('pt-0');
    expect(screen.getByText('Content text')).toBeInTheDocument();
  });

  it('renders complete Card composition with all components', () => {
    render(
      <Card data-testid="complete-card">
        <CardHeader>
          <CardTitle>Product Title</CardTitle>
          <CardDescription>Product description goes here</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Main content area</p>
        </CardContent>
        <CardFooter>
          <button>Action Button</button>
        </CardFooter>
      </Card>
    );

    const card = screen.getByTestId('complete-card');
    const title = screen.getByRole('heading', { level: 3, name: /product title/i });
    const description = screen.getByText(/product description/i);
    const content = screen.getByText(/main content area/i);
    const button = screen.getByRole('button', { name: /action button/i });

    expect(card).toBeInTheDocument();
    expect(title).toBeInTheDocument();
    expect(description).toBeInTheDocument();
    expect(content).toBeInTheDocument();
    expect(button).toBeInTheDocument();
  });
});
