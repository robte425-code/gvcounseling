import { PortalNav } from "@/components/portal/PortalNav";

export default function PortalAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <PortalNav />
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">{children}</div>
    </div>
  );
}
