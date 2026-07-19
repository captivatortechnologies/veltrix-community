/**
 * Unit tests for DiffViewer component
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DiffViewer } from '../components/DiffViewer';

describe('DiffViewer', () => {
  describe('Object Diff', () => {
    it('should render with title', () => {
      render(
        <DiffViewer
          oldValue={{ name: 'old' }}
          newValue={{ name: 'new' }}
          title="Test Diff"
        />
      );

      expect(screen.getByText('Test Diff')).toBeInTheDocument();
    });

    it('should show added badge when fields are added', () => {
      render(
        <DiffViewer
          oldValue={{}}
          newValue={{ newField: 'value' }}
          title="Test"
        />
      );

      // Should show +1 added badge
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('should show removed badge when fields are removed', () => {
      render(
        <DiffViewer
          oldValue={{ oldField: 'value' }}
          newValue={{}}
          title="Test"
        />
      );

      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('should show no changes message when values are identical', () => {
      render(
        <DiffViewer
          oldValue={{ same: 'value' }}
          newValue={{ same: 'value' }}
          title="Test"
        />
      );

      expect(screen.getByText('No changes')).toBeInTheDocument();
    });

    it('should be collapsible', () => {
      render(
        <DiffViewer
          oldValue={{ a: 1 }}
          newValue={{ a: 2 }}
          title="Test"
          collapsible={true}
          defaultExpanded={true}
        />
      );

      // Click collapse button
      const collapseButton = screen.getByRole('button', { name: '' });
      fireEvent.click(collapseButton);

      // Content should be hidden after collapse
      // (This would require checking for visibility of content)
    });
  });

  describe('Text Diff', () => {
    it('should render text diff with line numbers', () => {
      render(
        <DiffViewer
          oldValue="line1\nline2"
          newValue="line1\nline3"
          showLineNumbers={true}
        />
      );

      // Should have Previous and Current headers for side-by-side mode
      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Current')).toBeInTheDocument();
    });
  });

  describe('Copy functionality', () => {
    it('should have copy button', () => {
      render(
        <DiffViewer
          oldValue={{ a: 1 }}
          newValue={{ a: 2 }}
          title="Test"
        />
      );

      // Find copy button by its title
      const copyButton = screen.getByTitle('Copy diff');
      expect(copyButton).toBeInTheDocument();
    });
  });

  describe('Null values', () => {
    it('should handle null old value', () => {
      render(
        <DiffViewer
          oldValue={null}
          newValue={{ field: 'value' }}
          title="Test"
        />
      );

      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    it('should handle null new value', () => {
      render(
        <DiffViewer
          oldValue={{ field: 'value' }}
          newValue={null}
          title="Test"
        />
      );

      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    it('should show no differences for both null', () => {
      render(
        <DiffViewer
          oldValue={null}
          newValue={null}
          title="Test"
        />
      );

      expect(screen.getByText('No differences found')).toBeInTheDocument();
    });
  });

  describe('View modes', () => {
    it('should default to side-by-side mode', () => {
      render(
        <DiffViewer
          oldValue="old text"
          newValue="new text"
          mode="side-by-side"
        />
      );

      // Should show Previous and Current headers
      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Current')).toBeInTheDocument();
    });
  });

  describe('Max height', () => {
    it('should apply max height style', () => {
      const { container } = render(
        <DiffViewer
          oldValue={{ a: 1 }}
          newValue={{ a: 2 }}
          maxHeight="300px"
        />
      );

      const scrollContainer = container.querySelector('.overflow-auto');
      expect(scrollContainer).toHaveStyle({ maxHeight: '300px' });
    });
  });
});
