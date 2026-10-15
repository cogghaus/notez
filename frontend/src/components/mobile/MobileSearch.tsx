import { useEffect, useRef, useState } from 'react';
import { FileText, History, Loader2, Search, X } from 'lucide-react';
import DOMPurify from 'dompurify';
import { searchApi } from '../../lib/api';
import { consumeSearchFocus } from '../../lib/mobileNav';

interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  folder: { id: string; name: string } | null;
  tags: { id: string; name: string }[];
}

/** What the last finished request said. `query` is the trimmed text it was for. */
type Outcome = { query: string; results: SearchResult[]; failed: false } | { query: string; failed: true };

interface MobileSearchProps {
  onOpenNote: (noteId: string) => void;
}

const RECENT_KEY = 'notez-recent-searches';
const MAX_RECENT = 8;
const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

function loadRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]): void {
  // Storage can be full or blocked (private mode); recents are a convenience, never an error
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

const MUTED = 'text-gray-600 dark:text-gray-400';

/**
 * Search tab (spec 7), notes only until task search lands in PR6. Autofocuses when the tab was
 * opened by a tap, not at app launch. Result rows are buttons named by the note title. One
 * always-mounted live region announces progress and outcome (WCAG 4.1.3).
 */
export function MobileSearch({ onOpenNote }: MobileSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [autoFocus] = useState(consumeSearchFocus);
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const requestRef = useRef(0);
  const focusAfterRef = useRef<'input' | number | null>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const trimmed = query.trim();
  const searchable = trimmed.length >= MIN_CHARS;
  // Derived in render, so "Nothing found" can never flash between typing and the response
  const pending = searchable && outcome?.query !== trimmed;

  useEffect(() => {
    const id = ++requestRef.current;
    if (trimmed.length < MIN_CHARS) {
      setOutcome(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const response = await searchApi.search({ q: trimmed, limit: 20 });
        if (id === requestRef.current) setOutcome({ query: trimmed, results: response.data.results, failed: false });
      } catch {
        if (id === requestRef.current) setOutcome({ query: trimmed, failed: true });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, attempt]);

  // Focus never falls to <body> when the row that had it disappears
  useEffect(() => {
    const target = focusAfterRef.current;
    if (target === null) return;
    focusAfterRef.current = null;
    if (target === 'input') inputRef.current?.focus();
    else document.querySelector<HTMLElement>(`[data-recent-remove="${target}"]`)?.focus();
  }, [recent]);

  const remember = (q: string) => {
    const next = [q, ...recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT);
    setRecent(next);
    saveRecent(next);
  };

  const removeRecent = (q: string, index: number) => {
    const next = recent.filter((r) => r !== q);
    // The next row's remove button takes focus; with no next row, the search box
    focusAfterRef.current = index < next.length ? index : 'input';
    setRecent(next);
    saveRecent(next);
  };

  const clearRecent = () => {
    focusAfterRef.current = 'input';
    setRecent([]);
    saveRecent([]);
  };

  const results = outcome && !outcome.failed ? outcome.results : [];
  const failed = searchable && outcome?.failed === true && outcome.query === trimmed;
  const empty = searchable && !pending && !failed && results.length === 0;
  const showResults = searchable && !failed && results.length > 0;

  let announcement = '';
  if (pending) announcement = 'Searching';
  else if (failed) announcement = 'Search failed';
  else if (empty) announcement = `Nothing found for '${trimmed}'`;
  else if (showResults) announcement = `${results.length} ${results.length === 1 ? 'note' : 'notes'} found`;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (searchable) remember(trimmed);
        }}
        className="flex-shrink-0 p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      >
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 dark:text-gray-400 pointer-events-none"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            name="search-notes"
            aria-label="Search notes"
            placeholder="Search notes"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full min-h-12 pl-10 pr-12 text-base bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-300 border border-gray-400 dark:border-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </form>

      {/* One live region for the whole tab; only its text changes */}
      <div role="status" className="sr-only">
        {announcement}
      </div>

      <div data-scroll-key="search" className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {trimmed.length === 0 && recent.length > 0 && (
          <section aria-labelledby="recent-searches-title">
            <div className="flex items-center justify-between px-4 pt-3">
              <h2
                id="recent-searches-title"
                className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400"
              >
                Recent searches
              </h2>
              <button type="button" onClick={clearRecent} className="min-h-11 px-2 text-sm text-blue-700 dark:text-blue-400">
                Clear all
              </button>
            </div>
            <ul role="list">
              {recent.map((q, index) => (
                <li key={q} className="flex items-center border-b border-gray-100 dark:border-gray-700/60">
                  <button
                    type="button"
                    onClick={() => setQuery(q)}
                    className="flex-1 min-w-0 min-h-12 pl-4 flex items-center gap-3 text-left text-base text-gray-900 dark:text-gray-100"
                  >
                    <History className="w-5 h-5 flex-shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    <span className="min-w-0 break-words">{q}</span>
                  </button>
                  <button
                    type="button"
                    data-recent-remove={index}
                    aria-label={`Remove ${q} from recent searches`}
                    onClick={() => removeRecent(q, index)}
                    className="flex-shrink-0 w-11 h-11 flex items-center justify-center text-gray-500 dark:text-gray-400"
                  >
                    <X className="w-5 h-5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {trimmed.length === 0 && (
          <p className={`px-4 py-6 text-sm text-center ${MUTED}`}>Search titles, content and tags</p>
        )}

        {trimmed.length > 0 && !searchable && (
          <p className={`px-4 py-6 text-sm text-center ${MUTED}`}>Keep typing to search</p>
        )}

        {pending && (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 text-blue-600 dark:text-blue-400 animate-spin mx-auto" aria-hidden="true" />
            <p className={`text-sm mt-2 ${MUTED}`}>Searching...</p>
          </div>
        )}

        {failed && (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-red-700 dark:text-red-400">Search failed. Check your connection and try again.</p>
            <button
              type="button"
              onClick={() => {
                setOutcome(null);
                setAttempt((n) => n + 1);
              }}
              className="mt-3 min-h-11 px-4 rounded-lg border border-gray-500 text-base text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700"
            >
              Retry
            </button>
          </div>
        )}

        {empty && (
          <div className={`px-4 py-6 text-sm text-center ${MUTED}`}>
            <p>Nothing found for &lsquo;{trimmed}&rsquo;</p>
            <p className="mt-1">Try fewer or different words.</p>
          </div>
        )}

        {showResults && (
          <section aria-labelledby="search-results-title" aria-busy={pending}>
            <h2
              id="search-results-title"
              className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400"
            >
              Notes ({results.length})
            </h2>
            <ul role="list">
              {results.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    data-note-id={result.id}
                    onClick={() => {
                      // Open first: a failing store must never get in the way of the note
                      onOpenNote(result.id);
                      remember(trimmed);
                    }}
                    className="w-full min-h-16 px-4 py-3 text-left border-b border-gray-100 dark:border-gray-700/60 active:bg-gray-100 dark:active:bg-gray-700"
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 mt-1 flex-shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <span className="block text-[0.9375rem] leading-5 font-medium text-gray-900 dark:text-white break-words">
                          {result.title}
                        </span>
                        {result.snippet && (
                          <span
                            className="block mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2 [&_mark]:bg-yellow-200 dark:[&_mark]:bg-yellow-900/50 [&_mark]:text-inherit [&_mark]:rounded-sm"
                            dangerouslySetInnerHTML={{
                              __html: DOMPurify.sanitize(result.snippet, {
                                ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'mark'],
                                ALLOWED_ATTR: [],
                              }),
                            }}
                          />
                        )}
                        {(result.folder || result.tags.length > 0) && (
                          <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                            {result.folder && <span>{result.folder.name}</span>}
                            {result.tags.slice(0, 2).map((tag) => (
                              <span
                                key={tag.id}
                                className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                              >
                                {tag.name}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
