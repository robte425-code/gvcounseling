import { ContactForm } from "@/components/ContactForm";
import { PageHero } from "@/components/PageHero";
import { SiteReveal } from "@/components/SiteReveal";
import { siteConfig } from "@/lib/site";

export const metadata = {
  title: "Contact us",
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        title="How can we help?"
        subtitle="Reach out by phone, email, or the form below. We respond as promptly as we can."
        compact
      />

      <section className="bg-background">
        <div className="mx-auto grid max-w-6xl gap-14 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-20 lg:px-8 lg:py-24">
          <SiteReveal>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Reach us
            </p>
            <h2 className="mt-3 font-serif text-2xl font-semibold text-primary-dark sm:text-3xl">
              Grandview Counseling
            </h2>
            <address className="mt-8 space-y-1 not-italic text-base leading-relaxed text-muted">
              <p>{siteConfig.address.street}</p>
              <p>{siteConfig.address.suite}</p>
              <p>
                {siteConfig.address.city}, {siteConfig.address.state} {siteConfig.address.zip}
              </p>
            </address>
            <dl className="mt-8 space-y-5">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  Phone
                </dt>
                <dd className="mt-1.5">
                  <a
                    href={siteConfig.phoneHref}
                    className="font-serif text-xl font-semibold text-primary-dark transition hover:text-primary"
                  >
                    {siteConfig.phone}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  Email
                </dt>
                <dd className="mt-1.5">
                  <a
                    href={`mailto:${siteConfig.email}`}
                    className="font-serif text-xl font-semibold text-primary-dark transition hover:text-primary"
                  >
                    {siteConfig.email}
                  </a>
                </dd>
              </div>
            </dl>
          </SiteReveal>

          <SiteReveal delayMs={90}>
            <div className="border-t border-border pt-10 lg:border-l lg:border-t-0 lg:pl-14 lg:pt-0">
              <h2 className="font-serif text-2xl font-semibold text-primary-dark">
                Send a message
              </h2>
              <p className="mt-2 text-sm text-muted">
                Tell us how we can help—whether you are a client, family member, or referring
                counselor.
              </p>
              <div className="mt-8">
                <ContactForm />
              </div>
            </div>
          </SiteReveal>
        </div>
      </section>
    </>
  );
}
