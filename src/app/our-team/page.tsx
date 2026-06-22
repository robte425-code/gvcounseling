import Image from "next/image";
import { PageHero } from "@/components/PageHero";
import { teamMembers } from "@/lib/site";

export const metadata = {
  title: "Our team",
};

export default function OurTeamPage() {
  return (
    <>
      <PageHero
        title="Our Team"
        subtitle="Our dedicated team of experienced and compassionate mental health professionals is committed to providing personalized counseling services tailored to your unique needs. Whether you're facing stress, anxiety, depression, or other mental health concerns, we offer a safe and supportive space where you can explore your thoughts and emotions."
        compact
      />

      <section className="mx-auto max-w-6xl space-y-20 px-4 py-16 sm:px-6 lg:px-8">
        {teamMembers.map((member, index) => (
          <article
            key={member.name}
            className={`grid items-start gap-10 lg:grid-cols-[280px_1fr] ${
              index % 2 === 1 ? "lg:grid-flow-dense" : ""
            }`}
          >
            <div className={`relative ${index % 2 === 1 ? "lg:col-start-2" : ""}`}>
              <div className="overflow-hidden rounded-2xl shadow-lg ring-1 ring-border">
                <Image
                  src={member.image}
                  alt={member.name}
                  width={320}
                  height={400}
                  className="aspect-[4/5] w-full object-cover"
                />
              </div>
              <p className="mt-3 text-center text-sm font-medium text-primary">{member.location}</p>
            </div>

            <div className={index % 2 === 1 ? "lg:col-start-1 lg:row-start-1" : ""}>
              <h2 className="font-serif text-2xl font-semibold text-primary-dark sm:text-3xl">
                {member.name}
                <span className="ml-2 text-primary">{member.credentials}</span>
              </h2>
              <div className="mt-5 space-y-4 text-base leading-relaxed text-muted">
                {member.bio.map((paragraph) => (
                  <p key={paragraph.slice(0, 40)}>{paragraph}</p>
                ))}
              </div>
              <blockquote className="mt-6 border-l-4 border-accent pl-5 italic text-foreground/90">
                &ldquo;{member.quote}&rdquo;
              </blockquote>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
