import { useEffect, useState } from 'react';
import WorkshopPhoto from './WorkshopPhoto';

type Photo = Parameters<typeof WorkshopPhoto>[0]['photo'];

/** A few workshop photos in turn, with a slow cross-fade. It pauses while
 *  pointed at or focused, has dots to choose a photo, and stays still for
 *  anyone whose device asks for reduced motion. */
export default function PhotoSlideshow({ slides, every = 6000 }: { slides: { photo: Photo; caption: string }[]; every?: number }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (paused || still || slides.length < 2) return;
    const t = setTimeout(() => setI((n) => (n + 1) % slides.length), every);
    return () => clearTimeout(t);
  }, [i, paused, still, slides.length, every]);
  return (
    <figure className="workshop-cover slideshow" aria-roledescription="carousel" aria-label="Photos from a makerspace"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="slides">
        {slides.map((s, n) => (
          <div key={s.photo} className={`slide${n === i ? ' on' : ''}`} aria-hidden={n !== i}>
            <WorkshopPhoto photo={s.photo} priority={n === 0} />
          </div>
        ))}
      </div>
      <figcaption aria-live={paused ? 'polite' : 'off'}>{slides[i].caption}</figcaption>
      {slides.length > 1 && <div className="slide-dots">
        {slides.map((s, n) => (
          <button key={s.photo} type="button" aria-label={`Photo ${n + 1} of ${slides.length}: ${s.caption}`}
            aria-current={n === i} onClick={() => setI(n)} />
        ))}
      </div>}
    </figure>
  );
}
