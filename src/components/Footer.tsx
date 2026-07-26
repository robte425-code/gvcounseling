import Link from "next/link";
import { footerLinks, navLinks, siteConfig } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mt-auto bg-primary-dark text-white">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-serif text-2xl font-semibold tracking-tight">{siteConfig.name}</p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/75">{siteConfig.tagline}</p>
            <p className="mt-6 text-sm text-white/55">{siteConfig.copyright}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Explore</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {navLinks.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-white/85 transition hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Contact</p>
            <ul className="mt-4 space-y-2.5 text-sm text-white/85">
              <li>
                <a href={siteConfig.phoneHref} className="transition hover:text-white">
                  {siteConfig.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${siteConfig.email}`} className="transition hover:text-white">
                  {siteConfig.email}
                </a>
              </li>
              <li className="leading-relaxed">
                {siteConfig.address.street}, {siteConfig.address.suite}
                <br />
                {siteConfig.address.city}, {siteConfig.address.state} {siteConfig.address.zip}
              </li>
            </ul>
          </div>
        </div>

        <nav aria-label="Legal" className="mt-12 border-t border-white/15 pt-6">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/65">
            {footerLinks.map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className="underline-offset-4 transition hover:text-white hover:underline">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
