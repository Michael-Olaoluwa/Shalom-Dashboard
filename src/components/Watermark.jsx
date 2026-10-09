// Full-screen, fixed watermark behind every page. Purely decorative, so it is
// hidden from screen readers and ignores all pointer events.
export default function Watermark() {
  return <div className="watermark" aria-hidden="true" />
}