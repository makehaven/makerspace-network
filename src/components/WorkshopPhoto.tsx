const descriptions = {
  woodworking: 'People learning woodworking together around a workbench at MakeHaven',
  quilting: 'A maker guiding a quilt through a longarm sewing machine at MakeHaven',
  welding: 'Makers wearing protective helmets during a welding session at MakeHaven',
  bags: 'A maker showing two handmade fabric bags at MakeHaven',
};

export default function WorkshopPhoto({ photo, priority = false }: { photo: keyof typeof descriptions; priority?: boolean }) {
  return <img src={`/photos/makehaven-${photo}.webp`}
    srcSet={`/photos/makehaven-${photo}-small.webp 600w, /photos/makehaven-${photo}.webp 1200w`}
    sizes="(max-width: 700px) 100vw, 600px" width="1200" height="675"
    alt={descriptions[photo]} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} />;
}
