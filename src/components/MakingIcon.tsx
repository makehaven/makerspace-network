const paths: Record<string, React.ReactNode> = {
  woodworking: <><path d="m5 28 17-17 9 9-17 17H5zM22 11l4-6 6 1 5 5-6 9M8 31l3-3m1 7 3-3m1-9 3 3m1-7 3 3" /></>,
  metalworking: <><path d="m8 7 7 7-4 4-7-7 1 10 8 4 16 16 8-8-16-16-4-8zM29 33l4 4" /></>,
  textiles: <><circle cx="11" cy="32" r="6"/><circle cx="29" cy="32" r="6"/><path d="m15 27 16-21M25 27 9 6m11 14 3 4" /></>,
  electronics: <><rect x="12" y="12" width="20" height="20" rx="2"/><path d="M17 5v7m10-7v7M17 32v7m10-7v7M5 17h7m-7 10h7m20-10h7m-7 10h7M18 18h8v8h-8z" /></>,
  digital_fabrication: <><path d="M7 34V7h30v27M15 34h14M22 7v7m-5 0h10v6l-5 5-5-5zM5 39h34M22 25v5" /></>,
  craft: <><path d="M11 37c-5-4-2-10 3-11l6 6c-1 5-5 8-9 5zM16 25 30 7c4-4 9 1 5 5L21 30M8 38l-3 1" /></>,
};

export default function MakingIcon({ domain }: { domain: string }) {
  return <svg viewBox="0 0 44 44" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[domain] ?? paths.craft}</svg>;
}

export const MAKING_CATEGORIES = [
  { id: 'woodworking', label: 'Wood' }, { id: 'metalworking', label: 'Metal' },
  { id: 'textiles', label: 'Textiles' }, { id: 'electronics', label: 'Electronics' },
  { id: 'digital_fabrication', label: 'Digital fabrication' }, { id: 'craft', label: 'Art & craft' },
];
