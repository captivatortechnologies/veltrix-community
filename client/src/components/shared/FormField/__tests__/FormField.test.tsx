import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import FormField from '../FormField';

describe('FormField', () => {
  it('renders the label associated with the control via htmlFor', () => {
    render(
      <FormField label="Allowed IP ranges" htmlFor="cidrs">
        <textarea id="cidrs" />
      </FormField>,
    );

    expect(screen.getByLabelText('Allowed IP ranges')).toBeInTheDocument();
  });

  it('renders a required marker without adding it to the accessible label text', () => {
    render(
      <FormField label="Name" htmlFor="name" required>
        <input id="name" />
      </FormField>,
    );

    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('renders the error message with role="alert" and hides the hint', () => {
    render(
      <FormField label="Name" htmlFor="name" hint="Pick something memorable" error="Name is required">
        <input id="name" />
      </FormField>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Name is required');
    expect(screen.queryByText('Pick something memorable')).not.toBeInTheDocument();
  });

  it('renders the hint when there is no error', () => {
    render(
      <FormField label="Name" htmlFor="name" hint="Pick something memorable">
        <input id="name" />
      </FormField>,
    );

    expect(screen.getByText('Pick something memorable')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders without a label', () => {
    render(
      <FormField>
        <input aria-label="Unlabeled control" />
      </FormField>,
    );

    expect(screen.getByLabelText('Unlabeled control')).toBeInTheDocument();
  });
});
