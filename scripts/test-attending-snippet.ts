import { parseAttendingDoctorName, parseLniCacText } from "../src/lib/parse-lni-cac-fields";

const snippet = `
Attending doctor
LENSON TINA
NORTH END MEDICAL PROFESSIONAL
825 CLEVELAND AVE
MOUNT VERNON, WA 98273-4210
Billing Phone:
Location Phone: 360-450-5000
`;

const parsed = parseLniCacText(snippet, { warn: false });
console.log("parseAttendingDoctorName:", parseAttendingDoctorName(snippet));
console.log("parseLniCacText:", parsed.attendingDoctorName);
