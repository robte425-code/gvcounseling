import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { services, siteConfig } from "@/lib/site";

export default function HomePage() {
  return (
    <>
      <PageHero
        title="Compassionate care for injured workers"
        subtitle="At Grandview Counseling, we provide mental health counseling services to help injured workers overcome the challenges they face with compassion and understanding."
      />

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-serif text-3xl font-semibold text-primary-dark">What we do</h2>
          <p className="mt-4 text-base leading-relaxed text-muted">
            Our offerings include specialized support designed for the unique needs of injured workers
            throughout Washington State.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {services.map((service) => (
            <article
              key={service.title}
              className="rounded-2xl border border-border bg-surface p-8 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <h3 className="font-serif text-xl font-semibold text-primary-dark">{service.title}</h3>
              <p className="mt-3 text-base leading-relaxed text-muted">{service.description}</p>
            </article>
          ))}
        </div>

        <div className="mt-16 rounded-2xl bg-gradient-to-r from-primary/5 to-accent/10 px-8 py-10 text-center">
          <p className="font-serif text-xl leading-relaxed text-primary-dark sm:text-2xl">
            At Grandview Counseling, we&apos;re committed to helping injured workers reclaim their health
            and well-being, every step of the way.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/contact-us"
              className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-primary-dark"
            >
              Contact us
            </Link>
            <Link
              href="/refer-a-client"
              className="rounded-full border border-primary/30 bg-surface px-6 py-3 text-sm font-semibold text-primary transition hover:border-primary hover:bg-primary/5"
            >
              Refer a client
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-surface py-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:grid-cols-3 sm:px-6 lg:px-8">
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
              href: undefined,
            },
          ].map(({ label, value, href }) => (
            <div key={label} className="text-center">
              <p className="text-sm font-medium uppercase tracking-wide text-primary">{label}</p>
              {href ? (
                <a href={href} className="mt-2 block text-base font-medium text-foreground hover:text-primary">
                  {value}
                </a>
              ) : (
                <p className="mt-2 text-base font-medium text-foreground">{value}</p>
              )}
              {label === "Office" && (
                <p className="mt-1 text-sm text-muted">
                  {siteConfig.address.city}, {siteConfig.address.state} {siteConfig.address.zip}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
