import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { RawMarkdownEditor } from './RawMarkdownEditor';

// Monaco itself loads from a CDN at runtime; the test only needs the theme prop it receives.
vi.mock('@monaco-editor/react', () => ({
  default: (props: { theme?: string }) => <div data-testid="monaco" data-theme={props.theme} />,
}));

let toggle: () => void = () => {};
function ToggleHandle() {
  toggle = useTheme().toggleTheme;
  return null;
}

function renderEditor() {
  return render(
    <ThemeProvider>
      <ToggleHandle />
      <RawMarkdownEditor value="# hi" onChange={() => {}} onMount={() => {}} readOnly={false} />
    </ThemeProvider>,
  );
}

describe('RawMarkdownEditor', () => {
  beforeEach(() => {
    // jsdom has no matchMedia; ThemeProvider subscribes to prefers-color-scheme.
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
    localStorage.clear();
    document.documentElement.classList.remove('light', 'dark');
  });

  it('uses the light Monaco theme in light mode', () => {
    document.documentElement.classList.add('light');
    renderEditor();
    expect(screen.getByTestId('monaco').dataset.theme).toBe('vs-light');
  });

  it('uses the dark Monaco theme in dark mode', () => {
    document.documentElement.classList.add('dark');
    renderEditor();
    expect(screen.getByTestId('monaco').dataset.theme).toBe('vs-dark');
  });

  it('follows a live theme change', () => {
    document.documentElement.classList.add('light');
    renderEditor();
    act(() => toggle());
    expect(screen.getByTestId('monaco').dataset.theme).toBe('vs-dark');
  });
});
