import { ReferForm } from "@/components/ReferForm";
import { PageHero } from "@/components/PageHero";

export const metadata = {
  title: "Refer a client",
};

export default function ReferPage() {
  return (
    <>
      <PageHero
        title="Refer a client"
        subtitle="This form should be completed by the VRC making the referral. Please provide as much information as possible so that we can provide you with the best possible service. If you have multiple clients, please submit a separate form for each client."
        compact
      />

      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-10">
          <ReferForm />
        </div>
      </section>
    </>
  );
}
