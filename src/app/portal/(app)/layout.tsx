import { PortalNav } from "@/components/portal/PortalNav";

export default function PortalAppLayout({ children }: { children: React.ReactNode }) {
  return <PortalNav>{children}</PortalNav>;
}
