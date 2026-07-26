import Link from "next/link";
import { PageHero } from "@/components/PageHero";

export const metadata = {
  title: "Accessibility",
};

export default function AccessibilityPage() {
  return (
    <>
      <PageHero title="Accessibility" compact />
      <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="space-y-5 text-base leading-relaxed text-muted">
          <p>
            Grandview Counseling is committed to making our website accessible for all, including
            those with disabilities. Please be aware that our efforts are ongoing and include
            improvements to meet WCAG guidelines over time.
          </p>
          <p>
            This site is built with semantic HTML, keyboard navigation support, sufficient color
            contrast, and responsive layouts to support a wide range of devices and assistive
            technologies.
          </p>
          <p>
            If you would like to request accessibility-related assistance, report any accessibility
            issues, or request information in alternative format(s), please contact us using{" "}
            <Link href="/contact-us" className="font-medium text-primary underline-offset-4 hover:underline">
              Grandview Counseling&apos;s Contact page
            </Link>
            .
          </p>
        </div>
      </article>
    </>
  );
}
