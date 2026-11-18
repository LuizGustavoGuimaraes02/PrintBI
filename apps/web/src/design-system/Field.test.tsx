import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TextField } from './Field';

describe('TextField', () => {
  it('links the label, hint and required state to the input', () => {
    render(<TextField label="Email" hint="We never share it" required />);
    const input = screen.getByLabelText(/email/i);
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription('We never share it');
  });

  it('announces errors and marks the input invalid', () => {
    render(<TextField label="Email" error="Enter a valid email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a valid email');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email');
  });
});
