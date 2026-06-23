import { parseLniAddressesText } from "../src/lib/parse-lni-addresses";
import { parseLniClaimStatusText } from "../src/lib/parse-lni-claim-status";
import { classifyClientDocument } from "../src/lib/client-document-types";
import { resolveImportClaimNumber } from "../src/lib/constants";
import { validateAndRepairClientImport } from "../src/lib/client-import-quality";
import { parseReferralSheetText } from "../src/lib/parse-referral-sheet";
import { parseReferralSubmissionText } from "../src/lib/referral-parser";

const claimStatus = `« Back to previous page
Current claim status
Claim number 	BJ87697 	Injury date 11/13/2022
Worker name 	ADRIANA KEYES
Employer name 	NORTHWEST AMBULANCE
Attending doctor NIJENHUIS ALAINE PAC
S39.012A S39.012A STRAIN MUSCLE FASCIA &
TENDON LOW BACK INITIAL Allowed 11/13/2022
M54.32 M54.32 	L 	SCIATICA LEFT SIDE 	Allowed 11/13/2022`;

const addresses = `Claim Manager
MATTHEW HIDY
360-902-6438 	Phone
Addresses & contacts
Claim number 	BJ87697 	Injury date 11/13/2022
Worker name 	ADRIANA KEYES
Worker mailing address 	Worker residence address
8826 218TH ST SW
EDMONDS, WA 98026-7862
Vocational firm 	Vocational counselor
STRATEGIC CONSULTING SERVICES 	WUTH MONICA P VRC
253-661-5550 	253-661-5550`;

console.log("CAC:", parseLniClaimStatusText(claimStatus));
console.log("Addresses:", parseLniAddressesText(addresses));
console.log("Skip BHI:", classifyClientDocument("AP addressed BHI questionnaire.pdf"));
console.log("Skip medical:", classifyClientDocument("Medical note.pdf"));
console.log("Word docx contact:", classifyClientDocument("Valdovino contact info.docx"));
console.log("Google doc CAC:", classifyClientDocument("Merino-Aviles.Claim & Account Center", "application/vnd.google-apps.document"));

const castellonReferral = `Referral Submission
VRC: Julie Archangeli
VRC Email: julie@duo.vocmail.com
Client name: Jose Castellon
Please enter the LNI claim number: BB92037
NPI: 1699423285
Diagnoses: S46.912A`;

console.log("Castellon referral:", parseReferralSubmissionText(castellonReferral));

const valdovinosSheet = `VR Referral Sheet

Injured Worker Information
Name:
Anabel Valdovinos Marin
Date of birth:
10/16/1985
Address:
1917 N Laventure Rd Apt C3
Mount Vernon, WA 98273-5928
Cell phone:
360-555-1234

Claim Information
Claim no.:
BK03975
Date of injury
07/25/2023
VRC of record:
Sofia E Godinez

Attending Physician
Yvette Esparza ARNP
825 Cleveland Ave
Mount Vernon, WA 98273-4210
Phone: 360-450-5000

Stakeholders
Employer
Skagit Horticulture Llc
14113 River Bend Rd`;

console.log("Valdovinos sheet:", parseReferralSheetText(valdovinosSheet));

const marcelinaClaim = `Worker name   MARCELINA LOPEZ  Employer name  Attending doctor   OHMAN CECILIA ARNP  Claim Manager   CHASE HOLT 360-902-5886`;
console.log("Marcelina employer:", parseLniClaimStatusText(marcelinaClaim).employerName);

const merinoAddresses = `Worker mailing address   Worker residence address  710 ST RTE 821 UNIT 89  YAKIMA, WA 98901-9336  710 ST RTE 821 UNIT 89  YAKIMA, WA 98901-9336  509-750-4427`;
console.log("Merino addresses:", parseLniAddressesText(merinoAddresses));

console.log(
  "Claim resolve (folder wins):",
  resolveImportClaimNumber("BL13687", "BL12687", "BL13687"),
);

const alonsoContacts = `Worker mailing address Worker residence address 1505 S ROAD 40 E TRLR 36 PASCO, WA 99301-6414 509-551-1130 Percent of liability 100 percent Vocational counselor THOMAS NATHAN W VRC 7401 W HOOD PLACE STE 115 KENNEWICK, WA 99336 Attending doctor DECHTER STEPHEN M DO BENTON FRANKLIN ORTHOPEDICO 8200 W GAGE BLVD KENNEWICK, WA 99336 Location Phone: 509-586-2828 Employer name(s) > TSCHIRKY TED Vocational firm`;
console.log("Alonso contacts:", parseLniAddressesText(alonsoContacts));

const badMerge = validateAndRepairClientImport(
  {
    vrcName: "Lisa Larsen",
    vrcEmail: "llarsen@soundvoc.com",
    diagnoses: ["S39.012A"],
    warnings: [],
  },
  {
    employerName: "ATTENDING DOCTOR OHMAN CECILIA ARNP",
    addressLine1: "1505 S ROAD 40 E TRLR 36",
    city: "PASCO",
    state: "WA",
    zip: "99301",
    residenceAddressLine1:
      "1130 PERCENT OF LIABILITY 100 PERCENT VOCATIONAL COUNSELOR THOMAS NATHAN W VRC",
    residenceCity: "KENNEWICK",
    residenceState: "WA",
    residenceZip: "99336",
    attendingDoctorAddress: "8200 W GAGE BLVD, KENNEWICK, WA 99336",
    attendingDoctorPhone: "509-586-2828",
    vrcName: "VOCATIONAL COUNSELOR THOMAS NATHAN W VRC",
    diagnoses: [],
    warnings: [],
  },
  {
    folderClaimNumber: "BL13687",
    documentParts: [
      { filename: "contacts.pdf", supplement: parseLniAddressesText(alonsoContacts) as never },
    ],
  },
);
console.log("Quality repair:", {
  employer: badMerge.supplement?.employerName,
  residence: badMerge.supplement?.residenceAddressLine1,
  doctor: badMerge.supplement?.attendingDoctorName,
  vrc: badMerge.referral.vrcName,
  warnings: badMerge.warnings.filter((w) => w.startsWith("Data quality")),
});
