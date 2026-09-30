/** Slowly drifting, heavily blurred shapes (pre-rendered radial gradients, see global.css). */
export function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="bg-shape bg-shape-1" />
      <div className="bg-shape bg-shape-2" />
      <div className="bg-shape bg-shape-3" />
    </div>
  );
}
