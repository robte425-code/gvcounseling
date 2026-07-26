import { PageHero } from "@/components/PageHero";
import { ReferForm } from "@/components/ReferForm";
import { SiteReveal } from "@/components/SiteReveal";

export const metadata = {
  title: "Refer a client",
};

export default function ReferPage() {
  return (
    <>
      <PageHero
        title="Refer a client"
        subtitle="For vocational rehabilitation counselors. Submit one form per client with as much detail as you can so we can begin care promptly."
        compact
      />

      <section className="bg-background">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <SiteReveal>
            <div className="border-b border-border pb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                VRC referral
              </p>
              <p className="mt-3 text-base leading-relaxed text-muted">
                After you acknowledge our scheduling notice, complete the form below. Required
                claim and approval documents help us verify eligibility and schedule without delay.
              </p>
            </div>
          </SiteReveal>
          {/* Keep outside SiteReveal so the warning dialog is not trapped by transform/opacity */}
          <div className="mt-10">
            <ReferForm />
          </div>
        </div>
      </section>
    </>
  );
}
