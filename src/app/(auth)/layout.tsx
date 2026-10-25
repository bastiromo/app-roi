import { LedgerMark } from "@/components/ledger-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="rise w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3 px-1">
          <LedgerMark size={34} />
          <span className="text-lg font-semibold tracking-tight">App ROI</span>
        </div>
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-card md:p-7">{children}</div>
      </div>
    </main>
  );
}
