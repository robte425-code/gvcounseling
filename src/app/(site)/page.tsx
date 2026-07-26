import Image from "next/image";
import Link from "next/link";
import { SiteReveal } from "@/components/SiteReveal";
import { homeContent, services, siteConfig, teamMembers } from "@/lib/site";

export default function HomePage() {
  return (
    <>
      {/* Hero: one composition — brand, headline, support, CTAs, full-bleed landscape */}
      <section className="relative isolate min-h-[100svh] overflow-hidden text-white">
        <Image
          src="/images/hero-washington.jpg"
          alt="Mountain landscape under clear sky in the Pacific Northwest"
          fill
          priority
          sizes="100vw"
          className="site-hero-media object-cover object-[center_35%]"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-primary-dark via-primary-dark/70 to-primary-dark/35"
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-primary-dark/80 via-primary-dark/40 to-transparent"
          aria-hidden="true"
        />

        <div className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-end px-4 pb-16 pt-28 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24">
          <div className="site-hero-copy max-w-xl">
            <p className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              {siteConfig.name}
            </p>
            <h1 className="mt-5 max-w-lg font-serif text-2xl font-medium leading-snug text-white/95 sm:text-3xl">
              {homeContent.heroHeadline}
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-white/80 sm:text-lg">
              {homeContent.heroSupport}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/contact-us"
                className="rounded-md bg-accent px-6 py-3 text-sm font-semibold text-primary-dark transition hover:bg-white"
              >
                Contact us
              </Link>
              <Link
                href="/refer-a-client"
                className="rounded-md border border-white/45 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:border-white hover:bg-white/20"
              >
                Refer a client
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Services — editorial, not card grid */}
      <section className="relative overflow-hidden border-b border-border bg-surface">
        <div
          className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-accent/10 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <SiteReveal>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              What we do
            </p>
            <h2 className="mt-3 max-w-2xl font-serif text-3xl font-semibold tracking-tight text-primary-dark sm:text-4xl">
              Care shaped for recovery after workplace injury
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
              {homeContent.servicesIntro}
            </p>
          </SiteReveal>

          <div className="mt-14 divide-y divide-border border-y border-border">
            {services.map((service, index) => (
              <SiteReveal key={service.title} delayMs={index * 80}>
                <article className="grid gap-4 py-10 sm:grid-cols-[7rem_1fr] sm:gap-10">
                  <p className="font-serif text-3xl font-semibold text-accent/90">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <div>
                    <h3 className="font-serif text-2xl font-semibold text-primary-dark">
                      {service.title}
                    </h3>
                    <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
                      {service.description}
                    </p>
                  </div>
                </article>
              </SiteReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Commitment band */}
      <section className="relative overflow-hidden bg-primary-dark text-white">
        <Image
          src="/images/texture-soft-light.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-primary-dark/80" aria-hidden="true" />
        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8 lg:py-24">
          <SiteReveal>
            <p className="font-serif text-2xl font-medium leading-relaxed sm:text-3xl">
              {homeContent.commitment}
            </p>
          </SiteReveal>
        </div>
      </section>

      {/* Team preview */}
      <section className="bg-background">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <SiteReveal>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  Our team
                </p>
                <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-primary-dark sm:text-4xl">
                  Clinicians you can trust
                </h2>
                <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
                  {homeContent.teamIntro}
                </p>
              </div>
              <Link
                href="/our-team"
                className="shrink-0 text-sm font-semibold text-primary underline-offset-4 transition hover:text-primary-dark hover:underline"
              >
                Meet the team
              </Link>
            </div>
          </SiteReveal>

          <div className="mt-12 grid gap-10 md:grid-cols-2">
            {teamMembers.map((member, index) => (
              <SiteReveal key={member.name} delayMs={index * 100}>
                <Link href="/our-team" className="group block">
                  <div className="relative aspect-[4/5] overflow-hidden bg-mist">
                    <Image
                      src={member.image}
                      alt={member.name}
                      fill
                      sizes="(max-width: 768px) 100vw, 40vw"
                      className="object-cover object-top transition duration-700 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="mt-5">
                    <h3 className="font-serif text-xl font-semibold text-primary-dark">
                      {member.name}
                      <span className="ml-2 text-base font-medium text-primary">
                        {member.credentials}
                      </span>
                    </h3>
                    <p className="mt-1 text-sm text-muted">{member.location}</p>
                  </div>
                </Link>
              </SiteReveal>
            ))}
          </div>
        </div>
      </section>

      {/* VRC callout — one job */}
      <section className="border-y border-border bg-mist">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8 lg:py-20">
          <SiteReveal className="max-w-xl">
            <h2 className="font-serif text-2xl font-semibold tracking-tight text-primary-dark sm:text-3xl">
              {homeContent.forVrcsTitle}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted">{homeContent.forVrcsBody}</p>
          </SiteReveal>
          <SiteReveal delayMs={80}>
            <Link
              href="/refer-a-client"
              className="inline-flex rounded-md bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark"
            >
              Start a referral
            </Link>
          </SiteReveal>
        </div>
      </section>

      {/* Contact strip */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:grid-cols-3 sm:px-6 lg:px-8 lg:py-20">
          {[
            { label: "Phone", value: siteConfig.phone, href: siteConfig.phoneHref },
            {
              label: "Email",
              value: siteConfig.email,
              href: `mailto:${siteConfig.email}`,
            },
            {
              label: "Office",
              value: `${siteConfig.address.street}, ${siteConfig.address.suite}`,
              href: undefined as string | undefined,
              detail: `${siteConfig.address.city}, ${siteConfig.address.state} ${siteConfig.address.zip}`,
            },
          ].map((item, index) => (
            <SiteReveal key={item.label} delayMs={index * 70}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                {item.label}
              </p>
              {item.href ? (
                <a
                  href={item.href}
                  className="mt-3 block font-serif text-xl font-semibold text-primary-dark transition hover:text-primary"
                >
                  {item.value}
                </a>
              ) : (
                <>
                  <p className="mt-3 font-serif text-xl font-semibold text-primary-dark">
                    {item.value}
                  </p>
                  {"detail" in item && item.detail ? (
                    <p className="mt-1 text-sm text-muted">{item.detail}</p>
                  ) : null}
                </>
              )}
            </SiteReveal>
          ))}
        </div>
      </section>
    </>
  );
}
