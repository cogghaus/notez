import { useState, useEffect, useRef } from 'react';
import { X, Plus } from 'lucide-react';
import { tagsApi } from '../lib/api';

interface Tag {
  id: string;
  name: string;
}

interface TagInputProps {
  tags: Tag[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}

export function TagInput({ tags, onChange, disabled = false }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load suggestions when input changes
  useEffect(() => {
    const loadSuggestions = async () => {
      if (inputValue.trim().length === 0) {
        setSuggestions([]);
        setShowSuggestions(false);
        setIsLoading(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await tagsApi.search(inputValue, 10);
        const allTags = response.data.tags;

        // Filter out tags that are already added
        const existingTagNames = tags.map((t) => t.name.toLowerCase());
        const filteredTags = allTags.filter(
          (t: Tag) => !existingTagNames.includes(t.name.toLowerCase())
        );

        setSuggestions(filteredTags);
        setShowSuggestions(filteredTags.length > 0 || inputValue.trim().length > 0);
        setSelectedIndex(-1);
      } catch (err) {
        if (import.meta.env.DEV) console.error('Failed to load tag suggestions:', err);
        setError('Failed to load suggestions');
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsLoading(false);
      }
    };

    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new timeout
    debounceTimeoutRef.current = setTimeout(loadSuggestions, 200);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [inputValue, tags]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addTag = (tagName: string) => {
    const trimmedName = tagName.trim();
    if (trimmedName.length === 0) return;

    // Check if tag already exists (case-insensitive)
    const existingTagNames = tags.map((t) => t.name.toLowerCase());
    if (existingTagNames.includes(trimmedName.toLowerCase())) {
      // Don't clear input on duplicate to provide user feedback
      setShowSuggestions(false);
      setSelectedIndex(-1);
      return;
    }

    // Add new tag
    const newTags = [...tags.map((t) => t.name), trimmedName];
    onChange(newTags);
    setInputValue('');
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const removeTag = (tagName: string) => {
    const newTags = tags.filter((t) => t.name !== tagName).map((t) => t.name);
    onChange(newTags);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      if (showSuggestions && selectedIndex >= 0 && selectedIndex < suggestions.length) {
        // Select highlighted suggestion
        addTag(suggestions[selectedIndex].name);
      } else if (showSuggestions && selectedIndex === suggestions.length && inputValue.trim().length > 0) {
        // Create new tag (when "Create" option is highlighted)
        addTag(inputValue);
      } else if (inputValue.trim().length > 0) {
        // Add new tag from input
        addTag(inputValue);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedIndex(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (showSuggestions) {
        // Calculate max index: suggestions + optional "Create new" option
        const hasCreateOption = inputValue.trim().length > 0 &&
          !suggestions.some((s) => s.name.toLowerCase() === inputValue.trim().toLowerCase());
        const maxIndex = hasCreateOption ? suggestions.length : suggestions.length - 1;
        setSelectedIndex((prev) => (prev < maxIndex ? prev + 1 : prev));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      }
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      // Remove last tag when backspace on empty input
      removeTag(tags[tags.length - 1].name);
    }
  };

  return (
    <div className="relative">
      {/* Tag Pills and Input */}
      <div className="flex flex-wrap items-center gap-2 p-2 border border-gray-400 dark:border-gray-500 rounded-md focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 bg-white dark:bg-gray-700">
        {tags.map((tag) => (
          <div
            key={tag.id || tag.name}
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 text-sm rounded-md"
          >
            <span>{tag.name}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => removeTag(tag.name)}
                aria-label={`Remove tag ${tag.name}`}
                className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}

        {!disabled && (
          <div className="flex-1 min-w-[120px]">
            <label htmlFor="tag-input" className="sr-only">
              Add tags
            </label>
            <input
              ref={inputRef}
              id="tag-input"
              name="tag-input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => inputValue.trim().length > 0 && setShowSuggestions(true)}
              placeholder={tags.length === 0 ? 'Add tags...' : ''}
              className="w-full outline-none text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && (
        <div
          ref={suggestionsRef}
          className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-48 overflow-y-auto"
        >
          {isLoading && (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-center">
              Loading suggestions...
            </div>
          )}

          {error && !isLoading && (
            <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400 text-center">
              {error}
            </div>
          )}

          {!isLoading && !error && suggestions.length === 0 && inputValue.trim().length > 0 && (
            <button
              type="button"
              onClick={() => addTag(inputValue)}
              className={`w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                selectedIndex === 0 ? 'bg-blue-50 dark:bg-blue-900/30' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <Plus className="w-3 h-3 text-green-500" />
                <span>
                  Create "<span className="font-medium">{inputValue.trim()}</span>"
                </span>
              </div>
            </button>
          )}

          {!isLoading && !error && suggestions.length > 0 && (
            <>
              {suggestions.map((tag, index) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => addTag(tag.name)}
                  className={`w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    index === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Plus className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                    <span>{tag.name}</span>
                  </div>
                </button>
              ))}

              {/* Option to create new tag if input doesn't match any suggestion */}
              {inputValue.trim().length > 0 &&
                !suggestions.some((s) => s.name.toLowerCase() === inputValue.trim().toLowerCase()) && (
                  <button
                    type="button"
                    onClick={() => addTag(inputValue)}
                    className={`w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700 ${
                      selectedIndex === suggestions.length ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Plus className="w-3 h-3 text-green-500" />
                      <span>
                        Create "<span className="font-medium">{inputValue.trim()}</span>"
                      </span>
                    </div>
                  </button>
                )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
