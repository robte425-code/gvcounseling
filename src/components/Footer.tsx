import Link from "next/link";
import { footerLinks, siteConfig } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-primary-dark text-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-6 text-center">
          <p className="text-sm text-white/80">{siteConfig.copyright}</p>
          <nav aria-label="Legal">
            <ul className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm">
              {footerLinks.map(({ href, label }, i) => (
                <li key={href} className="flex items-center gap-2">
                  {i > 0 && <span className="text-white/40" aria-hidden="true">|</span>}
                  <Link href={href} className="text-white/90 underline-offset-4 hover:underline">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
