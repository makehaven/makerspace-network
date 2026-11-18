import { useEffect, useRef, useState } from 'react';

/** Replace the current search entry while editing, so Back returns from a
 * detail page to the full search without stepping through every keystroke.
 * Codecs touch only their own keys; region and routing parameters survive. */
export function useUrlFilters<T>(read: (q: URLSearchParams) => T, write: (q: URLSearchParams, value: T) => void) {
  const [value, setValue] = useState(() => read(new URLSearchParams(window.location.search)));
  const current = useRef(value);
  useEffect(() => {
    const restore = () => {
      current.current = read(new URLSearchParams(window.location.search));
      setValue(current.current);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [read]);
  const update = (next: T | ((previous: T) => T)) => {
    const resolved = typeof next === 'function' ? (next as (previous: T) => T)(current.current) : next;
    const url = new URL(window.location.href);
    write(url.searchParams, resolved);
    window.history.replaceState(window.history.state, '', url);
    current.current = resolved;
    setValue(resolved);
  };
  return [value, update] as const;
}

export function setQueryValues(q: URLSearchParams, key: string, values: string[]) {
  q.delete(key);
  for (const value of values) if (value) q.append(key, value);
}
