import Image from "next/image";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { SiteReveal } from "@/components/SiteReveal";
import { teamMembers } from "@/lib/site";

export const metadata = {
  title: "Our team",
};

export default function OurTeamPage() {
  return (
    <>
      <PageHero
        title="Our team"
        subtitle="Experienced, compassionate clinicians providing personalized counseling for injured workers—through telehealth across Washington."
        compact
      />

      <section className="bg-background">
        <div className="mx-auto max-w-6xl space-y-24 px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          {teamMembers.map((member, index) => {
            const imageOnRight = index % 2 === 1;

            return (
              <SiteReveal key={member.name}>
                <article
                  className={`grid items-start gap-10 lg:gap-14 ${
                    imageOnRight
                      ? "lg:grid-cols-[1fr_minmax(0,20rem)]"
                      : "lg:grid-cols-[minmax(0,20rem)_1fr]"
                  }`}
                >
                  <div
                    className={`relative w-full max-w-xs ${imageOnRight ? "lg:col-start-2" : ""}`}
                  >
                    <div className="relative aspect-[4/5] overflow-hidden bg-mist">
                      <Image
                        src={member.image}
                        alt={member.name}
                        fill
                        sizes="320px"
                        className="object-cover object-top"
                      />
                    </div>
                    <p className="mt-4 text-sm font-medium tracking-wide text-primary">
                      {member.location}
                    </p>
                  </div>

                  <div className={imageOnRight ? "lg:col-start-1 lg:row-start-1" : ""}>
                    <h2 className="font-serif text-3xl font-semibold tracking-tight text-primary-dark">
                      {member.name}
                      <span className="ml-2 text-xl font-medium text-primary">
                        {member.credentials}
                      </span>
                    </h2>
                    <div className="mt-6 space-y-4 text-base leading-relaxed text-muted">
                      {member.bio.map((paragraph) => (
                        <p key={paragraph.slice(0, 48)}>{paragraph}</p>
                      ))}
                    </div>
                    <blockquote className="mt-8 border-l-2 border-accent pl-5 font-serif text-lg italic leading-relaxed text-ink-soft">
                      &ldquo;{member.quote}&rdquo;
                    </blockquote>
                  </div>
                </article>
              </SiteReveal>
            );
          })}
        </div>
      </section>

      <section className="border-t border-border bg-mist">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-14 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <p className="max-w-xl font-serif text-xl font-semibold text-primary-dark sm:text-2xl">
            Ready to connect a client with care?
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/refer-a-client"
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-dark"
            >
              Refer a client
            </Link>
            <Link
              href="/contact-us"
              className="rounded-md border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-primary-dark transition hover:border-primary/40"
            >
              Contact us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
