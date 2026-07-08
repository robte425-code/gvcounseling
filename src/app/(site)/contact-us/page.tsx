import { ContactForm } from "@/components/ContactForm";
import { PageHero } from "@/components/PageHero";
import { siteConfig } from "@/lib/site";

export const metadata = {
  title: "Contact us",
};

export default function ContactPage() {
  return (
    <>
      <PageHero title="How can we help?" compact />

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="font-serif text-2xl font-semibold text-primary-dark">You can reach us at:</h2>
            <address className="mt-6 space-y-1 not-italic text-base leading-relaxed text-muted">
              <p>{siteConfig.address.street}</p>
              <p>{siteConfig.address.suite}</p>
              <p>
                {siteConfig.address.city}, {siteConfig.address.state} {siteConfig.address.zip}
              </p>
            </address>
            <p className="mt-6 text-base text-muted">
              Phone:{" "}
              <a href={siteConfig.phoneHref} className="font-medium text-primary hover:underline">
                {siteConfig.phone}
              </a>
            </p>
            <p className="mt-2 text-base text-muted">
              Email:{" "}
              <a href={`mailto:${siteConfig.email}`} className="font-medium text-primary hover:underline">
                {siteConfig.email}
              </a>
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-8">
            <h2 className="font-serif text-xl font-semibold text-primary-dark">
              Or send us a message below:
            </h2>
            <div className="mt-6">
              <ContactForm />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
