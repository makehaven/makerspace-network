import { useId, useMemo, useRef, useState } from 'react';
import { SPACES } from '../data';
import Logo from '../components/Logo';

/** A searchable list of real spaces, with ordinary keyboard-operable buttons. */
export default function SpacePicker({ value, other, onChange }: {
  value: string | null; other: string; onChange: (id: string | null, other: string) => void;
}) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(!value && !other);
  const [unlisted, setUnlisted] = useState(!!other);
  const changeButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const finish = () => { setEditing(false); requestAnimationFrame(() => changeButton.current?.focus()); };
  const selected = SPACES.find((s) => s.id === value);
  const results = useMemo(() => {
    const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return SPACES.filter((s) => s.status !== 'closed' && terms.every((term) =>
      `${s.name} ${s.address?.locality ?? ''} ${s.address?.region ?? ''}`.toLowerCase().includes(term)));
  }, [search]);
  return <div className="space-picker">
    <p className="field-label" id={`${id}-label`}>Your makerspace <span className="muted">(optional)</span></p>
    {!editing ? <div className="space-selected">
      {selected && <Logo space={selected} />}
      <span><strong>{selected?.name || other || (unlisted ? 'Add your makerspace' : 'No makerspace yet')}</strong>
        {selected?.address?.locality && <small>{selected.address.locality}</small>}</span>
      <button ref={changeButton} type="button" className="linkish" onClick={() => { setEditing(true); requestAnimationFrame(() => searchInput.current?.focus()); }}>Change</button>
    </div> : <>
      <label className="field"><span className="sr-only">Search makerspaces by name or town</span>
        <input ref={searchInput} type="search" autoComplete="off" placeholder="Search by name or town" value={search}
          aria-controls={`${id}-results`} onChange={(e) => setSearch(e.target.value)} /></label>
      <p className="muted picker-count" role="status">{results.length} {results.length === 1 ? 'space' : 'spaces'}{search && ' found'}</p>
      <ul id={`${id}-results`} className="space-results" aria-labelledby={`${id}-label`}>
        {results.map((s) => <li key={s.id}><button type="button" className="space-result" onClick={() => {
          onChange(s.id, ''); finish(); setUnlisted(false); setSearch('');
        }}><Logo space={s} /><span><strong>{s.name}</strong><small>{[s.address?.locality, s.address?.region].filter(Boolean).join(', ') || 'Location not listed'}</small></span>
          {value === s.id && <span aria-label="Selected">✓</span>}</button></li>)}
      </ul>
      {!results.length && <p>No matching space. Try another name or add yours below.</p>}
      <div className="btn-row">
        <button type="button" className="btn ghost" onClick={() => { onChange(null, ''); setUnlisted(false); finish(); }}>No makerspace yet</button>
        <button type="button" className="linkish" onClick={() => { onChange(null, other); setUnlisted(true); finish(); }}>My space isn't listed</button>
      </div>
    </>}
    {unlisted && <label className="field"><span>Space name and town</span>
      <input maxLength={120} value={other} placeholder="Name, town or city" onChange={(e) => onChange(null, e.target.value)} /></label>}
  </div>;
}
