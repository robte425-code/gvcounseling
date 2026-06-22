import { LegalPageContent } from "@/components/LegalPageContent";

export const metadata = {
  title: "Privacy Statement",
};

const sections = [
  {
    paragraphs: [
      "Grandview Counseling is committed to protecting your privacy and developing technology that gives you the most powerful and safe online experience. This Statement of Privacy applies to the Grandview Counseling Web site and governs data collection and usage. By using the Grandview Counseling website, you consent to the data practices described in this statement.",
    ],
  },
  {
    heading: "Collection of your Personal Information",
    paragraphs: [
      "Grandview Counseling collects personally identifiable information, such as your e-mail address, name, home or work address or telephone number. Grandview Counseling also collects anonymous demographic information, which is not unique to you, such as your ZIP code, age, gender, preferences, interests and favorites.",
      "There is also information about your computer hardware and software that is automatically collected by Grandview Counseling. This information can include: your IP address, browser type, domain names, access times and referring Web site addresses. This information is used by Grandview Counseling for the operation of the service, to maintain quality of the service, and to provide general statistics regarding use of the Grandview Counseling Web site.",
      "Please keep in mind that if you directly disclose personally identifiable information or personally sensitive data through Grandview Counseling public message boards, this information may be collected and used by others. Note: Grandview Counseling does not read any of your private online communications.",
      "Grandview Counseling encourages you to review the privacy statements of Web sites you choose to link to from Grandview Counseling so that you can understand how those Web sites collect, use and share your information. Grandview Counseling is not responsible for the privacy statements or other content on Web sites outside of the Grandview Counseling and Grandview Counseling family of Web sites.",
    ],
  },
  {
    heading: "Use of your Personal Information",
    paragraphs: [
      "Grandview Counseling collects and uses your personal information to operate the Grandview Counseling Web site and deliver the services you have requested. Grandview Counseling also uses your personally identifiable information to inform you of other products or services available from Grandview Counseling and its affiliates. Grandview Counseling may also contact you via surveys to conduct research about your opinion of current services or of potential new services that may be offered.",
      "Grandview Counseling does not sell, rent or lease its customer lists to third parties. Grandview Counseling may, from time to time, contact you on behalf of external business partners about a particular offering that may be of interest to you. In those cases, your unique personally identifiable information (e-mail, name, address, telephone number) is not transferred to the third party. In addition, Grandview Counseling may share data with trusted partners to help us perform statistical analysis, send you email or postal mail, provide customer support, or arrange for deliveries. All such third parties are prohibited from using your personal information except to provide these services to Grandview Counseling, and they are required to maintain the confidentiality of your information.",
      "Grandview Counseling does not use or disclose sensitive personal information, such as race, religion, or political affiliations, without your explicit consent.",
      "Grandview Counseling keeps track of the Web sites and pages our customers visit within Grandview Counseling, in order to determine what Grandview Counseling services are the most popular. This data is used to deliver customized content and advertising within Grandview Counseling to customers whose behavior indicates that they are interested in a particular subject area.",
      "Grandview Counseling Web sites will disclose your personal information, without notice, only if required to do so by law or in the good faith belief that such action is necessary to: (a) conform to the edicts of the law or comply with legal process served on Grandview Counseling or the site; (b) protect and defend the rights or property of Grandview Counseling; and, (c) act under exigent circumstances to protect the personal safety of users of Grandview Counseling, or the public.",
    ],
  },
  {
    heading: "Use of Cookies",
    paragraphs: [
      "The Grandview Counseling Web site use \"cookies\" to help you personalize your online experience. A cookie is a text file that is placed on your hard disk by a Web page server. Cookies cannot be used to run programs or deliver viruses to your computer. Cookies are uniquely assigned to you, and can only be read by a web server in the domain that issued the cookie to you.",
      "One of the primary purposes of cookies is to provide a convenience feature to save you time. The purpose of a cookie is to tell the Web server that you have returned to a specific page. For example, if you personalize Grandview Counseling pages, or register with Grandview Counseling site or services, a cookie helps Grandview Counseling to recall your specific information on subsequent visits. This simplifies the process of recording your personal information, such as billing addresses, shipping addresses, and so on. When you return to the same Grandview Counseling Web site, the information you previously provided can be retrieved, so you can easily use the Grandview Counseling features that you customized.",
      "You have the ability to accept or decline cookies. Most Web browsers automatically accept cookies, but you can usually modify your browser setting to decline cookies if you prefer. If you choose to decline cookies, you may not be able to fully experience the interactive features of the Grandview Counseling services or Web sites you visit.",
    ],
  },
  {
    heading: "Security of your Personal Information",
    paragraphs: [
      "Grandview Counseling secures your personal information from unauthorized access, use or disclosure. Grandview Counseling secures the personally identifiable information you provide on computer servers in a controlled, secure environment, protected from unauthorized access, use or disclosure. When personal information (such as a credit card number) is transmitted to other Web sites, it is protected through the use of encryption, such as the Secure Socket Layer (SSL) protocol.",
    ],
  },
  {
    heading: "Children's Online Privacy Protection Act (COPPA)",
    paragraphs: [
      "This site is not marketed to children under thirteen, nor are our services necessarily applicable to children under thirteen. Grandview Counseling does not knowingly collect personal information from children under the age of thirteen. If you are under the age of thirteen, you must ask a parent or guardian for permission to use this site.",
    ],
  },
  {
    heading: "Changes to this Statement",
    paragraphs: [
      "Grandview Counseling will occasionally update this Statement of Privacy to reflect company and customer feedback. Grandview Counseling encourages you to periodically review this Statement to be informed of how Grandview Counseling is protecting your information.",
    ],
  },
  {
    heading: "Contact Information",
    paragraphs: [
      "Grandview Counseling welcomes your comments regarding this Statement of Privacy. If you believe that Grandview Counseling has not adhered to this Statement, please contact Grandview Counseling at info@gvcounseling.com. We will use commercially reasonable efforts to promptly determine and remedy the problem.",
    ],
  },
];

export default function PrivacyPage() {
  return <LegalPageContent title="Privacy Statement" sections={sections} />;
}
