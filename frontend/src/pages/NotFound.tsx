import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="text-5xl">🗺️</div>
      <h1 className="text-2xl font-semibold">Off the map</h1>
      <p className="text-ink/60">That road doesn't exist.</p>
      <Link to="/" className="btn-primary mt-2">Back to the trip</Link>
    </div>
  );
}
