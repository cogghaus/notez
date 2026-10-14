import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TaskItem from './TaskItem';
import type { Task } from '../types';

// Defence in depth: the API only stores http(s) links, but links can now be written by
// API clients and agents, so the UI never turns any other scheme into a clickable href.

function taskWithLinks(urls: string[]): Task {
  return {
    id: 't1', userId: 'u1', title: 'Linked', status: 'PENDING', priority: 'MEDIUM',
    createdAt: '', updatedAt: '', tags: [],
    links: urls.map((url, i) => ({ id: `l${i}`, url, title: `Link ${i}`, createdAt: '' })),
  };
}

function expandLinks() {
  fireEvent.click(screen.getByTitle(/link\(s\)/));
}

describe('TaskItem links', () => {
  it('renders http and https links as anchors', () => {
    render(<TaskItem task={taskWithLinks(['https://example.com/a', 'http://example.com/b'])} />);
    expandLinks();

    expect(screen.getByText('Link 0').closest('a')).toHaveAttribute('href', 'https://example.com/a');
    expect(screen.getByText('Link 1').closest('a')).toHaveAttribute('href', 'http://example.com/b');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'not a url',
  ])('renders %s as text, never as a link', (url) => {
    const { container } = render(<TaskItem task={taskWithLinks([url])} />);
    expandLinks();

    expect(screen.getByText('Link 0')).toBeInTheDocument();
    expect(screen.getByText('Link 0').closest('a')).toBeNull();
    expect(container.querySelector('a[href]')).toBeNull();
  });
});
