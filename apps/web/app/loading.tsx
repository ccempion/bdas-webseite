import { BdasLoader } from "../components/BdasLoader";

/** Root App-Router loading UI — the animated brand mark during navigation/boot. */
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bdas-surface">
      <BdasLoader size="lg" />
    </div>
  );
}
