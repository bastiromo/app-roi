import { LedgerMark } from "@/components/ledger-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <LedgerMark />
          <span className="text-lg font-semibold tracking-tight">App ROI</span>
        </div>
        {children}
      </div>
    </main>
  );
}
