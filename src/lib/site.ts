export const siteConfig = {
  name: "Grandview Counseling",
  tagline: "Compassionate mental health counseling for injured workers",
  phone: "866-547-2638",
  phoneHref: "tel:+18665472638",
  email: "info@gvcounseling.com",
  address: {
    street: "5608 17th Ave NW",
    suite: "Suite 596",
    city: "Seattle",
    state: "WA",
    zip: "98107",
  },
  copyright: `Copyright 2023 - ${new Date().getFullYear()} Grandview Counseling℠`,
};

export const navLinks = [
  { href: "/", label: "What we do" },
  { href: "/our-team", label: "Our team" },
  { href: "/contact-us", label: "Contact us" },
  { href: "/refer-a-client", label: "Refer a client" },
] as const;

export const footerLinks = [
  { href: "/privacy-page", label: "Privacy Statement" },
  { href: "/terms-of-use", label: "Terms of use" },
  { href: "/accessibility", label: "Accessibility" },
] as const;

export const services = [
  {
    title: "Behavioral Health Intervention Sessions",
    description:
      "These sessions are crafted to address the psychological aspects of injury and recovery, providing strategies and support for overcoming the challenges faced by injured workers.",
  },
  {
    title: "Mental health conditions related to workplace injuries",
    description:
      "We recognize the profound impact that work-related injuries can have on mental health. Our targeted treatments are specifically designed to address mental health conditions that arise as a direct consequence of workplace injuries, ensuring a holistic approach to healing and rehabilitation.",
  },
];

export const teamMembers = [
  {
    name: "Maria Belen Castro",
    credentials: "LMHC",
    location: "Pasco, WA",
    image: "/images/maria-castro.jpeg",
    bio: [
      "Maria has over 10 years of counseling experience and is bilingual in both English and Spanish. She attended Eastern Washington University, MSW, and graduated in 2013. She specializes in anxiety, depression and relationship issues. She is seeing clients primarily through telehealth.",
      "Maria is the daughter of immigrant parents, who were migrant workers. She was born and raised in Washington State. She is passionate about seeing people thrive in their lives and offers a framework to help injured workers through education, promoting self-awareness, and developing confidence and resiliency.",
    ],
    quote:
      "My counseling style is strengths-based and person centered, which means I see you as the expert of your life. I partner with you through your healing journey towards joy and freedom. I believe in treating you with respect, sensitivity, inclusivity and compassion. My therapy approach combines cognitive-behavioral therapy and solution focused therapy to accomplish your therapy goals. I tailor therapy to meet your unique and specific needs.",
  },
  {
    name: "Steven Sample",
    credentials: "LICSW",
    location: "Spokane, WA",
    image: "/images/steven-sample.jpg",
    bio: [
      "Steven earned a Master's degree in Social Work from Sacramento State in 2003 and has many years of experience working with individuals and families across all stages of life, in both private and public mental health settings. He helps clients recognize how physical pain, anxiety, or depression may be impacting their lives and supports them in gaining back control.",
      "Steven has extensive experience working with individuals who have experienced trauma and has supported many in working through and resolving significant roadblocks. He brings an empathetic and collaborative approach to therapy, helping clients overcome challenges, achieve their goals, and celebrate their progress.",
      "Steven is a licensed Independent Clinical Social Worker in both Washington and Idaho, as well as a licensed Substance Use Professional in Washington.",
    ],
    quote:
      "I use a variety of modalities and approaches including but not limited to Cognitive Behavioral therapy, Motivational interviewing and narrative therapy. I would be honored to work with you in changing qualities of your specific needs and assist you in overcoming obstacles.",
  },
];
