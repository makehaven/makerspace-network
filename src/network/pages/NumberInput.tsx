// A number box that keeps what the person typed. Parsing every keystroke and
// writing the number back into the box drops a trailing "." and a leading "-",
// so "1.5" became 15, "72.5" became 725 and a "-4200" deficit became a surplus.
// Here the text is the person's; the number is passed on only once the text
// reads as one. Anything that does not is said so under the box, and nothing
// is stored for it until it does.

import { useEffect, useId, useState } from 'react';

const clean = (t: string) => t.replace(/[$,%\s]/g, '');
const parse = (t: string): number | null => {
  const c = clean(t);
  return /^-?(\d+\.?\d*|\.\d+)$/.test(c) ? Number(c) : null;
};
/** On the way to a number: "", "-", "1.", "-0." */
const partial = (t: string) => /^-?\d*\.?$/.test(clean(t));

export interface NumberInputProps {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  /** Allow a negative number, e.g. a surplus that is a deficit. */
  signed?: boolean;
  min?: number;
  max?: number;
  disabled?: boolean;
  id?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

export default function NumberInput({ value, onChange, signed = false, min, max, disabled, id, ...aria }: NumberInputProps) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const errorId = useId();
  // Follow the saved value when it changes from outside (a suggestion accepted,
  // "we don't track this", another year loaded) but not while the person's own
  // text already means that value.
  useEffect(() => {
    if (parse(text) !== (value ?? null) && !(value == null && partial(text))) setText(value == null ? '' : String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = parse(text);
  const lo = signed ? min : Math.max(min ?? 0, 0);
  const problem = text.trim() === '' || (n === null && partial(text)) ? null
    : n === null ? 'Numbers only, like 1200 or 2.5'
    : lo !== undefined && n < lo ? (lo === 0 ? 'Can’t be below zero' : `At least ${lo}`)
    : max !== undefined && n > max ? `No more than ${max}`
    : null;
  const describedBy = [aria['aria-describedby'], problem ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <>
      <input id={id} inputMode="decimal" disabled={disabled} value={text}
             aria-labelledby={aria['aria-labelledby']} aria-describedby={describedBy} aria-invalid={problem ? true : undefined}
             onChange={(e) => {
               const t = e.target.value;
               setText(t);
               const v = parse(t);
               if (t.trim() === '') onChange(null);
               else if (v !== null && !(lo !== undefined && v < lo) && !(max !== undefined && v > max)) onChange(v);
               // Not a number we can use: store nothing rather than the last
               // number that happened to be valid on the way ("15" of "150").
               else if (!partial(t) || v !== null) onChange(null);
             }} />
      {problem && <span id={errorId} className="error num-error" role="alert">{problem}</span>}
    </>
  );
}
