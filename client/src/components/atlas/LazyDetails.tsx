import React, { useEffect, useState, type ComponentProps, type ReactNode } from 'react';

type LazyDetailsProps = Omit<ComponentProps<'details'>, 'children'> & {
  summary: ReactNode;
  children: ReactNode | (() => ReactNode);
  defaultOpen?: boolean;
};

/** Native keyboard-accessible disclosure; closed evidence does not mount its subtree. */
export function LazyDetails({ summary, children, open, defaultOpen = false, onToggle, ...attributes }: LazyDetailsProps) {
  const [expanded, setExpanded] = useState(open ?? defaultOpen);
  useEffect(() => {
    if (open !== undefined) setExpanded(open);
  }, [open]);

  return <details {...attributes} open={expanded} onToggle={event => {
    // Nested disclosure events must not change this boundary's state.
    if (event.target !== event.currentTarget) return;
    setExpanded(event.currentTarget.open);
    onToggle?.(event);
  }}>
    <summary>{summary}</summary>
    {expanded ? (typeof children === 'function' ? children() : children) : null}
  </details>;
}
