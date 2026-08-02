import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyImageToClipboard } from '../lib/copyImageToClipboard';

/**
 * Sanitize image src to prevent javascript: URLs and other unsafe protocols
 */
function sanitizeSrc(src: string | undefined | null): string {
  if (!src || typeof src !== 'string') return '';
  const trimmed = src.trim().toLowerCase();
  // Block dangerous protocols
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:text/html') || trimmed.startsWith('vbscript:')) {
    return '';
  }
  return src;
}

/**
 * Sanitize text attributes (alt, title) - strip any HTML tags
 */
function sanitizeText(text: string | undefined | null): string {
  if (!text || typeof text !== 'string') return '';
  // Remove any HTML tags and trim
  return text.replace(/<[^>]*>/g, '').trim();
}

/**
 * Resizable image component for TipTap editor.
 * Allows users to drag handles to resize images inline.
 */
export function ResizableImage({ node, updateAttributes, selected }: NodeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  // Store cleanup functions for event listeners
  const cleanupRef = useRef<(() => void) | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { src, alt, title, width } = node.attrs;

  // Sanitize attributes to prevent XSS
  const safeSrc = useMemo(() => sanitizeSrc(src), [src]);
  const safeAlt = useMemo(() => sanitizeText(alt), [alt]);
  const safeTitle = useMemo(() => sanitizeText(title), [title]);

  // Calculate aspect ratio when image loads
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setAspectRatio(img.naturalWidth / img.naturalHeight);
    }
  }, []);

  // Unified resize handler for both left and right handles
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, direction: 'left' | 'right') => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);

      const startX = e.clientX;
      const startWidth = containerRef.current?.offsetWidth || 300;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = direction === 'right'
          ? moveEvent.clientX - startX
          : startX - moveEvent.clientX;
        const newWidth = Math.max(100, Math.min(startWidth + deltaX, 1200));
        updateAttributes({ width: Math.round(newWidth) });
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        cleanupRef.current = null;
        setIsResizing(false);
      };

      // Store cleanup function for unmount safety
      cleanupRef.current = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [updateAttributes]
  );

  // Clean up event listeners and timers on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!safeSrc) return;

    const result = await copyImageToClipboard(safeSrc);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    setCopyState(result.ok ? 'copied' : 'error');
    copyTimerRef.current = setTimeout(() => setCopyState('idle'), 2000);
  }, [safeSrc]);

  return (
    <NodeViewWrapper className="resizable-image-wrapper">
      <div
        ref={containerRef}
        className={`resizable-image-container ${selected ? 'selected' : ''} ${isResizing ? 'resizing' : ''}`}
        style={{ width: width ? `${width}px` : 'auto', maxWidth: '100%' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <img
          src={safeSrc}
          alt={safeAlt}
          title={safeTitle || undefined}
          onLoad={handleImageLoad}
          draggable={false}
          style={{
            width: '100%',
            height: aspectRatio && width ? `${width / aspectRatio}px` : 'auto',
          }}
        />

        {/* Image action toolbar - show on hover or select */}
        {(isHovered || selected) && safeSrc && (
          <div className="image-action-toolbar">
            <button
              type="button"
              className={`image-action-btn${copyState === 'error' ? ' image-action-btn--error' : ''}`}
              onClick={handleCopy}
              title={
                copyState === 'copied'
                  ? 'Copied!'
                  : copyState === 'error'
                  ? 'Copy failed'
                  : 'Copy image'
              }
              aria-label="Copy image to clipboard"
            >
              {copyState === 'copied' ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span className="image-action-label">
                {copyState === 'copied' ? 'Copied!' : copyState === 'error' ? 'Failed' : 'Copy'}
              </span>
            </button>
          </div>
        )}

        {/* Resize handles - only show when selected */}
        {selected && (
          <>
            <div
              className="resize-handle resize-handle-left"
              onMouseDown={(e) => handleResizeStart(e, 'left')}
              title="Drag to resize"
            />
            <div
              className="resize-handle resize-handle-right"
              onMouseDown={(e) => handleResizeStart(e, 'right')}
              title="Drag to resize"
            />
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}
