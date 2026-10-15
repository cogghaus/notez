import Editor, { type OnMount } from '@monaco-editor/react';
import { useTheme } from '../contexts/ThemeContext';

export type MonacoEditorInstance = Parameters<OnMount>[0];

interface RawMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onMount: (editor: MonacoEditorInstance) => void;
  readOnly: boolean;
}

/** Raw markdown mode (Monaco). The Monaco theme follows the app theme (mobile spec 9.3, D9). */
export function RawMarkdownEditor({ value, onChange, onMount, readOnly }: RawMarkdownEditorProps) {
  const { theme } = useTheme();
  return (
    <Editor
      height="100%"
      onMount={(editor) => onMount(editor)}
      defaultLanguage="markdown"
      value={value}
      onChange={(next) => onChange(next || '')}
      theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: 'off',
        wordWrap: 'on',
        padding: { top: 16, bottom: 16 },
        scrollBeyondLastLine: false,
        renderLineHighlight: 'none',
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        readOnly,
      }}
    />
  );
}
