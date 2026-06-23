import { parseLniAddressesText } from "../src/lib/parse-lni-addresses";
import { parseLniClaimStatusText } from "../src/lib/parse-lni-claim-status";
import { classifyClientDocument } from "../src/lib/client-document-types";

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
console.log("Import CAC:", classifyClientDocument("A. Keyes - Claim Status.pdf"));
