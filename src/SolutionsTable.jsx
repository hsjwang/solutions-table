import React, { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   Solutions Table — a shared board for the Security Cards
   Solutions dimension.

   ROLES
     Facilitator  claims the role with a code (or open with
                  #facilitator in the URL). One per session.
     Player       joins a team, draws, places, buys, justifies.

   SYNC
     Shared key-value storage, polled every 4s.
       game:config    written only by the facilitator
       game:team:<n>  written only by that team
     Per-team keys keep concurrent writes from clobbering each
     other. Last-write-wins still applies within a single team.

   NOTE ON THE ORIGINAL DECK
     The four original dimensions ship with the card titles that
     appear in our own published figures. The full University of
     Washington deck is copyright its authors and is not
     reproduced here — a facilitator can type the official titles
     into Setup before a session.
   ============================================================ */

const THEMES = {
  /* Every foreground below clears WCAG AA (4.5:1) against both surface colours
     in its own theme. The originals failed on five of nine. */
  dark: {
    name:"dark",
    slate:"#161B22", panel:"#1E252E", edge:"#3A4653", ink:"#1A1F26",
    paper:"#F6F4EF", muted:"#A8B4C2",
    impact:"#6294BF", motive:"#E08A3C", resource:"#D1766F",
    method:"#5F976A", solution:"#9A83BC", brass:"#D9B45B",
    ok:"#5F976A", warn:"#D1766F",
    onAccent:"#12171D",
  },
  light: {
    name:"light",
    slate:"#FBFAF7", panel:"#F0EEE8", edge:"#C6C2B8", ink:"#FBFAF7",
    paper:"#1A1F26", muted:"#5A6270",
    impact:"#3870A0", motive:"#955C28", resource:"#B64238",
    method:"#407249", solution:"#765AA0", brass:"#7B6634",
    ok:"#407249", warn:"#B64238",
    onAccent:"#FFFFFF",
  },
};
let ACTIVE = THEMES.dark;
/* Read through a proxy so the several hundred existing C.x lookups keep working
   without touching each one. */
const C = new Proxy({}, { get: (_t, k) => ACTIVE[k] });/* ?condition=control seeds the control arm when a facilitator first claims a
   session. It is stored in the session, not read per client, so a student
   cannot switch arms by editing their URL. */
const URL_CONDITION = (()=>{
  try{ return new URLSearchParams(window.location.search).get("condition")==="control"
    ? "control" : null; }catch{ return null; }
})();

const BUILD = "2026-10-30.safeguards";

const MONO = "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, monospace";
const SANS = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

const SOLUTIONS = [
  [1,"Software Updates",1,"F","CIS 7 (7.1, 7.3, 7.4)"],
  [2,"Social Engineering Awareness",1,"F","CIS 14 (14.1–14.6)"],
  [3,"Deepfake & AI Fraud Awareness",1,"F","CIS 14 (14.2, 14.9)"],
  [4,"Identity & Access Management",1,"F","CIS 6 (6.1, 6.2, 6.7)"],
  [5,"Password & Authentication",1,"F","CIS 5, 6 (5.2, 6.3–6.5)"],
  [6,"Backup & Recovery",1,"F","CIS 11 (11.1–11.5)"],
  [7,"Account Lifecycle Management",1,"F","CIS 5 (5.1, 5.3, 5.5)"],
  [8,"Physical Security",1,"F","No dedicated control"],
  [9,"Asset Inventory",1,"F","CIS 1 (1.1, 1.2)"],
  [10,"Software Inventory",1,"F","CIS 2 (2.1–2.3)"],
  [11,"Secure Configuration",1,"F","CIS 4 (4.1, 4.2, 4.6, 4.7)"],
  [12,"Email & Browser Protections",1,"F","CIS 9 (9.1, 9.2, 9.4–9.6)"],
  [13,"Incident Response Planning",1,"F","CIS 17 (17.1–17.4)"],
  [14,"Encryption",2,"E","CIS 3 (3.6, 3.10, 3.11)"],
  [15,"Audit Logging & SIEM",2,"E","CIS 8, 13 (8.2, 8.9, 13.1)"],
  [16,"Endpoint Detection & Response",2,"E","CIS 10, 13 (10.1, 10.7)"],
  [17,"Third-Party & Contractual",2,"E","CIS 15 (15.1, 15.4)"],
  [18,"Network Segmentation",2,"E","CIS 12, 13 (12.2, 13.4)"],
  [19,"Penetration Testing",3,"A","CIS 18 (18.1–18.3, 18.5)"],
  [20,"Managed Detection & Response",3,"A","CIS 8, 13, 17"],
  [21,"Cyber Insurance & Risk Transfer",3,"A","Risk transfer"],
].map(([id,name,cost,tier,ctrl])=>({id,name,cost,tier,ctrl}));

/* Expansion deck. Off unless the facilitator switches it on, so the 21-card
   base deck — the study instrument — never changes underneath a session.
   Each card fills a gap the practitioner scenarios exposed: CIS 16 had no card
   at all, data protection was only Encryption, privileged access was folded
   into Identity & Access Management, and nothing covered screen lock, remote
   wipe or work data on phones (CIS 4.3, 4.10–4.12). Ids continue after the
   modifiers; 36 and 37 are expansion modifiers, so the last control is 38. */
const EXP_SOLUTIONS = [
  [29,"Application & Pipeline Security",2,"E","CIS 16 (16.1, 16.4, 16.12)"],
  [30,"Data Inventory & Loss Prevention",2,"E","CIS 3 (3.1–3.3, 3.13)"],
  [31,"Privileged Access Management",2,"E","CIS 5, 6 (5.4, 6.5, 6.8)"],
  [32,"Vulnerability Scanning",2,"E","CIS 7 (7.5–7.7)"],
  [33,"Incident Response Exercises",1,"F","CIS 17 (17.7, 17.8)"],
  [34,"Application Allowlisting",2,"E","CIS 2 (2.5–2.7)"],
  [35,"Zero Trust Remote Access",3,"A","CIS 12, 13 (12.7, 13.5)"],
  [38,"Mobile & Endpoint Device Management",2,"E","CIS 3, 4 (3.6, 4.3, 4.10–4.12)"],
].map(([id,name,cost,tier,ctrl])=>({id,name,cost,tier,ctrl,exp:true}));

/* Safeguard pool, on top of the expansion. Single CIS safeguards that no
   control card lists, chosen because a scenario turns on them — so a team can
   never buy the same defense twice under two names. Each costs 1 and refines a
   parent control: it can only be bought while the team owns, or is buying this
   round, one of `parents`. An organization does not review logs it does not
   collect. Keys score these as partial unless the threat turns on that exact
   safeguard, so a row of cheap safeguards cannot outscore a real control. */
const SAFEGUARDS = [
  [39,"Audit Log Retention","8.10",[15],"Keep audit logs for at least 90 days."],
  [40,"Audit Log Review","8.11",[15,20],"Someone reviews the logs, weekly or better, for anomalies."],
  [41,"Network Flow Logging","13.6",[15,18],"Record which devices talked to which, and how much."],
  [42,"Port-Level Access Control","13.9",[18],"Devices must authenticate before a network port lets them on (802.1X)."],
  [43,"Network Infrastructure Updates","12.1",[1],"Routers, firewalls and VPN appliances run supported, current firmware."],
  [44,"Secure Network Device Management","12.3",[11],"Management interfaces off the internet, defaults changed, UPnP off."],
  [45,"Dedicated Admin Workstations","12.8",[31,4],"Administration happens only from machines used for nothing else."],
  [46,"Remove Unnecessary Services","4.8",[11],"Debug modes, remote tools and open ports nobody needs are switched off."],
  [47,"Data Retention","3.4",[30,14],"Data is deleted when it is no longer needed, on a written schedule."],
  [48,"Service Provider Assessment","15.5",[17],"Providers are assessed (SOC 2, questionnaires) before and during the contract."],
  [49,"Service Provider Offboarding","15.7",[17],"When a provider leaves, accounts, keys and data come back or are destroyed."],
  [50,"Incident Communication Plan","17.6",[13],"Who tells whom, through which channel, during an incident."],
  [51,"Incident Severity Thresholds","17.9",[13],"Written thresholds for what counts as an incident and who is woken up."],
  [52,"Third-Party Component Updates","16.5",[29],"Dependencies are current, pinned and from trusted sources."],
].map(([id,name,sg,parents,blurb])=>({id,name,cost:1,tier:"S",ctrl:`CIS ${sg}`,sg,parents,blurb,safeguard:true}));
const SAFEGUARD_DEAL = 4;
const isControl = (id) => SOLUTIONS.some(c=>c.id===id) || EXP_SOLUTIONS.some(c=>c.id===id);

/* Where a beginner can read the control before buying it. One public page per
   CIS Control (all checked 2026-10-30); the two cards with no dedicated control
   point at a government explainer instead. Links open in a new tab, so a team
   loses nothing on the board by following one. */
const CIS_PAGES = [null,
  ["inventory-and-control-of-enterprise-assets","Inventory and Control of Enterprise Assets"],
  ["inventory-and-control-of-software-assets","Inventory and Control of Software Assets"],
  ["data-protection","Data Protection"],
  ["secure-configuration-of-enterprise-assets-and-software","Secure Configuration of Enterprise Assets and Software"],
  ["account-management","Account Management"],
  ["access-control-management","Access Control Management"],
  ["continuous-vulnerability-management","Continuous Vulnerability Management"],
  ["audit-log-management","Audit Log Management"],
  ["email-and-web-browser-protections","Email and Web Browser Protections"],
  ["malware-defenses","Malware Defenses"],
  ["data-recovery","Data Recovery"],
  ["network-infrastructure-management","Network Infrastructure Management"],
  ["network-monitoring-and-defense","Network Monitoring and Defense"],
  ["security-awareness-and-skills-training","Security Awareness and Skills Training"],
  ["service-provider-management","Service Provider Management"],
  ["application-software-security","Application Software Security"],
  ["incident-response-management","Incident Response Management"],
  ["penetration-testing","Penetration Testing"],
];
const OTHER_LINKS = {
  8:[{label:"CISA · Physical security", title:"No CIS Control covers this; CISA's overview instead",
      href:"https://www.cisa.gov/topics/physical-security"}],
  21:[{label:"NIST · Cyber insurance", title:"No CIS Control covers this; NIST's small-business guide instead",
      href:"https://www.nist.gov/itl/smallbusinesscyber/guidance-topic/cyber-insurance"}],
};
const cardLinks = (c) => {
  if (OTHER_LINKS[c.id]) return OTHER_LINKS[c.id];
  const m = /^CIS ([\d, ]+)/.exec(c.ctrl||"");
  if (!m) return [];
  return m[1].split(",").map(s=>Number(s.trim())).filter(n=>CIS_PAGES[n]).map(n=>({
    label:`CIS ${n}`, title:`CIS Control ${n}: ${CIS_PAGES[n][1]}`,
    href:`https://www.cisecurity.org/controls/${CIS_PAGES[n][0]}`}));
};

/* Each modifier needs three different things said about it. `demand` is the
   one-line rule, short enough for a card face and for the facilitator's
   adjudication queue. `ask` is the question a student actually answers, in
   plain language. `frame` is a sentence skeleton, not a model answer — a
   worked answer in the box gets copied; a skeleton has to be filled in. */
const MODIFIERS = [
  [22,"Defense in Depth",
   "Two purchases that fail in different ways.",
   "Name two things you bought where, if the first one fails, the second still catches the attack. They have to fail for different reasons — two locks on the same door is one control bought twice.",
   "We bought ______ and ______. The first stops it by ______. If that fails, the second still ______."],

  [23,"Fail Safe Defaults",
   "What happens the moment a control stops working.",
   "Pick one thing you bought. If it broke right now — power cut, licence expired, server down — does the organization end up locked or wide open? A badge reader that unlocks every door when the power fails is protecting nobody.",
   "If ______ stopped working, then ______. That leaves us ______ , and we would change it by ______."],

  [24,"Least Privilege",
   "One access you would cut, and what breaks.",
   "Everyone should have the least access that still lets them do their job. Name one person in this scenario who has more than that, say what you would take away, and say what they would no longer be able to do.",
   "______ can currently ______. We would remove ______. They would lose ______, which matters because ______."],

  [25,"Human Factors",
   "A purchase staff will work around, and how.",
   "A control people find unworkable gets bypassed, and a bypassed control protects nothing. Name one thing you bought that staff will get around, say exactly how they will do it, and say what you would do instead.",
   "Staff will get around ______ by ______, because ______. Instead we would ______."],

  [26,"Risk Acceptance",
   "A named risk, and the person who owns it. Played instead of a purchase.",
   "Sometimes the right answer is to decide, on purpose and in writing, not to fix something. Name the risk you are accepting, say why that is reasonable here, and name the person in the organization who owns that decision. A risk nobody owns has not been accepted — it has been ignored.",
   "We accept ______ because ______. ______ owns this decision and will revisit it in ______."],

  [27,"Compensating Control",
   "What you cannot afford, and what the substitute misses.",
   "When you cannot afford the right answer, you do something cheaper that covers part of the same ground — and you tell the client what it does not cover. Name all three.",
   "We cannot afford ______. Instead we will ______. That does not cover ______, and we would tell the client so."],

  [28,"Deferred Investment",
   "Cap spend at 4, bank 2. Name the exposure and its duration.",
   "You are underspending now so the organization can afford something bigger next year. Name what it is exposed to while it waits, and for how long. This is borrowing against next year's budget, and the interest is paid in risk.",
   "We are deferring so we can afford ______ next engagement. Meanwhile we are exposed to ______ for about ______."],
].map(([id,name,demand,ask,frame])=>({id,name,demand,ask,frame,cost:0}));

/* Expansion modifiers. Both are claims practitioners make daily and students
   rarely hear named. */
const EXP_MODIFIERS = [
  [36,"Separation of Duties",
   "One task one person can do alone, and the second person it should need.",
   "Some actions are too consequential for one person to complete alone, however trusted. Name one thing a single person in this organization can do end to end today, say who the second person should be, and say what that costs in speed.",
   "Today ______ can ______ alone. It should also need ______, which slows ______ by about ______."],

  [37,"Shared Responsibility",
   "A control the provider owns, and how you would know it is working.",
   "Every cloud service or outsourced function splits the work: some controls are the provider's, some stay yours. Name one control in this scenario that belongs to a provider, name the one next to it that is still yours, and say what evidence would tell you the provider's half is actually being done.",
   "______ is the provider's job; ______ is still ours. We would know theirs is working because ______."],
].map(([id,name,demand,ask,frame])=>({id,name,demand,ask,frame,cost:0,exp:true}));


/* ---- Scenario library. Mirrors Appendix C of the facilitator manual.
   Expert keys are shown to the facilitator only, never to players.

   `env` is the technical brief, shown to teams only when the facilitator sets
   the detail level to Technical. Practitioners at BSides PNW found the prose
   alone too thin to argue a purchase from. Every line was written against the
   existing expert key: it adds evidence for the strong and partial cards and
   names no control that the key scores as off, so the keys are unchanged.

   `inject` is the delayed threat that lands on top of this one when the
   facilitator advances to the next engagement with delayed threats on.
   `pro` marks scenarios written for practitioner audiences. ---- */
const SCENARIOS = [
  {id:1, care:false, budget:6, title:"Payroll Redirection",
   env:["Email is Google Workspace for Nonprofits on harborviewfb.org. SPF is published, DKIM was never turned on, and DMARC is p=none with no reporting address.",
        "The request came from harborview-fb.org, registered nine days earlier, with the treasurer's display name. No external-sender banner is configured.",
        "The payroll provider lets the bookkeeper change bank details with her password alone; the confirmation link goes to the same inbox the attacker is writing to.",
        "The voicemail came from a spoofed caller ID. The treasurer's voice is on a recorded fundraising webinar posted publicly last spring.",
        "The bookkeeper works on her personal Windows 11 laptop, which saves the payroll password in the browser.",
        "There is no written callback rule for payment changes, and the treasurer answers email only on weekdays.",
        "No account has MFA except the bank portal, which uses SMS codes."],
   inject:{title:"The Donation Platform Payout",
     text:"Three weeks later the donation platform's payout account changes to a bank nobody recognizes. The login is the one four volunteers share; its password turns up in an infostealer log alongside one volunteer's home computer name.",
     draw:{method:"Technological Attack",impact:"Financial Wellbeing",resource:"Technical Expertise",motive:"Personal Gain"},
     strong:[5,7], partial:[9,15],
     why:{5:"a shared password with no second factor is what the infostealer log was worth", 7:"one login per person, removed when they leave, ends the sharing", 9:"the home computer was never an organization asset, and nobody knew it held the password", 15:"the payout change would show in a log someone reviewed"}},
   org:"Harborview Food Bank — 3 staff, 40 volunteers, no IT",
   target:"Severity is who gets harmed, not how clever the attack was. The strongest control here is free and procedural.",
   text:"Harborview Food Bank has three paid staff and about forty volunteers. The bookkeeper works two days a week from home. Last Tuesday she received an email that appeared to come from the board treasurer, in his usual phrasing, asking her to update the payroll provider's bank details before Friday's run. A follow-up voicemail in his voice confirmed it. Friday's payroll is eighteen thousand dollars, roughly a month of operating cash.",
   draw:{method:"Manipulation or Coercion",impact:"Financial Wellbeing",resource:"Artificial Intelligence",motive:"Personal Gain"},
   strong:[2,3,12], partial:[5,13], weak:[14,18,19],
   standing:[{id:1, text:"Four volunteers share one login for the donation platform.", pos:{l:2,s:1}, cards:[5,7]}, {id:2, text:"Nobody has a list of which laptops belong to the organization.", pos:{l:1,s:1}, cards:[9,10]}],
   why:{2:"the bookkeeper is the control that failed; training is what changes her response", 3:"the confirming voicemail was cloned, which is exactly what this card names", 12:"DNS filtering can refuse the lookalike domain before anyone reads the message", 5:"MFA does not stop a redirected payment, but limits what the stolen password reaches", 13:"does not prevent it; decides who is called once the money has left"},
   debrief:["The attack was technically trivial. Most teams still place it as Very Severe. What makes it severe, and would it be severe at a larger organization?",
            "Nobody can buy a callback rule. Which purchase would you trade for one sentence in a written procedure?",
            "The voice on the phone was cloned. Does awareness training still work when familiarity stops being evidence?"]},

  {id:2, care:false, budget:6, title:"Ransomware",
   env:["One on-premises Windows Server 2012 R2 machine (out of support since October 2023) runs the domain, the file shares and the scheduling database.",
        "On Friday afternoon a front-desk workstation opened an emailed 'fax' that was an ISO image containing a shortcut file. Microsoft 365 Business Basic filtering let it through.",
        "Eleven Windows 10 workstations run Defender only; on three of them signatures are seventy days old. Every user is a local administrator.",
        "The backup is a USB drive attached to the server, written nightly by a scheduled script through a mapped drive letter. It was encrypted along with everything else.",
        "The electronic health record is cloud-hosted and still works. Scheduling, billing exports and scanned referrals were on the local server.",
        "The IT contractor works business hours only. Nobody at the clinic knows whether there is an after-hours number.",
        "The clinic has no cyber insurance policy and no incident response retainer."],
   inject:{title:"The Leak Site",
     text:"Ten days after the encryption, the gang posts a sample of scanned referrals on its leak site and gives the clinic a week before it publishes the rest. Some referrals include behavioural health notes.",
     draw:{method:"Multi-phase Attack",impact:"Emotional Wellbeing",resource:"Money",motive:"Personal Gain"},
     strong:[13,21], partial:[15,18],
     why:{13:"notification, regulators and what to tell patients are decisions a plan makes in advance", 21:"breach coaches and notification costs are what a policy actually buys", 15:"you cannot say what left without a record of what was touched", 18:"a file server that workstations cannot reach wholesale limits what can be taken"}},
   org:"Cedar Ridge Health Clinic — 2 providers, 900 patients",
   target:"Once it has happened, prevention cards are worth nothing and recovery cards are worth everything.",
   text:"Cedar Ridge is a two-provider clinic serving about nine hundred patients in a county with no other primary care. On Monday morning the front desk cannot open the scheduling system. Every file on the shared drive has a new extension, and a text file on the desktop asks for payment in cryptocurrency. The practice manager thinks there is a backup, but it is on a drive plugged into the same server, and nobody has ever restored from it.",
   draw:{method:"Technological Attack",impact:"Physical Wellbeing",resource:"Money",motive:"Personal Gain"},
   strong:[6,13,16], partial:[1,12,21], weak:[19],
   standing:[{id:1, text:"The scheduling software has not been updated in two years.", pos:{l:2,s:2}, cards:[1,10]}, {id:2, text:"Nobody has checked whether the anti-malware is still running.", pos:{l:1,s:2}, cards:[16,9]}],
   why:{6:"an isolated copy is the only thing that gets the scheduling system back", 13:"decides who is called on Monday morning instead of improvising", 16:"behaviour-based detection can isolate a machine mid-encryption", 1:"closes the hole it probably came through, but not after it has happened", 12:"most ransomware arrives by mail; this reduces the chance, not the damage", 21:"covers recovery cost; restores no patient record"},
   debrief:["The backup existed and was useless. What is the difference between having a backup and having a recovery?",
            "Impact is Physical Wellbeing, not Financial. What does a clinic without scheduling do to a patient?",
            "The attack has already happened — it is Monday morning and the files are encrypted. If everything you bought was meant to stop it happening, what do you actually do today?"]},

  {id:3, care:true, budget:6, title:"A Laptop Leaves the Building",
   env:["The laptop is a donated Windows 11 Home machine. It signs in with a local account and a six-digit PIN, so device encryption was never switched on.",
        "It had been asleep, not shut down, when it was taken. There is no auto-lock policy.",
        "Intake records live in a SharePoint list on a donated Microsoft 365 tenant. Any staff member can export the list to Excel, and downloads are allowed on any device.",
        "No device is managed. Nothing can be located or wiped remotely, and nobody recorded serial numbers.",
        "The bag was on the back seat in plain view for about twenty minutes.",
        "Several families hold protection orders. Staff believe at least two abusers are actively looking for them."],
   inject:{title:"The Call to the Front Desk",
     text:"A week after the theft, someone calls the front desk claiming to be a school counsellor and asks, by name, whether one of the children is still staying at Wilder House. The caller knows the child's date of birth.",
     draw:{method:"Manipulation or Coercion",impact:"Physical Wellbeing",resource:"Entitlement",motive:"Desire or Obsession"},
     strong:[2,13], partial:[4],
     why:{2:"the front desk is the control now; a script for refusing to confirm residence is what protects the child", 13:"a caller who already knows a date of birth means the disclosure is being used, and someone must decide what happens next", 4:"fewer people able to see who is in residence means fewer people a caller can work on"}},
   org:"Wilder House — a twelve-bed shelter",
   target:"When Human Impact is physical safety, ordinary controls carry stakes students have not attached to them before.",
   text:"Wilder House is a twelve-bed shelter. A caseworker's laptop was taken from her car in a grocery store parking lot on Saturday. It holds an offline copy of the intake spreadsheet: names, dates of birth, the schools children attend, and current addresses for eleven families. The laptop has a login password. Nothing else.",
   draw:{method:"Physical Attack",impact:"Physical Wellbeing",resource:"Entitlement",motive:"Curiosity"},
   strong:[14,8,4], partial:[9,13], weak:[15,18],
   standing:[{id:1, text:"Staff use personal phones for client contact.", pos:{l:2,s:2}, cards:[4,14]}, {id:2, text:"The room holding paper intake files is left unlocked.", pos:{l:1,s:2}, cards:[8]}],
   why:{14:"full-disk encryption turns a disclosure into a lost piece of hardware", 8:"the laptop was taken from a car; this is about where devices are kept", 4:"an offline copy existed because nobody controlled who could export it", 9:"you cannot say what was on a laptop nobody had listed", 13:"eleven families must be told; this decides who does that, and how fast"},
   debrief:["A login password and full-disk encryption feel similar to a non-specialist. What is the actual difference to whoever has the laptop now?",
            "The spreadsheet was a convenience copy. Which control stops one existing, and what does the caseworker lose when it does?",
            "Who has to be told, how quickly, and what do you say to eleven families?"]},

  {id:4, care:false, budget:5, title:"The Volunteer Who Left in 2021",
   env:["The hosted donation platform has seven administrator logins. The director can name four of the people behind them.",
        "The former volunteer's login holds the owner role, the only role that can remove other administrators or change the payout bank account.",
        "Her login uses her personal Gmail address, so password resets go to her. Two-factor sign-in is available and switched off.",
        "The platform keeps an audit log for ninety days. It shows a sign-in from a residential address in another state two days before the test transaction. Nobody has opened it.",
        "The trust also uses Google Workspace, an email newsletter service, online bookkeeping and a WordPress site. Nobody keeps a list of them, and they are billed to three different cards.",
        "There is no offboarding checklist. Whoever is asked adds a new volunteer."],
   inject:{title:"The Website Defaced",
     text:"The trust's WordPress site starts showing a fake listing selling one of its protected parcels for development. The only administrator account belongs to the volunteer who built the site and left, and a plugin on it has not been updated in three years.",
     draw:{method:"Technological Attack",impact:"Relationships",resource:"Technical Expertise",motive:"Politics"},
     strong:[7,1], partial:[10,6],
     why:{7:"the builder's administrator account should have been handed over and closed", 1:"an unpatched plugin is the usual way into a WordPress site", 10:"nobody knew which plugins were installed, so nobody knew one was abandoned", 6:"a clean copy of the site is what gets the real listing back"}},
   org:"Fairmount Land Trust — 2 staff, rotating volunteers",
   target:"The strongest answer is the least interesting card in the deck. Teams overlook it and buy something exciting.",
   text:"Fairmount Land Trust has two staff and a rotating pool of volunteers. A volunteer who managed the donation platform in 2021 moved out of state and stopped responding. Last month a two-hundred-dollar test transaction appeared, then reversed. The executive director does not know how many people still have logins, and the platform bills annually to a credit card nobody can locate the statement for.",
   draw:{method:"Processes",impact:"Financial Wellbeing",resource:"Entitlement",motive:"Personal Gain"},
   strong:[7,4], partial:[9,10,15], weak:[2],
   standing:[{id:1, text:"The website was built by a volunteer who has since left.", pos:{l:1,s:1}, cards:[10,17]}, {id:2, text:"Nobody has opened the backup system in over a year.", pos:{l:1,s:2}, cards:[6]}],
   why:{7:"the volunteer's login should have been disabled the week she left", 4:"a documented grant-and-revoke process is what makes that happen reliably", 9:"you cannot revoke access to a platform nobody has listed", 10:"the donation platform is unmanaged software nobody owns", 15:"the two-hundred-dollar test would have shown in a log someone read"},
   debrief:["Nobody attacked this organization — a door was left open. Is that a security incident?",
            "The right answer costs one point and takes an afternoon. Why is it the one nobody does?",
            "How would this organization even produce a list of who has access?"]},

  {id:5, care:false, budget:10, title:"The Vendor's Breach",
   env:["The routing platform is SaaS. Each night it receives a full roster export from the student information system: names, home addresses, guardian phone numbers, and transport flags drawn from IEPs.",
        "The 2023 contract is the vendor's click-through terms. There is no breach-notification window, no right to audit, no data-deletion clause, and no SOC 2 report was ever requested.",
        "About forty education apps receive roster data, many through an automated rostering sync. Nobody can produce the list.",
        "The vendor's status page says it is investigating a security incident affecting a subset of customers.",
        "State law requires the district to notify parents of a student-data breach. There is no template, and the superintendent is the only authorised spokesperson.",
        "The district is in a state risk pool whose cyber rider requires notice within seventy-two hours of discovery."],
   inject:{title:"The Texts to Parents",
     text:"Two weeks later, parents start receiving texts that appear to come from the district transportation office, asking them to confirm their child's new bus stop at a link. The texts use the child's name and current stop.",
     draw:{method:"Manipulation or Coercion",impact:"Relationships",resource:"Entitlement",motive:"Personal Gain"},
     strong:[13,2], partial:[12],
     why:{13:"the district has to warn parents faster than the texts spread, which means a plan for who says what and through which channel", 2:"parents and staff are the targets now; telling them what the district will never ask for is the control", 12:"filtering helps staff, not parents on their own phones"}},
   org:"Northbridge School District — four rural schools",
   target:"Nothing you buy internally helps. The only real control was written a year earlier in a contract.",
   text:"Northbridge is a rural district of four schools. Their bus routing and student scheduling run on a hosted platform used by two hundred districts. On Thursday a reporter calls the superintendent for comment on a breach at that vendor. The district has had no notification. The vendor's support line has a recorded message. The data includes student names, home addresses, and bus stop times.",
   draw:{method:"Indirect Attack",impact:"Relationships",resource:"Technical Expertise",motive:"Personal Gain"},
   strong:[17,13], partial:[9,21], weak:[1,11,16,18],
   standing:[{id:1, text:"Nobody has a list of the cloud services the district uses.", pos:{l:2,s:1}, cards:[17,9]}, {id:2, text:"Teacher accounts stay active after they leave.", pos:{l:2,s:1}, cards:[7]}],
   why:{17:"the only control that existed here was a contract clause written a year earlier", 13:"the superintendent heard from a reporter; this decides who speaks and when", 9:"extended to data: knowing which outside services hold student records", 21:"transfers part of a cost the district did not cause"},
   debrief:["Half your deck is useless here. What does that say about where a small organization's real risk lives?",
            "The superintendent learned from a reporter. What clause would have changed that, and when would it have had to be written?",
            "Bus stop times plus home addresses. Which Human Impact card is this really?"]},

  {id:6, care:false, budget:10, title:"Debug Mode in Production",
   env:["The public site is a Django 2.2 application (end of life April 2022) on a single Ubuntu 18.04 virtual machine at a regional host.",
        "DEBUG is True in production. Any error page prints the settings file, including the database password, the secret key and an SMS provider API key.",
        "A ?view=admin parameter skips the login decorator. The contractor added it for testing and never removed it.",
        "The post notice button publishes to the homepage and sends an SMS alert to about 6,200 enrolled residents.",
        "Card payments are handed off to a third-party processor. The site itself stores account numbers, service addresses and last payment amounts.",
        "No staff member has server access. The contractor holds the only SSH key, and the hosting account is in his name."],
   inject:{title:"The Contractor's Credentials",
     text:"Before the fix ships, a threat-intelligence feed shows the former contractor's email password and hosting-panel session cookie for sale in an infostealer log. The hosting account is still in his name.",
     draw:{method:"Indirect Attack",impact:"Relationships",resource:"Money",motive:"Politics"},
     strong:[17,7], partial:[5,15],
     why:{17:"ownership of the hosting account was never transferred; that is a handover the contract should have required", 7:"his access should have been revoked when the engagement ended", 5:"a second factor on the hosting panel would make a stolen password worth less, though not a stolen session", 15:"logins to the hosting panel from somewhere new would at least be seen"}},
   org:"Millbrook Water Authority — 11,000 residents",
   target:"A one-point Foundational card beats every expensive option. Teams with ten points overspend here.",
   text:"Millbrook Water Authority serves eleven thousand residents. Their public site posts water quality reports and lets residents pay bills. A contractor built it four years ago and moved on. A resident emails to say that adding a parameter to a URL shows an administrative page listing every account and a button labelled post notice. The page has no login.",
   draw:{method:"Processes",impact:"Relationships",resource:"Technical Expertise",motive:"Politics"},
   strong:[11,4], partial:[19,10,17], weak:[2,6],
   standing:[{id:1, text:"The office network and the control network are the same network.", pos:{l:1,s:2}, cards:[18]}, {id:2, text:"The public site runs on a server nobody patches.", pos:{l:2,s:1}, cards:[1,10]}],
   why:{11:"debug mode left on in production is a configuration failure, precisely this card", 4:"an administrative page with no login is an access-control failure too", 19:"would have found it, at three points and a year late", 10:"nobody knew what the contractor left running", 17:"the contractor built it and walked away with no handover"},
   debrief:["You had ten points and the fix costs one. What did the rest buy you?",
            "Penetration testing would have found it. Was it worth three points here, and what would have to be true first?",
            "A utility can post public notices. What is the worst version of this that does not involve stealing anything?"]},

  {id:7, care:true, budget:10, title:"The Trusted Paralegal",
   env:["Case management is a cloud legal practice platform on its entry tier. Every staff role can open every matter. Matter-level permissions exist and have never been used.",
        "On this tier the platform keeps document-view history for thirty days. The filing in question was drafted six weeks ago.",
        "Email is Microsoft 365 Business Standard. Audit logging is on, but nobody holds the role needed to search it, and nothing alerts.",
        "Staff: nine attorneys, four paralegals, two intake workers. This paralegal works immigration matters, not this client's housing case.",
        "She signed a confidentiality agreement at hire in 2019. There is no annual re-acknowledgement, and the handbook says nothing about relationships with opposing parties.",
        "There is no IT staff. A managed service provider fixes laptops when they break and does no monitoring."],
   inject:{title:"Files in a Personal Inbox",
     text:"A staff attorney's personal webmail account is taken over through a reused password. Its sent folder holds two years of client files she forwarded to herself to work from home, including asylum declarations.",
     draw:{method:"Indirect Attack",impact:"Emotional Wellbeing",resource:"Technical Expertise",motive:"Personal Gain"},
     strong:[12,14], partial:[4,2],
     why:{12:"blocking auto-forwarding and uploads to personal mail is the control that stops files leaving this way", 14:"files encrypted to the organization are unreadable in a stranger's inbox", 4:"if she could not export whole matters, the inbox would hold less", 2:"she believed working from home this way was diligence, not risk"}},
   org:"Eastgate Legal Aid — housing and immigration",
   target:"Every preventive control fails, because the access was authorized. Detection is the only lever left.",
   text:"Eastgate Legal Aid handles housing and immigration matters. A paralegal of six years has legitimate access to the case system. A client reports that her landlord seems to know the contents of a filing that has not been served. The paralegal and the landlord attend the same church. There is no evidence of an intrusion, and nothing in the system is broken.",
   draw:{method:"Processes",impact:"Emotional Wellbeing",resource:"Entitlement",motive:"Desire or Obsession"},
   strong:[15,4,20], partial:[13,17], weak:[12,14,1],
   standing:[{id:1, text:"Staff email client files to personal accounts to work at home.", pos:{l:2,s:2}, cards:[12,14]}, {id:2, text:"Two former staff still have building keys.", pos:{l:1,s:1}, cards:[8,7]}],
   why:{15:"who opened which file, and when, is the only answerable question here", 4:"case files readable by all staff is the access decision that allowed this", 20:"someone actually reviewing those logs, which this office cannot staff", 13:"a client has been harmed; this decides how that is handled", 17:"employment and confidentiality terms are the other lever available"},
   debrief:["Which of your purchases would have stopped this? If none, what do you tell the client you can offer instead?",
            "Logging tells you afterward. Is a control that only works afterward worth two of ten points?",
            "Least Privilege has a cost not measured in points. What does the paralegal lose, and is the trade right?"]},

  {id:8, care:false, budget:6, title:"The Camera Nobody Remembered",
   env:["One consumer router serves a single 192.168.1.0/24 network. Public wifi, staff PCs, the circulation desk, self-checkout and the cameras are all on it. The router cannot do VLANs.",
        "The cameras are budget IP models running 2017 firmware with the factory administrator account. UPnP is on, and the router has opened port forwards to them by itself.",
        "The 3 a.m. traffic is outbound TCP to random addresses on ports 23 and 2323, the pattern of a Mirai-style botnet scanning for more devices.",
        "The cameras record to a video recorder under the reference desk. Nobody knows its password.",
        "The circulation desk PC stays signed in to the hosted library system all day, shared by every shift.",
        "The county contractor's firewall logs are the only visibility, kept for fourteen days."],
   inject:{title:"Ransomware at the Circulation Desk",
     text:"A month later the circulation desk PC and the self-checkout kiosks are encrypted overnight. The intrusion is traced to the same flat network, entered this time through a patron laptop on the public wifi.",
     draw:{method:"Multi-phase Attack",impact:"Relationships",resource:"Technical Expertise",motive:"Personal Gain"},
     strong:[18,6], partial:[16,13],
     why:{18:"patron wifi that cannot reach the circulation desk ends this attack path", 6:"a restorable image of the desk PC and kiosks is what reopens the library", 16:"behaviour-based detection on the desk PC could stop encryption partway through", 13:"the library needs to know who calls whom at eight at night"}},
   org:"Delridge Public Library",
   target:"Asset inventory is a precondition for everything else. Teams cannot defend what they have not enumerated.",
   text:"Delridge Public Library has public wifi, twenty patron computers, a self-checkout system, and four security cameras installed by a since-dissolved vendor in 2016. The county IT contractor reports that traffic is leaving the library network at three in the morning, and traces it to a device nobody on staff can identify. The network is flat: everything is on the same wifi, including the circulation desk.",
   draw:{method:"Technological Attack",impact:"Relationships",resource:"Technical Expertise",motive:"Curiosity"},
   strong:[9,18,11], partial:[10,15], weak:[2,6],
   standing:[{id:1, text:"The public wifi password has not changed since 2019.", pos:{l:2,s:0}, cards:[5,11]}, {id:2, text:"Nobody knows who to call if something goes wrong at eight at night.", pos:{l:1,s:1}, cards:[13]}],
   why:{9:"the device is unidentifiable because nothing lists what is on the network", 18:"a camera on its own segment cannot reach the circulation desk", 11:"2016 default credentials are almost certainly how it was taken", 10:"firmware nobody has updated in a decade", 15:"traffic at three in the morning was noticed once; logging makes that routine"},
   debrief:["At six points, segmentation may be out of reach. What do you buy first, and what do you tell the board about the rest?",
            "The camera has been there a decade. Which control would have caught it in year one, and what does it cost?",
            "Patron borrowing records are legally protected in many states. Does that change your ranking?"]},

  {id:9, care:false, budget:6, title:"What the Grant Paid For",
   env:["The donor database is a vendor CRM on Windows Server 2012 R2 with SQL Server 2012. The vendor ended support in March 2022. It holds about 5,800 donor records with addresses and giving history.",
        "The server sits in the office closet. A router port-forward exposes its web-based donor portal to the internet.",
        "Backups are a SQL Server maintenance plan writing .bak files to the same server's D: drive. Nothing is copied elsewhere.",
        "The migration quote is $4,000 to move to a hosted nonprofit CRM. The next board meeting is ten weeks away.",
        "There is no IT staff. The office manager is the administrator by default."],
   inject:{title:"The Portal Gets Found",
     text:"An internet-wide scanner indexes the donor portal and its version banner. Within days, a public exploit for that CRM version is used against it, and donor records appear on a paste site.",
     draw:{method:"Technological Attack",impact:"Financial Wellbeing",resource:"Technical Expertise",motive:"Curiosity"},
     strong:[18,10], partial:[15,11],
     why:{18:"an unsupported system that cannot be reached from the internet cannot be scanned", 10:"knowing the version was unsupported is what should have closed the port-forward", 15:"you cannot tell donors what was taken without a record", 11:"a version banner and an exposed portal are configuration choices"}},
   org:"Ridgeway Arts Collective — campaign play",
   target:"Built for multi-engagement play. The right move is often to defer, and the card that lets you defer makes the cost visible.",
   text:"Ridgeway Arts received a technology grant in 2019 that paid for a donor database, a website, and a year of support. The grant ended. The database runs a version the vendor stopped patching in 2022. Migrating costs about four thousand dollars the collective does not have. The board meets quarterly. Nothing has gone wrong yet.",
   draw:{method:"Technological Attack",impact:"Financial Wellbeing",resource:"Technical Expertise",motive:"Personal Gain"},
   strong:[10,28,6], partial:[18,27,26], weak:[1],
   standing:[{id:1, text:"Donor data is exported to a spreadsheet on a personal laptop.", pos:{l:2,s:2}, cards:[14,4]}, {id:2, text:"There is no backup of the website.", pos:{l:1,s:1}, cards:[6]}],
   why:{10:"knowing the version stopped being supported in 2022 is the whole finding", 28:"the migration costs four thousand dollars they do not have; this names the wait", 6:"if the unsupported database fails, this is what gets the donors back", 18:"isolate the unsupported system so it cannot reach anything else", 27:"what you do instead when the right fix is unaffordable", 26:"deciding in writing to live with it, with a named owner"},
   debrief:["If anyone bought Software Updates: what does patching achieve once the vendor has stopped shipping patches?",
            "If you deferred, name the exposure and say for how long. Would you put that in writing to the board?",
            "Revisit this later and drift the threat. Was deferring still the right call?"]},

  {id:10, care:false, budget:10, title:"Donor Records in a Shared Mailbox",
   env:["The mailbox is a licensed Microsoft 365 user rather than a true shared mailbox, so it has one password and six people know it. Security defaults are off.",
        "Sign-in logs show successful logins from two other countries over the past ten days. An inbox rule moves any reply containing 'donation' to the RSS Feeds folder.",
        "The appeals were sent from a lookalike domain using the stolen contact list. A handful also went out from the real mailbox.",
        "The mailbox holds four years of correspondence, including 212 scanned cheques with routing and account numbers.",
        "Twenty-three volunteers have known the password since 2021. It has never been changed.",
        "The rescue has general liability cover only. Under state law, names together with bank account numbers trigger breach notification."],
   inject:{title:"The Cloned Donation Page",
     text:"Using the donor list, someone builds a copy of the rescue's donation page on a lookalike domain and emails supporters about an emergency surgery fund. Donors start calling to ask why their receipts look different.",
     draw:{method:"Manipulation or Coercion",impact:"Financial Wellbeing",resource:"Money",motive:"Personal Gain"},
     strong:[12,13], partial:[2],
     why:{12:"lookalike-domain monitoring and a published DMARC policy make the clone harder to pass off", 13:"donors need one clear message, fast, about which page is real", 2:"supporters are the targets, and telling them how the rescue asks for money is their only defence"}},
   org:"Second Chance Animal Rescue",
   target:"Obligations survive the incident. Notification is not a technical control and cannot be bought afterwards.",
   text:"Second Chance runs on donations and a shared mailbox that six volunteers access with the same password. On Friday the mailbox began sending donation appeals to the entire contact list from an address that is not theirs. The mailbox holds four years of correspondence, including scanned cheques with routing numbers and a spreadsheet of major donors.",
   draw:{method:"Manipulation or Coercion",impact:"Financial Wellbeing",resource:"Money",motive:"Personal Gain"},
   strong:[5,7,13], partial:[12,15,21], weak:[18,16],
   standing:[{id:1, text:"Volunteer accounts are never removed.", pos:{l:2,s:1}, cards:[7]}, {id:2, text:"There is no record of who changes the donation page.", pos:{l:1,s:1}, cards:[15,11]}],
   why:{5:"six people sharing one password with no second factor is the whole story", 7:"volunteer accounts that are never removed", 13:"four thousand donors have to be told something", 12:"reduces how the credentials were phished in the first place", 15:"who sent what, from where, and when", 21:"covers notification cost, not the donor who stops giving"},
   debrief:["Six people share one password because it is genuinely convenient. What do you replace it with that they will actually use?",
            "Which of your purchases helps you tell four thousand donors what happened?",
            "Insurance may cover the cost. Does it cover the donor who stops giving?"]},

  /* ---- Practitioner scenarios. Mid-sized organizations with an IT function,
     written for rooms where most players defend networks for a living. The
     story is still short enough to read aloud; the argument lives in `env`,
     which is why these are best run with the detail level set to Technical. */
  {id:11, pro:true, care:false, budget:10, title:"The Help Desk Call",
   org:"Cascade Freight Logistics — 450 staff, three warehouses, four-person IT team",
   target:"MFA worked until a person on a phone was allowed to reset it. The decisive controls are what the help desk may do and what one identity can reach, not another detection product.",
   text:"At 6:40 on a Friday evening the outsourced help desk takes a call from someone who gives the name, employee ID and manager of a regional operations lead. He says he dropped his phone at the loading dock and needs to re-enrol MFA. The agent resets the factor. Within forty minutes the account has signed in to the VPN, enumerated Active Directory, and added itself to a group with rights over the virtualisation cluster. At 9:15 p.m. on-call IT gets an alert from the backup system: a retention policy has been changed.",
   env:["Identity is on-premises Active Directory synced to Microsoft Entra ID. MFA is Authenticator push with number matching. No phishing-resistant method such as FIDO2 is deployed.",
        "The help desk is outsourced to an MSP and runs around the clock. Its identity check asks for employee ID, manager name and the last four digits of an SSN; all three were in a 2023 breach at the company's HR vendor.",
        "The SSL VPN on the edge firewall authenticates against Entra ID and checks nothing about the connecting device.",
        "Three ESXi 7.0 hosts are joined to the domain. Membership of the AD group 'ESX Admins' grants full host administration.",
        "Backups go to a domain-joined Windows repository with immutability off. An offsite copy to object storage exists, under the same admin credentials.",
        "Firewall and sign-in logs fed a SIEM trial that expired in March. EDR covers Windows endpoints only, nothing on the hypervisors.",
        "The MSP contract sets no identity-verification standard and excludes liability for social-engineering losses."],
   draw:{method:"Manipulation or Coercion",impact:"Financial Wellbeing",resource:"Technical Expertise",motive:"Personal Gain"},
   strong:[5,2,4], partial:[6,20,17,15], weak:[1,14,19],
   standing:[{id:1, text:"The hypervisor management interfaces sit on the same VLAN as staff laptops.", pos:{l:1,s:2}, cards:[18,11]},
             {id:2, text:"Service accounts have non-expiring passwords set in 2017.", pos:{l:1,s:1}, cards:[7,5]}],
   why:{5:"a factor reset needs stronger proof than facts that are already in a breach dump, and phishing-resistant MFA raises the bar again", 2:"the agent followed the script; training the help desk on reset pretexts is what changes the call", 4:"one operations account should not be able to add itself to a group that owns the hypervisors", 6:"immutable, separately credentialed backups are what survive an attacker who can change retention", 20:"someone watching at 7 p.m. on a Friday would have seen the VPN sign-in and the group change", 17:"the MSP contract is where the identity-verification standard belongs", 15:"the group change was logged; nothing was reading it"},
   debrief:["MFA worked as designed until someone reset it. Does identity proofing for a factor reset belong in a card, a contract, or a procedure?",
            "The attacker went for the hypervisors, not the endpoints. What did an EDR purchase actually see here?",
            "The backup system raised the first alarm. Is an alert on a retention change a detection control, and did anyone buy one on purpose?"],
   inject:{title:"The Extortion Email",
     text:"On Monday the company's executives receive an email with samples of exfiltrated driver HR files, including CDL numbers and drug-test results, and a deadline before the rest is published.",
     draw:{method:"Multi-phase Attack",impact:"Relationships",resource:"Money",motive:"Personal Gain"},
     strong:[13,21], partial:[15,14],
     why:{13:"whether to engage, who notifies drivers, and when counsel is called are plan decisions", 21:"breach counsel and negotiation support are what a cyber policy usually provides", 15:"scoping what left depends on file-access and egress records", 14:"HR files encrypted at rest under separate keys would have been less useful to take"}}},

  {id:12, pro:true, care:false, budget:10, title:"Keys in the Pipeline",
   org:"Lumen Health Analytics — 80 staff, AWS-hosted SaaS for 140 clinics",
   target:"The fixes practitioners reach for first, secret scanning and workload identity federation, have no card of their own. Make teams say which card they stretched and whether the stretch is honest.",
   text:"A Lumen developer force-pushes a branch to the public GitHub mirror of the company's open-source SDK. In a commit that was later deleted sits a .env file containing a long-lived AWS access key for the CI deploy user. Thirty-one hours later AWS opens an abuse case: the account is running 140 GPU instances in four regions, and CloudTrail shows ListBuckets and GetObject calls against the bucket of nightly de-identified clinic exports, and against one bucket that is not de-identified.",
   env:["There is one AWS account with no Organizations and no SCPs. Twenty-three IAM users have access keys; the oldest is four years old. The CI user has had AdministratorAccess 'temporarily' since 2022.",
        "GitHub Actions deploys using repository secrets. The SDK mirror is synced by a script that copies a monorepo subtree, dotfiles included.",
        "Secret scanning and push protection are not enabled on the GitHub organization.",
        "CloudTrail management events are on. Data events are on for the exports bucket only. Logs land in S3 with no alerting, and GuardDuty was turned off to save money.",
        "A 'raw-reprocess' bucket left from a 2024 migration holds 210,000 records with names and dates of birth. Nobody remembered it existed.",
        "Business associate agreements with the clinics require notice of a breach; several require it within ten days of discovery."],
   draw:{method:"Technological Attack",impact:"Financial Wellbeing",resource:"Technical Expertise",motive:"Personal Gain"},
   strong:[4,11,15], partial:[7,13,9], weak:[14,2,8],
   standing:[{id:1, text:"The AWS root account has no MFA, and its email belongs to a co-founder who left.", pos:{l:1,s:2}, cards:[5,7]},
             {id:2, text:"Production and staging share one AWS account.", pos:{l:2,s:1}, cards:[18,11]}],
   why:{4:"a deploy user with AdministratorAccess turned a leaked key into the whole account; least privilege and short-lived federated credentials are the fix", 11:"dotfiles in a sync script and push protection left off are configuration decisions", 15:"CloudTrail recorded everything and nothing alerted for thirty-one hours", 7:"a four-year-old access key should have been rotated or removed", 13:"ten-day notice windows in the agreements mean the plan has to exist before the abuse case arrives", 9:"you cannot protect a bucket nobody knows is there; extended here to data stores"},
   debrief:["The control you most wanted has no card. Which card did you stretch to cover it, and would you say so to the client?",
            "Encryption at rest was on for every bucket. Why did it make no difference?",
            "Who decides whether the raw-reprocess bucket counts as a breach of the business associate agreements, and how long do they have?"],
   inject:{title:"The Persistence You Missed",
     text:"After the key is revoked, the GPU instances come back two days later. Before the revocation, the attacker created a new IAM user and a scheduled Lambda function that re-creates access keys.",
     draw:{method:"Multi-phase Attack",impact:"Financial Wellbeing",resource:"Technical Expertise",motive:"Personal Gain"},
     strong:[15,4,20], partial:[13,7],
     why:{15:"CreateUser and CreateFunction calls are in CloudTrail for anyone who alerts on them", 4:"a role that cannot create identities cannot plant new ones", 20:"someone hunting after the first incident would have looked for exactly this", 13:"eradication means checking for persistence before declaring the incident closed", 7:"an inventory of IAM users would show the one nobody created"}}},

  {id:13, pro:true, care:false, budget:10, title:"The Edge Appliance",
   org:"Ashford County — 600 employees, 12-person IT, 911 dispatch on the county domain",
   target:"The vulnerability was public for three days before it was exploited. The decisive control is how fast a process can move, not which product was bought.",
   text:"On a Wednesday, CISA adds a pre-authentication vulnerability in Ashford County's SSL VPN appliance to its Known Exploited Vulnerabilities catalogue. The vendor's fix is a firmware upgrade that needs a reboot, and the county's change board meets on Tuesdays. On Saturday the appliance's integrity checker reports unexpected files, and a domain controller logs a new account, svc_backup2, in Domain Admins. The 911 computer-aided dispatch system authenticates against the same domain.",
   env:["About 420 remote users connect through the VPN appliance. Its management interface is reachable from the internet, and it keeps logs locally on a seven-day rotation.",
        "Patching runs in a monthly window. Emergency changes need the CIO, the county administrator and the department head to sign; none of them could be reached on Thursday.",
        "A single Active Directory forest covers every department, the Sheriff's office and 911 included. There is no tiered admin model, and there are thirty-one Domain Admins.",
        "Dispatch runs on-premises on Windows Server 2019 and authenticates dispatchers through AD. It shares a /16 with general county workstations, and the only ACLs are at the internet edge.",
        "EDR covers workstations and servers. Its alerts go by email to a shared mailbox that is read during business hours.",
        "There is no external incident response retainer. The CISO knows the state fusion center and the CISA regional contacts."],
   draw:{method:"Technological Attack",impact:"Physical Wellbeing",resource:"Technical Expertise",motive:"Politics"},
   strong:[1,18,13], partial:[15,16,4], weak:[2,3,12],
   standing:[{id:1, text:"The emergency change process needs three signatures and has never been used.", pos:{l:2,s:1}, cards:[13,1]},
             {id:2, text:"Retired servers are left powered on 'just in case'.", pos:{l:1,s:1}, cards:[9,10]}],
   why:{1:"a KEV entry on an internet-facing appliance is the case an emergency patch path exists for", 18:"dispatch on its own segment and its own identity boundary would not care what happened to the library's domain", 13:"someone has to be able to approve a reboot on a Thursday", 15:"seven days of appliance logs may not cover the first access", 16:"EDR saw the new admin; it needs to reach a person", 4:"thirty-one Domain Admins and no tiering made one foothold the whole forest"},
   debrief:["The patch existed. What would your change process have to look like to apply it on Thursday?",
            "Dispatch shares a domain with the library. Did anyone buy segmentation, and what did it cost them elsewhere?",
            "Detection fired on Saturday into a mailbox read on weekdays. Is EDR without a reader a control?"],
   inject:{title:"Dispatch Goes to Paper",
     text:"The next Tuesday the attacker pushes ransomware by Group Policy to three hundred machines. Dispatch is down and dispatchers fall back to paper cards and radio for nineteen hours.",
     draw:{method:"Multi-phase Attack",impact:"Physical Wellbeing",resource:"Technical Expertise",motive:"Politics"},
     strong:[6,13], partial:[18,16],
     why:{6:"restoring dispatch is the only thing that ends the paper fallback", 13:"paper-card dispatch has to be a rehearsed procedure, not an improvisation", 18:"dispatch on its own segment would not receive the GPO", 16:"EDR might stop encryption on some hosts; it will not stop a GPO already pushed by a Domain Admin"}}},

  {id:14, pro:true, care:false, budget:10, title:"The Consent Prompt",
   org:"Meridian Community Credit Union — 140 staff, 38,000 members",
   target:"MFA was on and did nothing, because the attacker never needed a password. The strongest answer is a tenant setting that costs one point.",
   text:"A Meridian loan officer receives a document-sharing link from a real title company whose mailbox has been compromised. It leads to a Microsoft consent page for an app called 'DocuView Secure' asking for Mail.ReadWrite and offline_access. She clicks Accept. For three weeks the app reads her mailbox, and two members receive wire-closing instructions with altered account numbers. One wire, for $186,000, has already cleared.",
   env:["The tenant is Microsoft 365 E3. Entra ID user consent is set to allow users to consent to apps from any publisher, the default for older tenants, and there is no admin consent workflow.",
        "MFA is enforced through Conditional Access. Granting consent did not prompt for anything new, and the app holds a refresh token of its own.",
        "On day nineteen the help desk reset her password after she reported odd read flags. The app kept reading, because the grant was never revoked.",
        "Defender for Office 365 Plan 1 with Safe Links is on. The link came from a known partner domain and was not blocked.",
        "Audit logs are kept 180 days. Nobody has built a query or an alert for new app consents.",
        "Loan officers email closing instructions as PDFs. The warning that the credit union never changes wire details by email appears only in the closing packet's fine print.",
        "NCUA requires reportable cyber incidents to be reported within seventy-two hours. The fidelity bond excludes social-engineering fraud."],
   draw:{method:"Indirect Attack",impact:"Financial Wellbeing",resource:"Technical Expertise",motive:"Personal Gain"},
   strong:[11,4,2], partial:[15,12,17,13], weak:[5,14,6],
   standing:[{id:1, text:"Members' wire instructions are confirmed by replying on the same email thread.", pos:{l:2,s:2}, cards:[2,13]},
             {id:2, text:"Four support engineers share the core banking vendor's VPN account.", pos:{l:1,s:2}, cards:[17,5]}],
   why:{11:"restricting user consent to verified publishers or admin approval is a tenant configuration change", 4:"which applications may hold mailbox access is an access-control decision nobody made", 2:"a consent screen is a new pretext and staff were never shown one", 15:"a new consent with Mail.ReadWrite is an alertable event; nothing was alerting", 12:"link protection did its job and still could not judge a trusted partner's link", 17:"the title company's compromise was the entry point; contracts can require them to notify you", 13:"seventy-two hours to report to NCUA starts at discovery, and member notification follows"},
   debrief:["MFA was enforced. Explain to a board member why it did not matter here.",
            "Resetting the password changed nothing. What actually ends an OAuth grant, and who in your organization knows how?",
            "The fix that matters most is a callback on a known number before any wire. Which card is that, and is it a card at all?"],
   inject:{title:"The Second Grant",
     text:"A month later, a review turns up another app, 'Teams Recorder Pro', consented to by nine staff, with Files.Read.All across SharePoint, where member loan files are kept.",
     draw:{method:"Indirect Attack",impact:"Financial Wellbeing",resource:"Technical Expertise",motive:"Personal Gain"},
     strong:[11,4], partial:[15,10],
     why:{11:"if user consent is still open, the first incident changed nothing", 4:"tenant-wide file read for a recording app is an access decision someone should have had to make", 15:"nine consents to the same unknown app is an obvious alert", 10:"OAuth apps are software in your environment; inventory them like any other"}}},

  /* ---- Expansion scenarios. `exp` hides them from the dropdown unless the
     expansion deck is on, and loading one turns the deck on for the session,
     because their keys are written around expansion cards. */
  {id:15, exp:true, pro:true, care:false, budget:10, title:"The Poisoned Dependency",
   org:"Tidewater Payments — 120 staff, card-present payment SaaS for 3,000 merchants",
   target:"Nothing was misconfigured in production. The attack arrived through the build, which is the one place the base deck has no card for.",
   text:"An open-source logging library used in Tidewater's build pipeline publishes a new minor version. The maintainer's account had been taken over a week earlier, and the release adds a postinstall script that reads environment variables and posts them to a paste site. Tidewater's CI runners install dependencies fresh on every build. Over four days the script collects the signing key for the merchant terminal update channel and a database URL with credentials for the transaction reporting replica.",
   env:["Builds run on self-hosted GitHub Actions runners that are persistent virtual machines, not ephemeral. Every job shares one service identity.",
        "Dependency versions use caret ranges, and there is no lockfile in the reporting service. No dependency is pinned or reviewed when it changes.",
        "Every repository secret is exposed to every workflow, including the terminal firmware signing key.",
        "Software composition analysis runs weekly and reports known CVEs only. A new malicious release with no CVE is invisible to it.",
        "The reporting replica holds 18 months of transactions, with the PAN truncated but merchant bank details in full. It accepts connections from the CI subnet.",
        "Runners have unrestricted outbound internet access. No egress allowlist exists.",
        "PCI DSS v4.0 assessment is due in five months. Requirement 6.3.2 asks for an inventory of bespoke and third-party software components."],
   draw:{method:"Indirect Attack",impact:"Financial Wellbeing",resource:"Technical Expertise",motive:"Personal Gain"},
   strong:[29,10,4], partial:[34,18,15,30], weak:[2,3,21],
   standing:[{id:1, text:"Former contractors still have write access to two repositories.", pos:{l:1,s:1}, cards:[7,31]},
             {id:2, text:"Terminal firmware updates are signed but terminals do not check revocation.", pos:{l:1,s:2}, cards:[11,29]}],
   why:{29:"pinned versions, reviewed dependency changes and secrets scoped per workflow are what CIS 16 means for a build", 10:"a component inventory would have shown which build pulled the new version, and when", 4:"one identity for every job, and every secret visible to every workflow, turned one bad package into the signing key", 34:"allowlisting what runners may execute catches a postinstall script nobody expected", 18:"a CI subnet that cannot reach the reporting replica limits what stolen credentials are worth", 15:"outbound posts to a paste site from a build runner are loggable and unusual", 30:"knowing which systems hold merchant bank details is the first question the assessor and the merchants will ask"},
   debrief:["Your software composition analysis was green the whole time. What is it actually for, and what was this?",
            "The signing key was reachable from a logging library's install step. Whose decision was that, and when was it made?",
            "Three thousand merchants receive firmware signed with a key you no longer control. What do you tell them, and in what order?"],
   inject:{title:"The Signed Update",
     text:"Three weeks later a firmware update appears on the terminal update channel that Tidewater did not publish. It is signed with the stolen key. Forty merchants have installed it before anyone notices.",
     draw:{method:"Multi-phase Attack",impact:"Financial Wellbeing",resource:"Technical Expertise",motive:"Personal Gain"},
     strong:[13,33], partial:[15,17],
     why:{13:"revoking a signing key across 3,000 terminals is a plan decision, not an improvisation", 33:"a team that has rehearsed key compromise knows who rotates it and how terminals learn", 15:"the publish event was logged; nothing compared it with a release", 17:"the merchant agreements decide what Tidewater owes them now"}}},

  {id:16, exp:true, pro:true, care:true, budget:10, title:"The Research Export",
   org:"Coastal State University Health Research Institute — 60 researchers, 14 active studies",
   target:"No attacker, no exploit. The data was shared on purpose by someone allowed to see it, so the controls that matter are knowing where data is and what may leave.",
   text:"A postdoctoral researcher at the institute uploads a 'de-identified' dataset to a public code repository so a collaborator at another university can reproduce an analysis. The file contains ZIP codes, exact dates of clinic visits and free-text notes. A journalist working on a story about the study's community notices that three participants can be identified by combining it with local news coverage. One of them is a minor.",
   env:["Study data lives on a shared research drive with folder-level access. Every member of a lab can read every study in that lab.",
        "The institute has no data inventory. The IRB protocol lists where data 'will be stored', and nobody checks it against where data actually is.",
        "De-identification is done by each lab with its own script. Nobody reviews the output before export.",
        "Researchers have local administrator rights and personal GitHub accounts. Nothing restricts uploads to code-hosting or file-sharing sites.",
        "The data use agreement with the partner health system requires notice within 5 business days of any unauthorized disclosure.",
        "University IT runs email and identity. The institute is responsible for everything else."],
   draw:{method:"Processes",impact:"Emotional Wellbeing",resource:"Entitlement",motive:"Curiosity"},
   strong:[30,4,2], partial:[13,17,12], weak:[16,32,35],
   standing:[{id:1, text:"Graduated students' accounts keep access to the research drive.", pos:{l:2,s:1}, cards:[7,4]},
             {id:2, text:"A study laptop with raw interview recordings has been 'on loan' for a year.", pos:{l:1,s:2}, cards:[9,14,38]}],
   why:{30:"knowing where identifiable data lives, and blocking it from leaving to public sites, is this card exactly", 4:"every lab member reading every study is more access than any one project needs", 2:"the researcher believed the file was de-identified; training on re-identification risk changes that judgement", 13:"five business days under the data use agreement starts now", 17:"the data use agreement is what defines the institute's obligation to the partner", 12:"upload controls can flag known file-sharing destinations, imperfectly"},
   debrief:["The researcher was authorized to see this data. Was this an incident, a mistake, or both, and does the label change your response?",
            "Who in the institute could have said, on any given day, where every copy of this dataset was?",
            "A minor can be identified. Who calls the family, and what do they say?"],
   inject:{title:"The Cached Copy",
     text:"The repository is deleted within hours, but a dataset search engine had already indexed and cached the file. A data broker's crawler retrieved it the same afternoon.",
     draw:{method:"Indirect Attack",impact:"Emotional Wellbeing",resource:"Technical Expertise",motive:"Personal Gain"},
     strong:[13,17], partial:[30],
     why:{13:"takedown requests, partner notice and participant notice all run on the clock now", 17:"the data use agreement may oblige the partner to act alongside you", 30:"knowing exactly which fields left is what makes a takedown request specific enough to work"}}},

  {id:17, exp:true, pro:true, care:false, budget:10, title:"Remote Access to the Line",
   org:"Riverbend Cold Storage — 220 staff, ammonia-refrigerated food warehouse",
   target:"The control that failed was a vendor's convenience. Segmentation and brokered remote access are what stand between an office phish and an ammonia release.",
   text:"Riverbend's refrigeration contractor supports the plant's ammonia compressor controls through a remote desktop tool installed on the engineering workstation next to the HMI. On Sunday night an operator watches the cursor move on its own: someone has opened the setpoint screen for the blast freezers. The session closes when he unplugs the network cable. The contractor says none of its technicians were connected.",
   env:["The engineering workstation runs Windows 10 with the remote tool set to unattended access. Its password has been the same since installation in 2021, and the contractor shares it among eleven technicians.",
        "The plant network and the office network are one flat VLAN. The PLCs answer to anyone on it.",
        "There is no list of which remote access tools are installed where. A scan later finds three different ones.",
        "The office was phished last month. One user's credentials were used to sign in from abroad, and the password was reset.",
        "Ammonia refrigeration falls under OSHA Process Safety Management and EPA Risk Management Program rules. A release has to be reported, and the plant sits 400 metres from a primary school.",
        "Safety interlocks are hard-wired and independent of the PLCs. The setpoints are not."],
   draw:{method:"Indirect Attack",impact:"Physical Wellbeing",resource:"Technical Expertise",motive:"Politics"},
   strong:[35,18,31], partial:[34,17,33,10], weak:[2,14,6],
   standing:[{id:1, text:"PLC firmware has never been updated; the vendor says updates void support.", pos:{l:1,s:2}, cards:[32,17]},
             {id:2, text:"The engineering workstation is also used to check personal email.", pos:{l:2,s:1}, cards:[34,12]}],
   why:{35:"brokered, per-person, session-recorded remote access replaces a shared always-on tool", 18:"PLCs that only the control segment can reach do not care what happens in the office", 31:"one shared credential for eleven technicians is privileged access with no owner", 34:"an allowlist would have refused the two remote tools nobody approved", 17:"the contractor's remote-access practice should have been a contract term", 33:"the operator improvised the right move; an exercise makes the next one deliberate", 10:"three remote access tools nobody listed is a software inventory finding"},
   debrief:["The safety interlocks are hard-wired. Does that make this a Not Severe threat, or does severity depend on what the setpoints can do before an interlock trips?",
            "The contractor's tool was convenient for everyone. What would you replace it with that they will actually use at 2 a.m.?",
            "Who at Riverbend can decide to take the plant offline, and did the operator have that authority when he pulled the cable?"],
   inject:{title:"The Vendor's Other Customers",
     text:"The contractor discloses that its technician password vault was breached. It services 140 refrigeration sites across the region, and Riverbend's credentials were in it.",
     draw:{method:"Indirect Attack",impact:"Physical Wellbeing",resource:"Money",motive:"Personal Gain"},
     strong:[31,17], partial:[35,13],
     why:{31:"credentials rotated per person, under your control, are not in the contractor's vault", 17:"breach notice and credential handling are what the contract should have specified", 35:"brokered access means a stolen vendor credential alone does not open a session", 13:"someone must decide tonight whether remote access stays off"}}},
];
const scenarioById = (id) => SCENARIOS.find(x=>x.id===id);

/* How the expansion cards score against the base library when the expansion
   is on. Keyed by scenario id or delayed-threat id, merged into the base key
   by withExpansion. Written so that no base strong card is demoted: the
   expansion adds options, it does not change the right answer. */
const EXPANSION_KEYS = {
  1:{partial:[33,38], weak:[35,32], why:{33:"a callback rule only becomes habit once the bookkeeper has rehearsed refusing a familiar voice", 38:"a managed laptop would not keep the payroll password in a personal browser profile"}},
  2:{partial:[34,33], weak:[32,29,38], why:{34:"an allowlist would have refused the shortcut inside the ISO, though that is prevention after the fact", 33:"a restore nobody has rehearsed is a hope, not a recovery"}},
  3:{strong:[30,38], weak:[29,35], standing:{1:[38]},
     why:{30:"the convenience copy existed because nothing tracked or limited where intake data could be exported", 38:"auto-lock, enforced device encryption and remote wipe are exactly what this laptop lacked"}},
  4:{partial:[31], weak:[29], why:{31:"the owner role is a privileged account and nobody managed it as one"}},
  5:{partial:[30,33], weak:[32,34], why:{30:"knowing which services hold student data is a data inventory, not an asset list", 33:"the superintendent improvising with a reporter is what an exercise would have replaced"}},
  6:{strong:[29], partial:[32], weak:[34], why:{29:"debug left on and a parameter that skips login are application security failures, precisely CIS 16", 32:"an external scan would have flagged the end-of-life framework and the exposed debug page"}},
  7:{partial:[30], weak:[31,32,38], standing:{1:[38]}, why:{30:"loss-prevention rules can flag a paralegal opening matters she does not work on"}},
  8:{partial:[32], weak:[29,31], why:{32:"a network scan finds devices nobody listed and the telnet ports they leave open"}},
  9:{partial:[32], weak:[29], why:{32:"scanning would have shown the donor portal facing the internet long before anyone else found it"}},
  10:{partial:[30], weak:[29,34], why:{30:"212 scanned cheques sat in a mailbox because nothing said what data belonged there or for how long"}},
  11:{strong:[31], partial:[35,33,38], weak:[29,32], why:{31:"the AD group that owns the hypervisors is privileged access, and nothing gated who could join it", 35:"a VPN that checked the connecting device would have refused the attacker's laptop", 33:"a help-desk reset pretext is exactly what a tabletop exercise rehearses", 38:"a device-compliance check needs managed devices to check; an unknown laptop would have failed it"}},
  12:{strong:[29], partial:[30,31], weak:[34,35], why:{29:"secret scanning and push protection on the repository are CIS 16; this is the card the base deck lacked", 30:"the raw-reprocess bucket is a data inventory failure", 31:"a CI user with AdministratorAccess is an unmanaged privileged identity"}},
  13:{partial:[32,35,33,31], why:{32:"external scanning tells you that you are exposed; it does not patch anything", 35:"replacing the appliance with brokered access is the long fix, not this week's", 33:"an emergency change path that has never been exercised is not a path", 31:"thirty-one Domain Admins is a privileged-access finding before it is anything else"}},
  14:{partial:[30], weak:[35,34,29], why:{30:"member loan files reachable by any consented app is a data-protection gap"}},
  s2:{partial:[30], why:{30:"you cannot say which referrals were in the sample without knowing what lived where"}},
  s4:{partial:[32], why:{32:"a scan would have found the abandoned plugin before the defacer did"}},
  s6:{partial:[31], why:{31:"a hosting panel held by one outsider is privileged access nobody managed"}},
  s7:{strong:[30], partial:[38], why:{30:"blocking client files from leaving to personal mail is what data loss prevention is for", 38:"a separate work profile on her devices keeps client files out of personal apps"}},
  s8:{partial:[34], why:{34:"an allowlisted circulation PC refuses an encryptor it has never seen"}},
  s9:{strong:[32], why:{32:"an external scan finds the portal and its version banner before the internet does"}},
  s11:{partial:[30], why:{30:"knowing where driver HR files lived would scope what was taken"}},
  s12:{partial:[31], why:{31:"privileged identities created outside a managed process are what PAM tooling surfaces"}},
  s13:{strong:[33], why:{33:"paper-card dispatch works when it has been rehearsed; this card is the rehearsal"}},
  g1:{strong:[32], why:{32:"scanning tells you which firmware is exposed the day the advisory lands"}},
  g3:{partial:[31,35], why:{31:"a supplier's standing login is privileged access you can broker and revoke", 35:"per-session supplier access ends when the session does"}},
  g4:{strong:[30], why:{30:"outbound data-loss rules catch a spreadsheet of client records going to an unknown address"}},
  x1:{partial:[38], why:{38:"device management can push browser policy that removes an extension everywhere at once"}},
};

/* How the safeguard pool scores, merged on top of the expansion keys when the
   pool is on. Strong only where the scenario turns on that exact safeguard. */
const SAFEGUARD_KEYS = {
  2:{partial:[50], why:{50:"someone has to tell nine hundred patients why Monday's appointments are gone"}},
  3:{partial:[47], why:{47:"a retention rule would have said the offline intake copy should not exist"}},
  4:{partial:[40], why:{40:"the sign-in from another state was in a log nobody opened"}},
  5:{strong:[48], partial:[50], why:{48:"nobody asked the vendor for a SOC 2 report; assessing providers is this safeguard exactly", 50:"the superintendent is the only spokesperson and learned from a reporter"}},
  6:{strong:[46], partial:[49], why:{46:"debug mode and a login-skipping parameter are services nobody needed left switched on", 49:"the contractor left with the only key and the hosting account in his name"}},
  7:{strong:[39], partial:[40], why:{39:"view history kept thirty days cannot answer a question about a filing drafted six weeks ago", 40:"a paralegal opening matters outside her caseload is what a review notices"}},
  8:{strong:[41], partial:[42,44,46], why:{41:"traffic at three in the morning was found once by luck; flow logs make it routine", 42:"a camera that must authenticate to get a port is not quietly on the network", 44:"UPnP opened the port forwards by itself", 46:"telnet left listening is a service nobody needed"}},
  10:{partial:[47,50], why:{47:"four years of scanned cheques is a retention decision nobody made", 50:"four thousand donors need one clear message"}},
  11:{partial:[40,45,48], why:{40:"the group change was logged; nothing was reading", 45:"hypervisor administration from a dedicated machine is harder to reach from a stolen VPN session", 48:"the MSP's identity check was never assessed"}},
  12:{partial:[40,47], why:{40:"CloudTrail held thirty-one hours of evidence nobody reviewed", 47:"the raw-reprocess bucket outlived the migration it was made for"}},
  13:{strong:[43], partial:[44,51,39,45], why:{43:"keeping the VPN appliance on current firmware is this safeguard exactly", 44:"a management interface on the internet widened the target", 51:"a written threshold says a new Domain Admin on Saturday wakes someone up", 39:"seven days of appliance logs may not reach back to first access", 45:"thirty-one Domain Admins administering from everyday machines"}},
  14:{partial:[40], why:{40:"a weekly review of new app consents would have found this in days, not three weeks"}},
  15:{strong:[52], partial:[41], why:{52:"pinned, reviewed dependency updates are this safeguard exactly", 41:"a build runner posting to a paste site is a flow nobody expected"}},
  16:{partial:[47,50], why:{47:"a retention schedule limits how much data any one export can expose", 50:"participants, the partner and the IRB each need to hear it from you first"}},
  17:{partial:[42,46], why:{42:"an engineering workstation port that authenticates devices limits who can sit next to the PLCs", 46:"three remote tools nobody approved are services to remove"}},
  s1:{partial:[40], why:{40:"the payout change was in the platform's log"}},
  s2:{partial:[47,50], why:{47:"referrals kept past their use are referrals that can leak", 50:"patients should not learn about this from a leak site"}},
  s5:{strong:[50], why:{50:"warning parents faster than the texts spread is a communication plan, nothing else"}},
  s6:{strong:[49], why:{49:"offboarding the contractor properly would have moved the hosting account and revoked his access"}},
  s9:{partial:[46], why:{46:"a port-forward to a portal nobody needs exposed is an unnecessary service"}},
  s10:{partial:[50], why:{50:"donors need to know which page is real, quickly"}},
  s11:{partial:[50], why:{50:"drivers deserve to hear from the company before the extortionist publishes"}},
  s12:{partial:[40], why:{40:"CreateUser and CreateFunction calls stand out in a review"}},
  s15:{partial:[50], why:{50:"three thousand merchants need instructions before the next update"}},
  s16:{partial:[47], why:{47:"less retained data means less in any cached copy"}},
  s17:{partial:[48,49], why:{48:"an assessment would have asked how the contractor stores your credentials", 49:"credentials returned or rotated when technicians change are not in the vault"}},
  g1:{strong:[43], partial:[44], why:{43:"current firmware on the edge device is the direct answer to a known-exploited advisory", 44:"remote management turned off shrinks the exposure while you patch"}},
  g2:{partial:[40], why:{40:"a thousand failed sign-ins an hour is obvious to anyone reviewing"}},
  g3:{partial:[48,49], why:{48:"assessing the bookkeeping firm would have asked how it protects your login", 49:"a supplier login that ends with the engagement cannot be used after it"}},
};

/* Delayed threats for later engagements, once a scenario's own has landed.
   Generic enough to fit any client in the library. */
const GENERIC_INJECTS = [
  {id:"g1", title:"The Edge Device Advisory",
   text:"CISA adds a vulnerability in the organization's router or firewall model to its Known Exploited Vulnerabilities catalogue. Nobody is sure which firmware it runs.",
   draw:{method:"Technological Attack",impact:"Financial Wellbeing",resource:"Technical Expertise",motive:"Personal Gain"},
   strong:[1,9], partial:[11,18],
   why:{1:"a known-exploited vulnerability with a vendor fix is a patching problem first", 9:"you cannot patch a device you cannot name the model of", 11:"turning off remote management shrinks the exposure while the patch waits", 18:"a compromised edge device that reaches nothing internal does less harm"}},
  {id:"g2", title:"Credential Stuffing",
   text:"Passwords from an unrelated retail breach are being tried against the organization's email at about a thousand attempts an hour. Three staff reused theirs.",
   draw:{method:"Technological Attack",impact:"Relationships",resource:"Technical Expertise",motive:"Personal Gain"},
   strong:[5], partial:[15,7],
   why:{5:"a second factor makes a reused password worth little", 15:"a thousand failed sign-ins an hour is visible to anyone looking", 7:"dormant accounts are the ones nobody notices being used"}},
  {id:"g3", title:"A Supplier Gets Hit",
   text:"The organization's bookkeeping firm discloses a breach. It held a remote-access login to the organization's accounting system and copies of payroll files.",
   draw:{method:"Indirect Attack",impact:"Financial Wellbeing",resource:"Money",motive:"Personal Gain"},
   strong:[17,13], partial:[6,4],
   why:{17:"what the firm must tell you, and how fast, was decided when the contract was signed", 13:"someone must decide today whether staff are told their payroll data is out", 6:"if the accounting data is altered, a clean copy is the reference", 4:"a supplier login with standing access is an access decision"}},
  {id:"g4", title:"The Wrong Recipient",
   text:"A staff member autocompletes the wrong address and sends a spreadsheet of client records to a stranger. The stranger replies to say so, and asks what the organization intends to do about it.",
   draw:{method:"Processes",impact:"Emotional Wellbeing",resource:"Entitlement",motive:"Curiosity"},
   strong:[12,14], partial:[2,13],
   why:{12:"outbound data-loss rules and external-recipient warnings exist for this", 14:"an encrypted attachment sent to the wrong person stays closed", 2:"slowing down before hitting send is a habit training can build", 13:"whether this is a notifiable breach is a decision someone has to own"}},
];
/* Joins the pool after the base four when the expansion is on. */
const EXP_GENERIC_INJECTS = [
  {id:"x1", title:"The Browser Extension",
   text:"A popular PDF-converter browser extension installed by a third of the staff is sold to a new owner, whose first update reads every page staff open, including the finance portal.",
   draw:{method:"Indirect Attack",impact:"Financial Wellbeing",resource:"Money",motive:"Personal Gain"},
   strong:[34,12], partial:[10,2],
   why:{34:"an extension allowlist means nobody installs one the organization has not approved", 12:"managed browser policy can block or remove extensions centrally", 10:"you cannot remove an extension nobody knew was installed", 2:"staff installed it because it was useful; that is the conversation to have"}},
  {id:"x2", title:"The Leaked Repository",
   text:"A former intern's personal code repository turns out to contain a copy of an internal tool, with a working database password in its configuration file.",
   draw:{method:"Processes",impact:"Relationships",resource:"Entitlement",motive:"Curiosity"},
   strong:[29,7], partial:[30,5],
   why:{29:"secret scanning finds credentials in code wherever the code ends up", 7:"the intern's access should have ended, and with it the password's usefulness", 30:"knowing what data that database holds sets how serious this is", 5:"a password that is unique and rotated is worth less in someone else's repository"}},
];
/* Scenario injects are keyed s<scenario id>; the generic pool keeps its own ids. */
const injectById = (id) => {
  if (typeof id==="string" && id.startsWith("s")){
    const x = scenarioById(Number(id.slice(1)));
    return x?.inject ? {...x.inject, id} : null;
  }
  return GENERIC_INJECTS.find(g=>g.id===id) || EXP_GENERIC_INJECTS.find(g=>g.id===id) || null;
};

/* The expansion is on when the facilitator says so, or when the loaded
   scenario was written for it. */
const expansionOn = (cfg) => !!(cfg?.expansion || scenarioById(cfg?.scenarioId)?.exp);
const deckOf = (cfg) => expansionOn(cfg) ? [...SOLUTIONS, ...EXP_SOLUTIONS] : SOLUTIONS;
const modsOf = (cfg) => expansionOn(cfg) ? [...MODIFIERS, ...EXP_MODIFIERS] : MODIFIERS;
const withExpansion = (key, extra) => !key || !extra ? key : {...key,
  strong:[...key.strong, ...(extra.strong||[])],
  partial:[...key.partial, ...(extra.partial||[])],
  weak:[...(key.weak||[]), ...(extra.weak||[])],
  why:{...(key.why||{}), ...(extra.why||{})},
  // `standing` adds expansion cards that also address a standing risk, by risk id
  ...(extra.standing && key.standing ? {standing:key.standing.map(r=>
    extra.standing[r.id] ? {...r, cards:[...r.cards, ...extra.standing[r.id]]} : r)} : {})};
/* The safeguard pool only exists on top of the expansion: most safeguards
   refine an expansion card or sit beside one. */
const safeguardsOn = (cfg) => expansionOn(cfg) && !!cfg?.safeguards;
/* Every place that scores or deals reads keys through these two. */
const extendKey = (key, k, cfg) => {
  if (!expansionOn(cfg)) return key;
  const x = withExpansion(key, EXPANSION_KEYS[k]);
  return safeguardsOn(cfg) ? withExpansion(x, SAFEGUARD_KEYS[k]) : x;
};
const scenFor = (cfg) => {
  const s = scenarioById(cfg?.scenarioId);
  return extendKey(s, s?.id, cfg);
};
const injectFor = (id, cfg) => extendKey(injectById(id), id, cfg);
/* The next delayed threat for a team: the scenario's own first, then the pool
   in order, so every team in the room gets the same one. */
const nextInjectFor = (scen, have=[], cfg) => {
  const pool = [...GENERIC_INJECTS, ...(expansionOn(cfg) ? EXP_GENERIC_INJECTS : [])];
  const ids = [...(scen?.inject ? [`s${scen.id}`] : []), ...pool.map(g=>g.id)];
  return ids.find(id=>!have.includes(id)) || null;
};

/* Realization. Likelihood drifts; severity does not, because severity is a
   property of who is harmed and that does not change because an organization
   delayed. A threat already at Very Likely has nowhere left to drift, so it
   happens — and the outcome follows from what the team bought in earlier
   engagements, never from chance. */
const REALIZATION = [
  {q:"Detection", cards:[15,20],
   yes:"Discovered within days, internally.",
   no:"Discovered months later, by a third party or the press."},
  {q:"Response", cards:[13],
   yes:"They know who to call and in what order.",
   no:"Forfeit the first purchase of this engagement to confusion."},
  {q:"Recovery", cards:[6],
   yes:"Data and systems are restored.",
   no:"The loss is permanent."},
  {q:"Financial", cards:[21],
   yes:"Part of the cost is transferred.",
   no:"The full cost lands on the organization."},
  {q:"Disclosure", cards:[17],
   yes:"The provider is obliged to notify them.",
   no:"They learn from someone else."},
];
/* Did the portfolio actually address this threat? The scenario's expert key is
   the referee. Students never see it during play; they see its verdict at the
   next engagement, which is the feedback Cycle 1 asked for without handing out
   an answer sheet mid-round. */
function coverage(purchases=[], scen, grid){
  if(!scen) return {score:0, move:0, verdict:"unscored"};
  const strong = purchases.filter(id=>scen.strong.includes(id));
  const partial = purchases.filter(id=>scen.partial.includes(id));
  const score = strong.length*2 + partial.length;
  // On 5×5 a portfolio that hits the threat twice over earns a second row.
  const move = grid?.n===5 && score>=4 ? -2 : score>=2 ? -1 : score===1 ? 0 : +1;
  return {score, move, strong, partial,
    verdict: move<0 ? "held" : move===0 ? "partial" : "unaddressed"};
}

const resolveRealization = (everBought=[]) =>
  REALIZATION.map(r=>{
    const had = r.cards.some(c=>everBought.includes(c));
    return {q:r.q, had, text: had ? r.yes : r.no};
  });

const DEFAULT_DIMS = {
  method: ["Attack Cover Up","Physical Attack","Multi-phase Attack","Indirect Attack",
           "Technological Attack","Processes","Manipulation or Coercion"],
  impact: ["Physical Wellbeing","Relationships","Emotional Wellbeing","Financial Wellbeing"],
  resource: ["Money","Entitlement","Artificial Intelligence","Technical Expertise"],
  motive: ["Desire or Obsession","Politics","Curiosity","Personal Gain"],
};
const DIM_META = {
  method:{label:"Method",color:C.method}, impact:{label:"Human Impact",color:C.impact},
  resource:{label:"Resources",color:C.resource}, motive:{label:"Motivation",color:C.motive},
};
/* The matrix comes in two sizes. 3×3 is the original and what every study
   session before Fall 2026 used; 5×5 was added after practitioners at BSides
   PNW asked for room to argue that a control moved a threat one notch rather
   than a third of the board. Positions are stored as row/column indices, so a
   session's size is fixed once any team has placed anything. Both sizes keep
   "Very Likely" and "Very Severe" as the extremes so the manual still reads. */
const GRIDS = {
  3:{ n:3, lik:["Not Likely","Likely","Very Likely"], sev:["Not Severe","Severe","Very Severe"],
      likShort:["Not","Likely","Very"], sevShort:["Not","Severe","Very"] },
  5:{ n:5, lik:["Rare","Unlikely","Possible","Likely","Very Likely"],
      sev:["Minimal","Minor","Moderate","Severe","Very Severe"],
      likShort:["Rare","Unl","Pos","Lik","VL"], sevShort:["Min","Mnr","Mod","Sev","VS"] },
};
/* Sessions saved before the size existed are 3×3; new ones are claimed at 5. */
const gridOf = (cfg) => GRIDS[cfg?.gridSize===5 ? 5 : 3];
/* Scenario standing risks are authored on the 3×3 grid. */
const onGrid = (pos, g) => !pos ? pos : g.n===3 ? pos : {l:pos.l*2, s:pos.s*2};
const middleRow = (g) => Math.floor(g.n/2);
const PHASES = [
  {id:"setup", label:"Setup"},
  {id:"p1", label:"Phase 1 — Threat model & placement"},
  {id:"p2", label:"Phase 2 — Budgeted defense"},
  {id:"p3", label:"Phase 3 — Residual risk"},
  {id:"debrief", label:"Debrief"},
];
const MAX_TEAMS = 16;
const ALL_TEAMS = Array.from({length:MAX_TEAMS},(_,i)=>i+1);
const DEFAULT_TEAMS = 6;
/* Rooms bigger than this read more storage per poll, so the interval
   stretches to keep total request volume roughly flat. */
const teamsOf = (cfg) => ALL_TEAMS.slice(0, Math.min(MAX_TEAMS, cfg?.teamCount ?? DEFAULT_TEAMS));
const pollMs  = (n) => n<=8 ? 4000 : n<=12 ? 6000 : 8000;
/* Guidance, not a hard limit: 4 is where someone stops talking. */
const SEATS_PER_TEAM = 4;
/* Practitioners asked for a wider hand to argue over. The deck is 21 controls,
   so 14 already shows two thirds of it; past that the hand stops being a
   constraint and only the budget is. */
const DEAL_SIZES = [8,10,12,14];
const TIER_MIX = {8:{F:6,E:1,A:1}, 10:{F:7,E:2,A:1}, 12:{F:8,E:2,A:2}, 14:{F:9,E:3,A:2}};
/* The expansion deck is 14 Foundational, 11 Extended, 4 Advanced. */
const TIER_MIX_EXP = {8:{F:5,E:2,A:1}, 10:{F:6,E:3,A:1}, 12:{F:7,E:3,A:2}, 14:{F:8,E:4,A:2}};
/* Delayed threats stack, but a budget cannot stretch over more than this. */
const MAX_INJECTS = 3;
const CFG_KEY = "game:config";
const teamKey = (n) => `game:team:${n}`;
/* Expansion cards always resolve, so a saved hand still renders after the
   facilitator switches the expansion off. */
const card = (id) => SOLUTIONS.find(c=>c.id===id) || EXP_SOLUTIONS.find(c=>c.id===id)
  || SAFEGUARDS.find(c=>c.id===id)
  || MODIFIERS.find(c=>c.id===id) || EXP_MODIFIERS.find(c=>c.id===id);
/* A safeguard is buyable while one of its parent controls is held. */
const parentHeld = (c, held=[]) => !c?.safeguard || c.parents.some(p=>held.includes(p));

/* The claim code is stored as a SHA-256 hash so reading the shared database
   does not reveal it. The database rules are what actually enforce the role;
   this only keeps the code itself out of plain sight. */
async function hashCode(code){
  try{
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`st1:${code}`));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
  }catch{ return `plain:${code}`; }
}

const blankTeam = (n) => ({
  n, name:`Team ${n}`, members:"", joined:false,
  threat:{method:"",impact:"",resource:"",motive:""},
  pre:null, post:null, hand:[], modHand:[], purchases:[],
  modifiers:[], residual:"", measures:[], debriefAnswers:{}, carryAnswer:"",
  recommendation:"", ownerUid:null,
  engagement:1, everBought:[], drift:0, realized:null, lastVerdict:null,
  standingPos:{}, standingIgnored:0, budgetOverride:null,
  injects:[], preWhy:"", postWhy:"", sgHand:[],
  updatedAt:0,
});

/* Storage adapter. Inside a Claude artifact this uses window.storage.
   Outside it (GitHub Pages, a course server) drop in a backend that
   exposes the same two methods — see backend.js in the repo scaffold. */
const BACKEND = (typeof window !== "undefined" && window.SOLUTIONS_BACKEND) || {
  async get(key){ const r = await window.storage.get(key,true); return r ? JSON.parse(r.value) : null; },
  async set(key,val){ await window.storage.set(key,JSON.stringify(val),true); return true; },
};
let LAST_ERROR = null;
async function sGet(key){ try{ return await BACKEND.get(key); }catch(e){ LAST_ERROR=e; return null; } }
async function sSet(key,val){ try{ return await BACKEND.set(key,val); }catch(e){ LAST_ERROR=e; return false; } }
function sample(arr,k){ const a=[...arr]; const out=[]; while(out.length<k && a.length) out.push(a.splice(Math.floor(Math.random()*a.length),1)[0]); return out; }

/* ---------------- shared bits ---------------- */

function Tokens({total,spent}){
  return (
    <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
      {Array.from({length:total}).map((_,i)=>{
        const used = i < spent;
        return <div key={i} aria-hidden style={{
          width:22,height:22,borderRadius:"50%",
          background: used ? "transparent" : C.brass,
          border: used ? `1.5px dashed ${C.edge}` : `1.5px solid #A8873F`,
          boxShadow: used ? "none" : "0 1px 3px rgba(0,0,0,.45)",
          transition:"all .18s ease",
        }}/>;
      })}
      <span style={{fontFamily:MONO,fontSize:13.5,color:C.muted,marginLeft:6}}>
        {total-spent} of {total} left
      </span>
    </div>
  );
}

/* `extras` are the delayed threats: [{id, label, title, pre, post}]. They are
   drawn as numbered squares so they never read as the main threat's circles. */
function Matrix({pre,post,onPick,interactive,compact,standing=[],addressed=[],grid=GRIDS[3],extras=[]}){
  const five = grid.n===5;
  const cell = compact ? (five?28:34) : (five?56:58);
  const mark = compact ? 9 : 13;
  return (
    <div style={{display:"inline-block"}}>
      <div style={{display:"grid",gridTemplateColumns:`auto repeat(${grid.n},${cell}px)`,gap:3}}>
        <div/>
        {grid.sev.map((s,si)=>(
          <div key={s} title={s} style={{fontFamily:MONO,fontSize:compact||five?11.5:12.5,color:C.muted,
            textAlign:"center",paddingBottom:3,lineHeight:1.2,alignSelf:"end"}}>
            {compact ? grid.sevShort[si] : s}
          </div>
        ))}
        {grid.lik.map((l,li)=>(
          <React.Fragment key={l}>
            <div title={l} style={{fontFamily:MONO,fontSize:compact||five?11.5:12.5,color:C.muted,
              alignSelf:"center",paddingRight:6,textAlign:"right"}}>
              {compact ? grid.likShort[li] : l}
            </div>
            {grid.sev.map((s,si)=>{
              const isPre = pre && pre.l===li && pre.s===si;
              const isPost = post && post.l===li && post.s===si;
              const heat = (li+si)/(2*(grid.n-1));
              return (
                <button key={s} disabled={!interactive} onClick={()=>onPick && onPick(li,si)}
                  aria-label={`${l}, ${s}`}
                  style={{
                    width:cell,height:cell,borderRadius:3,cursor:interactive?"pointer":"default",
                    border:`1px solid ${C.edge}`,
                    background:C.name==="dark" ? `rgba(209,118,111,${0.10+heat*0.22})` : `rgba(182,66,56,${0.07+heat*0.18})`,
                    display:"flex",alignItems:"center",justifyContent:"center",alignContent:"center",
                    flexWrap:"wrap",gap:compact?1:3,padding:0,
                  }}>
                  {standing.filter(r=>r.at.l===li && r.at.s===si).map(r=>(
                    <span key={`s${r.id}`} title={r.text}
                      style={{width:compact?9:13,height:compact?9:13,borderRadius:2,
                        fontFamily:MONO,fontSize:compact?6:8,display:"flex",
                        alignItems:"center",justifyContent:"center",
                        background: addressed.includes(r.id) ? C.ok : "transparent",
                        border:`1.5px solid ${addressed.includes(r.id)?C.ok:C.muted}`,
                        color: addressed.includes(r.id) ? "#0E1A12" : C.muted}}>
                      {String.fromCharCode(64+r.id)}
                    </span>
                  ))}
                  {isPre && <span title="Before controls" style={{width:10,height:10,borderRadius:"50%",
                    border:`2px solid ${C.muted}`,background:"transparent"}}/>}
                  {isPost && <span title="After controls" style={{width:11,height:11,borderRadius:"50%",
                    background:C.brass,boxShadow:"0 0 0 2px rgba(0,0,0,.3)"}}/>}
                  {extras.flatMap(x=>[
                    x.pre && x.pre.l===li && x.pre.s===si &&
                      <span key={`xb${x.id}`} title={`${x.title} — before`} style={{width:mark,height:mark,
                        borderRadius:2,fontFamily:MONO,fontSize:compact?7:9,display:"flex",
                        alignItems:"center",justifyContent:"center",
                        border:`1.5px dashed ${C.solution}`,color:C.solution}}>{x.label}</span>,
                    x.post && x.post.l===li && x.post.s===si &&
                      <span key={`xa${x.id}`} title={`${x.title} — after`} style={{width:mark,height:mark,
                        borderRadius:2,fontFamily:MONO,fontSize:compact?7:9,fontWeight:700,display:"flex",
                        alignItems:"center",justifyContent:"center",
                        background:C.solution,color:C.onAccent}}>{x.label}</span>,
                  ].filter(Boolean))}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      {!compact && (
        <div style={{display:"flex",gap:14,marginTop:8,fontFamily:MONO,fontSize:12.5,color:C.muted,flexWrap:"wrap"}}>
          <span><span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",border:`2px solid ${C.muted}`,marginRight:5}}/>before</span>
          <span><span style={{display:"inline-block",width:9,height:9,borderRadius:"50%",background:C.brass,marginRight:5}}/>after</span>
          {extras.length>0 && <span><span style={{display:"inline-block",width:9,height:9,borderRadius:2,
            background:C.solution,marginRight:5}}/>delayed threats, numbered</span>}
        </div>
      )}
    </div>
  );
}

/* The links sit outside the buy button: a link inside a button is invalid
   HTML, and a click on it would also buy the card. */
function CardTile({c,state,onClick,disabled,note,links=[]}){
  const bought = state==="bought";
  return (
    <div style={{borderRadius:4,border:`1px solid ${bought?C.brass:C.edge}`,
      borderLeft:`3px solid ${C.solution}`,
      background: bought ? "rgba(217,180,91,.10)" : C.panel,
      display:"flex",flexDirection:"column"}}>
    <button onClick={onClick} disabled={disabled}
      style={{
        textAlign:"left",width:"100%",padding:"9px 11px",border:"none",background:"transparent",
        color:"inherit",flex:1,
        cursor: disabled?"not-allowed":"pointer", opacity: disabled&&!bought?.45:1,
        display:"block",
      }}>
      <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"baseline"}}>
        <span style={{fontFamily:SANS,fontSize:14.5,color:C.paper,fontWeight:500,lineHeight:1.25}}>{c.name}</span>
        <span style={{fontFamily:MONO,fontSize:13,color:c.cost===0?C.muted:C.brass,whiteSpace:"nowrap"}}>
          {c.cost===0?"free":`${c.cost} pt${c.cost>1?"s":""}`}
        </span>
      </div>
      <div title={c.ctrl
          ? "CIS Controls are a published checklist of security practices, written by a non-profit and used by real organizations. This number is where to look it up afterwards."
          : undefined}
        style={{fontFamily:MONO,fontSize:12.5,color:C.muted,marginTop:3,
          cursor:c.ctrl?"help":"default"}}>
        {String(c.id).padStart(2,"0")} · {c.ctrl || c.demand}
      </div>
      {note && <div style={{fontFamily:MONO,fontSize:12.5,color:C.brass,marginTop:4}}>{note}</div>}
    </button>
    {links.length>0 && (
      <div style={{display:"flex",gap:10,flexWrap:"wrap",padding:"0 11px 8px",
        fontFamily:MONO,fontSize:12.5}}>
        <span style={{color:C.muted}}>Learn more:</span>
        {links.map(l=>(
          <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" title={l.title}
            style={{color:C.solution,textDecoration:"underline",textUnderlineOffset:2}}>
            {l.label} ↗
          </a>
        ))}
      </div>
    )}
    </div>
  );
}

function Section({title,children,right}){
  return (
    <section style={{marginBottom:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",
        borderBottom:`1px solid ${C.edge}`,paddingBottom:5,marginBottom:10}}>
        <h3 style={{fontFamily:MONO,fontSize:13,letterSpacing:".09em",textTransform:"uppercase",
          color:C.muted,margin:0,fontWeight:500}}>{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

const btn = (kind="ghost") => ({
  fontFamily:MONO,fontSize:13.5,padding:"7px 13px",borderRadius:3,cursor:"pointer",
  border:`1px solid ${kind==="primary"?C.brass:C.edge}`,
  background: kind==="primary"?"rgba(217,180,91,.16)":kind==="danger"?"rgba(209,118,111,.16)":"transparent",
  color: kind==="primary"?C.brass:kind==="danger"?C.warn:C.paper,
});


/* What to do now, per phase. Playtesting showed teams stall at Phase 3 and
   guess at the modifiers, so this is shown in the interface rather than left
   to the facilitator to repeat six times. */
const PHASE_GUIDE = {
  p1:{ title:"Build the threat model, then place it",
    steps:[
      "Read the scenario together before touching anything.",
      "Four cards make the model: the method, who it harms, what the attacker has, and why. Say the story out loud in one sentence.",
      "Put the threat on the grid. Across is how bad it would be if it happened. Down is how often it could happen — the further down, the more likely.",
    ],
    key:"Judge severity by the Human Impact card — who gets hurt — not by how clever the attack sounds.",
    done:"One marker on the grid, and you can name the person who gets hurt." },
  p2:{ title:"Spend your budget",
    steps:[
      "Cards cost 1, 2 or 3 points. Anything you do not spend is gone.",
      "For each card you buy, say which part of your threat it touches. If you cannot, do not buy it.",
      "Modifier cards are free, but each one asks you to make a specific claim. At most two.",
    ],
    key:"You cannot afford everything. That is the exercise, not a mistake.",
    done:"You have stopped spending and can defend every card you bought." },
  p3:{ title:"What still gets through",
    steps:[
      "Move the same threat to where it sits now, given what you bought.",
      "Likelihood usually falls, which means moving up a row. Severity usually does not move at all — controls rarely change who gets hurt.",
      "Write one sentence naming what an attacker could still do.",
    ],
    key:"Likelihood runs down the grid, so reducing it means moving up a row. Severity runs across and rarely moves. If you landed in the top-left corner you have over-credited yourselves — something always gets through.",
    done:"The marker has moved and there is a sentence in the box." },
  debrief:{ title:"Compare and explain",
    steps:[
      "Be ready to say which purchase you argued about most.",
      "Be ready to say what you wanted and could not afford.",
    ],
    key:"There is no single right answer. There are answers you can defend and answers you cannot.",
    done:"" },
};

const PHASE_MINUTES = {p1:7, p2:10, p3:5, debrief:8, setup:5};
/* A technical brief needs more reading time before anyone can place a threat. */
const phaseMinutes = (phase, cfg) =>
  phase==="p1" && cfg?.detail==="technical" ? 10 : (PHASE_MINUTES[phase] || 8);

function HeaderClock({end}){
  const [now,setNow] = useState(Date.now());
  useEffect(()=>{ const i=setInterval(()=>setNow(Date.now()),1000); return ()=>clearInterval(i); },[]);
  const left = Math.max(0, end-now);
  const m = Math.floor(left/60000), sec = Math.floor((left%60000)/1000);
  const low = left < 120000;
  return (
    <div style={{fontFamily:MONO,fontSize:27,fontWeight:600,lineHeight:1,
      fontVariantNumeric:"tabular-nums",
      color: left===0 ? C.warn : low ? C.brass : C.paper}}>
      {left===0 ? "time" : `${m}:${String(sec).padStart(2,"0")}`}
    </div>
  );
}

function PhaseGuide({phase}){
  const g = PHASE_GUIDE[phase];
  const [open,setOpen] = useState(true);
  if(!g) return null;
  return (
    <div style={{border:`1px solid ${C.solution}`,borderRadius:4,
      background:"rgba(124,95,168,.10)",padding:"11px 13px",marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:10}}>
        <span style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".08em",
          textTransform:"uppercase",color:C.solution}}>What to do now — {g.title}</span>
        <button onClick={()=>setOpen(o=>!o)} style={{...btn(),fontSize:12.5,padding:"2px 8px"}}>
          {open?"hide":"show"}
        </button>
      </div>
      {open && (
        <>
          <ol style={{margin:"8px 0 0",paddingLeft:18,fontSize:14,lineHeight:1.65}}>
            {g.steps.map((x,i)=><li key={i} style={{marginBottom:3}}>{x}</li>)}
          </ol>
          <div style={{fontSize:14,lineHeight:1.6,marginTop:8,color:C.brass}}>{g.key}</div>
          {g.done && <div style={{fontFamily:MONO,fontSize:13,color:C.muted,marginTop:6}}>
            Done when: {g.done}</div>}
        </>
      )}
    </div>
  );
}


function HelpPanel({onClose}){
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:900,
      background:C.name==="dark"?"rgba(10,13,17,.86)":"rgba(40,38,34,.55)",overflowY:"auto",padding:"28px 16px"}}>
      <div onClick={e=>e.stopPropagation()} style={{maxWidth:720,margin:"0 auto",
        background:C.panel,border:`1px solid ${C.edge}`,borderRadius:6,padding:"22px 26px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
          <h2 style={{margin:0,fontSize:23,fontWeight:600}}>How to play</h2>
          <button onClick={onClose} style={btn()}>Close</button>
        </div>

        <p style={{fontSize:15,lineHeight:1.65,color:C.paper}}>
          You are advising an organization that cannot afford everything. Your job is to pick
          what it should do, and be able to say why. There is no single right answer — there
          are answers you can defend and answers you cannot.
        </p>

        {["p1","p2","p3"].map(p=>{
          const g = PHASE_GUIDE[p];
          return (
            <div key={p} style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${C.edge}`}}>
              <div style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".08em",
                textTransform:"uppercase",color:C.solution}}>
                {PHASES.find(x=>x.id===p)?.label}
              </div>
              <div style={{fontSize:16,fontWeight:600,margin:"3px 0 6px"}}>{g.title}</div>
              <ol style={{margin:0,paddingLeft:18,fontSize:14,lineHeight:1.65,color:C.paper}}>
                {g.steps.map((x,i)=><li key={i}>{x}</li>)}
              </ol>
              <div style={{fontSize:14,color:C.brass,marginTop:6}}>{g.key}</div>
            </div>
          );
        })}

        <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${C.edge}`}}>
          <div style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".08em",
            textTransform:"uppercase",color:C.solution}}>What &ldquo;CIS Control 7&rdquo; means</div>
          <p style={{fontSize:14,lineHeight:1.65,color:C.paper,margin:"6px 0 0"}}>
            The <b>CIS Critical Security Controls</b> are a published checklist of security
            practices, maintained by the Center for Internet Security, a non-profit. There are 18
            controls containing 153 specific safeguards, and real organizations are measured
            against them.
          </p>
          <p style={{fontSize:14,lineHeight:1.65,color:C.paper,margin:"7px 0 0"}}>
            The number on a card is where that practice lives in the list. It matters for two
            reasons. It means the card is not our opinion — someone else already argued about
            what belongs on the list. And it gives you something to look up: when your
            facilitator has links switched on, each card has a <b>Learn more</b> link to its
            control on the CIS website, which opens in a new tab. Read it before you buy if the
            card name alone does not tell you enough — your board stays exactly where you left it.
          </p>
          <p style={{fontSize:14,lineHeight:1.65,color:C.paper,margin:"7px 0 0"}}>
            The controls are also split into three <b>Implementation Groups</b> by how much an
            organization can realistically manage. That is where card costs come from: a
            1-point card is something a small charity can do, a 3-point card needs staff and
            money. Cost is difficulty, not usefulness.
          </p>
        </div>

        <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${C.edge}`}}>
          <div style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".08em",
            textTransform:"uppercase",color:C.solution}}>The cards</div>
          <table style={{width:"100%",fontSize:14,marginTop:7,borderCollapse:"collapse"}}>
            <tbody>
              {[["Foundational","1 point","Basic hygiene. Most of the deck."],
                ["Extended","2 points","Needs someone to run it."],
                ["Advanced","3 points","Half your budget. Rarely the right first move."],
                ["Safeguards","1 point","Practitioner pool only. One narrow CIS safeguard; needs its parent control."],
                ["Modifiers","free","A principle, not a control. Must be justified."]].map(r=>(
                <tr key={r[0]}>
                  <td style={{padding:"3px 10px 3px 0",fontWeight:600,whiteSpace:"nowrap"}}>{r[0]}</td>
                  <td style={{padding:"3px 10px 3px 0",fontFamily:MONO,fontSize:13,
                    color:C.brass,whiteSpace:"nowrap"}}>{r[1]}</td>
                  <td style={{padding:"3px 0",color:C.paper}}>{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${C.edge}`}}>
          <div style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".08em",
            textTransform:"uppercase",color:C.solution}}>Things teams get wrong</div>
          <ul style={{margin:"7px 0 0",paddingLeft:18,fontSize:14,lineHeight:1.7,color:C.paper}}>
            <li>Rating severity by how clever the attack is. Severity is who gets hurt.</li>
            <li>Moving the threat to the top-left corner in Phase 3. Something always gets through.</li>
            <li>Buying the expensive card because it sounds serious. Cost tracks how hard a
              control is to run, not how much it helps you.</li>
            <li>Writing &ldquo;people are the weakest link&rdquo; as a justification. Name a person,
              a system, or how something breaks.</li>
            <li>Agreeing in ninety seconds. If nobody disagreed, you have not finished.</li>
          </ul>
        </div>

        <p style={{fontFamily:MONO,fontSize:13,color:C.muted,lineHeight:1.6,marginTop:18,marginBottom:0}}>
          Ask your facilitator for the full manual, or find it in the project repository
          under docs/.
        </p>
      </div>
    </div>
  );
}


/* A render crash used to blank the page, which mid-session is worse than
   useless — a student cannot tell a bug from a network drop. This turns any
   uncaught render error into something they can read out to the facilitator. */
class Boundary extends React.Component {
  constructor(p){ super(p); this.state={err:null}; }
  static getDerivedStateFromError(err){ return {err}; }
  componentDidCatch(err,info){ console.error("Solutions Table render error:", err, info); }
  render(){
    if(!this.state.err) return this.props.children;
    const msg = String(this.state.err?.message || this.state.err);
    return (
      <div style={{minHeight:"100%",background:C.slate,color:C.paper,fontFamily:SANS,
        padding:"40px 24px"}}>
        <div style={{maxWidth:560,margin:"0 auto"}}>
          <div style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".16em",
            textTransform:"uppercase",color:C.warn}}>Something broke</div>
          <h1 style={{fontSize:25,margin:"6px 0 10px",fontWeight:600}}>
            This screen could not load
          </h1>
          <p style={{fontSize:15,lineHeight:1.65,color:C.paper}}>
            Your team's work is saved — nothing is lost. Reload the page and you should be able
            to carry on. If it happens again, read the line below to your facilitator.
          </p>
          <pre style={{fontFamily:MONO,fontSize:13,lineHeight:1.6,color:C.brass,
            background:C.panel,border:`1px solid ${C.edge}`,borderRadius:4,
            padding:"10px 12px",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{msg}</pre>
          <button style={{...btn("primary"),marginTop:14}}
            onClick={()=>window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}

/* ---------------- root ---------------- */

export default function SolutionsTable(){
  useEffect(()=>{ console.info(`Solutions Table build ${BUILD}`); },[]);
  return <Boundary><SolutionsTableInner/></Boundary>;
}

function SolutionsTableInner(){
  const [localId] = useState(()=>Math.random().toString(36).slice(2,10));
  const [authUid,setAuthUid] = useState(null);
  /* With Firebase the identity is the authenticated uid, which the database
     rules check. Inside a Claude artifact there is no auth, so we fall back to
     a random per-tab id and the role is a convention rather than a rule. */
  const clientId = authUid || localId;
  useEffect(()=>{
    let live = true;
    if (BACKEND.ready) BACKEND.ready.then(u=>{ if(live) setAuthUid(u); }).catch(()=>{});
    return ()=>{ live=false; };
  },[]);
  const [role,setRole] = useState(null);      // "fac" | "player"
  const [teamN,setTeamN] = useState(null);
  const [cfg,setCfg] = useState(null);
  const [teams,setTeams] = useState({});
  const [status,setStatus] = useState("");
  const [help,setHelp] = useState(false);
  const [theme,setTheme] = useState("dark");
  const [scale,setScale] = useState(1);
  /* Personal storage, not shared — one person needing larger text should not
     resize the board for everyone else in the room. */
  useEffect(()=>{
    (async()=>{
      try{
        const r = await window.storage?.get("prefs", false);
        if(r){ const p = JSON.parse(r.value);
          if(p.theme) setTheme(p.theme); if(p.scale) setScale(p.scale); }
      }catch{ /* nothing saved yet */ }
    })();
  },[]);
  const savePrefs = (t,sc)=>{
    setTheme(t); setScale(sc);
    try{ window.storage?.set("prefs", JSON.stringify({theme:t,scale:sc}), false); }catch{}
  };
  ACTIVE = THEMES[theme] || THEMES.dark;
  const [busy,setBusy] = useState(false);
  const poll = useRef(null);

  // Players read only the config and their own team; only the facilitator
  // reads the whole room. Reading all six keys from every client would put a
  // class of twenty at roughly two thousand storage reads a minute.
  const roleRef = useRef({role:null,teamN:null,ids:ALL_TEAMS.slice(0,DEFAULT_TEAMS)});
  roleRef.current = {role,teamN,ids:teamsOf(cfg)};

  const refresh = useCallback(async ()=>{
    const c = await sGet(CFG_KEY);
    if (c) setCfg(c);
    const {role:r, teamN:tn, ids} = roleRef.current;
    if (r === "fac" || r === "projector") {
      const entries = await Promise.all(ids.map(async n=>[n, await sGet(teamKey(n))]));
      const next = {};
      entries.forEach(([n,t])=>{ if(t) next[n]=t; });
      setTeams(next);
    } else if (tn) {
      const t = await sGet(teamKey(tn));
      if (t) setTeams(prev=>({...prev,[tn]:t}));
    } else if (r === "player") {
      // team picker needs to know which seats are taken; read once, not on a loop
      const entries = await Promise.all(ids.map(async n=>[n, await sGet(teamKey(n))]));
      const next = {};
      entries.forEach(([n,t])=>{ if(t) next[n]=t; });
      setTeams(next);
    }
  },[]);

  /* A facilitator who is reading rather than clicking would otherwise look
     absent, and the rules would release the role to whoever asked next. */
  useEffect(()=>{
    if (role!=="fac" || cfg?.facilitatorId!==clientId) return;
    const beat = setInterval(()=>{ sSet(CFG_KEY,{...cfg, heldAt:stamp()}); }, 45000);
    return ()=>clearInterval(beat);
  },[role,cfg,clientId]);

  const teamCount = (cfg?.teamCount ?? DEFAULT_TEAMS);
  useEffect(()=>{
    refresh();
    poll.current = setInterval(refresh, pollMs(teamCount));
    return ()=>clearInterval(poll.current);
  },[refresh,teamCount]);

  // Fetch immediately when the role or team changes rather than waiting a tick.
  useEffect(()=>{ refresh(); },[role,teamN,refresh]);

  useEffect(()=>{
    if (typeof window==="undefined") return;
    const h = window.location.hash.toLowerCase();
    if (h.includes("projector")) setRole("projector");
    else if (h.includes("facilitator")) setRole("fac-gate");
  },[]);

  const stamp = ()=> (BACKEND.serverTime ? BACKEND.serverTime() : Date.now());
  const saveCfg = async (patch)=>{
    setBusy(true);
    // heldAt must be server-set on every config write or the rules reject it
    const next = {...(cfg||{}), ...patch, heldAt:stamp(), updatedAt:Date.now()};
    setCfg(next);
    const ok = await sSet(CFG_KEY,next);
    setStatus(ok?"Saved":`Could not save — ${LAST_ERROR?.code||LAST_ERROR?.message||"see the browser console"}`);
    setBusy(false);
  };
  const saveTeam = async (n,patch)=>{
    setBusy(true);
    const base = teams[n] || blankTeam(n);
    const next = {...base, ...patch, updatedAt:Date.now()};
    setTeams(t=>({...t,[n]:next}));
    const ok = await sSet(teamKey(n),next);
    setStatus(ok?"Saved":`Could not save — ${LAST_ERROR?.code||LAST_ERROR?.message||"see the browser console"}`);
    setBusy(false);
    return ok;
  };

  const shell = (children)=>(
    <div style={{minHeight:"100%",background:C.slate,color:C.paper,fontFamily:SANS,
      padding:"20px 18px 40px", fontSize:`${scale*100}%`, zoom:scale}}>
      <style>{`
        button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible{
          outline:3px solid ${C.brass}; outline-offset:2px}
        input,textarea,select{font-family:${MONO};font-size:14px;background:${C.panel};
          color:${C.paper};border:1px solid ${C.edge};border-radius:3px;padding:8px 10px;
          width:100%;box-sizing:border-box;line-height:1.5}
        textarea{resize:vertical;min-height:64px}
        input::placeholder,textarea::placeholder{color:${C.muted};opacity:1}
        select option{background:${C.panel};color:${C.paper}}
        button:disabled,input:disabled,textarea:disabled,select:disabled{opacity:.55}
        ::selection{background:${C.brass};color:${C.onAccent}}
        @media (prefers-reduced-motion: reduce){*{transition:none!important}}
      `}</style>
      {help && <HelpPanel onClose={()=>setHelp(false)}/>}
      <header style={{maxWidth:1100,margin:"0 auto 22px",display:"flex",
        justifyContent:"space-between",alignItems:"flex-end",gap:12,flexWrap:"wrap"}}>
        <div>
          <div style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".16em",color:C.solution,textTransform:"uppercase"}}>
            Solutions dimension
          </div>
          <div style={{display:"flex",alignItems:"baseline",gap:12}}>
            <h1 style={{fontFamily:SANS,fontSize:27,margin:"3px 0 0",fontWeight:600,letterSpacing:"-.02em"}}>
              Solutions Table
            </h1>
            <button onClick={()=>setHelp(true)} style={{...btn(),fontSize:13,padding:"3px 10px"}}>
              How to play
            </button>
            <span title="Build version — check this matches your latest deploy"
              style={{fontFamily:MONO,fontSize:12.5,color:C.muted,opacity:.6}}>{BUILD}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:7}}>
            <span style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Text</span>
            {[["A",1],["A",1.15],["A",1.3]].map(([lbl,v],i)=>(
              <button key={v} onClick={()=>savePrefs(theme,v)}
                aria-pressed={scale===v}
                aria-label={`Text size ${["normal","large","larger"][i]}`}
                style={{...btn(scale===v?"primary":"ghost"),
                  fontSize:[13,15,18][i], lineHeight:1, padding:"3px 9px"}}>{lbl}</button>
            ))}
            <button onClick={()=>savePrefs(theme==="dark"?"light":"dark",scale)}
              style={{...btn(),fontSize:12.5,padding:"4px 10px",marginLeft:4}}>
              {theme==="dark"?"Light":"Dark"}
            </button>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"flex-start",gap:18}}>
          {cfg?.timerEnd && <HeaderClock end={cfg.timerEnd}/>}
          <div style={{fontFamily:MONO,fontSize:13,color:C.muted,textAlign:"right"}}>
            {cfg?.org ? <div style={{color:C.paper}}>{cfg.org}</div> : null}
            <div>{PHASES.find(p=>p.id===(cfg?.phase||"setup"))?.label}</div>
            {status && <div style={{color:C.brass,marginTop:3}}>{status}</div>}
          </div>
        </div>
      </header>
      <main style={{maxWidth:1100,margin:"0 auto"}}>{children}</main>
    </div>
  );

  if (role==="projector") return <Projector cfg={cfg} teams={teams} ids={teamsOf(cfg)} onExit={()=>setRole(null)}/>;
  if (role===null) return shell(<Gate onPlayer={()=>setRole("player")} onFac={()=>setRole("fac-gate")}
    onProjector={()=>setRole("projector")} cfg={cfg}/>);
  if (role==="fac-gate") return shell(
    <FacGate cfg={cfg} clientId={clientId} authReady={!!authUid} onClaim={async(code)=>{
      const c = await sGet(CFG_KEY);
      const STALE_MS = 120000;              // matches the grace period in the rules
      const live = c?.heldAt && (Date.now() - c.heldAt) < STALE_MS;
      if (c?.facilitatorId && c.facilitatorId!==clientId && live) {
        const h = await hashCode(code);
        const ok = c.claimHash ? c.claimHash===h : c.claimCode ? c.claimCode===code : false;
        if (!ok) return "Someone is currently running this session. Ask them for the code, "
          + "or wait about two minutes after they stop and the role frees itself.";
      }
      const s1 = scenarioById(1);
      const fresh = !c?.org && !c?.scenario;   // nothing set up yet
      // A session already running on 3×3 keeps it; anything new starts on 5×5.
      const gridSize = c?.gridSize ?? (fresh ? 5 : 3);
      const claimHash = await hashCode(code);
      const wrote = await sSet(CFG_KEY, {...(c||{}), facilitatorId:clientId, claimHash, claimCode:null,
        condition: c?.condition || URL_CONDITION || "solutions",
        phase:c?.phase||"setup", dims:c?.dims||DEFAULT_DIMS,
        teamCount:c?.teamCount??DEFAULT_TEAMS, gridSize,
        scenarioId:c?.scenarioId ?? (fresh ? s1.id : undefined),
        budget:c?.budget ?? (fresh ? s1.budget : 6),
        org:c?.org || (fresh ? s1.org : ""),
        scenario:c?.scenario || (fresh ? s1.text : ""),
        heldAt: stamp(), updatedAt: Date.now()});
      if (!wrote) {
        // Refused by the rules. Say so plainly instead of pretending it worked
        // and then bouncing to the displaced screen a second later.
        return "The database refused the claim. Either someone is actively running "
          + "this session — wait two minutes after their last action and try again — or "
          + "the session is stuck from an earlier version. A facilitator can clear it in "
          + "the Firebase console under Realtime Database, or you can start a clean one "
          + "by adding ?session=" + Math.random().toString(36).slice(2,7) + " to the URL.";
      }
      await refresh();
      setRole("fac"); return null;
    }} onBack={()=>setRole(null)}/>
  );
  if (role==="fac") return shell(
    <Facilitator cfg={cfg} teams={teams} ids={teamsOf(cfg)} saveCfg={saveCfg} saveTeam={saveTeam}
      busy={busy} clientId={clientId} onExit={()=>setRole(null)}
      onReclaim={()=>setRole("fac-gate")}/>
  );
  return shell(
    <Player cfg={cfg} teams={teams} ids={teamsOf(cfg)} teamN={teamN} setTeamN={setTeamN}
      saveTeam={saveTeam} busy={busy} clientId={clientId}
      onExit={()=>{setRole(null);setTeamN(null);}}/>
  );
}

/* ---------------- gates ---------------- */

function Gate({onPlayer,onFac,onProjector,cfg}){
  return (
    <div style={{maxWidth:520}}>
      <p style={{color:C.muted,fontSize:15,lineHeight:1.6,marginTop:0}}>
        A shared board for the Solutions dimension. Everyone opens the same link.
        One person takes the facilitator role; everyone else joins a team.
      </p>
      {cfg?.org && (
        <div style={{background:C.panel,border:`1px solid ${C.edge}`,borderRadius:4,padding:12,marginBottom:16}}>
          <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted,textTransform:"uppercase",letterSpacing:".08em"}}>Session in progress</div>
          <div style={{fontSize:16,marginTop:4}}>{cfg.org}</div>
        </div>
      )}
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button style={{...btn("primary"),padding:"11px 20px"}} onClick={onPlayer}>Join a team</button>
        <button style={{...btn(),padding:"11px 20px"}} onClick={onFac}>Take the facilitator role</button>
        <button style={{...btn(),padding:"11px 20px"}} onClick={onProjector}>Open the projector view</button>
      </div>
      <p style={{color:C.muted,fontSize:13.5,marginTop:20,lineHeight:1.6,fontFamily:MONO}}>
        The board refreshes every few seconds. Facilitators can also open this
        with <span style={{color:C.paper}}>#facilitator</span> at the end of the URL.
      </p>
    </div>
  );
}

function FacGate({onClaim,onBack,cfg,clientId,authReady}){
  const [code,setCode] = useState("");
  const [err,setErr] = useState(null);
  const claimed = cfg?.facilitatorId && cfg.facilitatorId!==clientId;
  /* Claiming before anonymous sign-in resolves would write a random local id
     as the holder, and the database rules — which compare against auth.uid —
     would refuse every later write. */
  const waiting = BACKEND.ready && !authReady;
  return (
    <div style={{maxWidth:420}}>
      <Section title="Facilitator">
        <p style={{color:C.muted,fontSize:14.5,lineHeight:1.6,marginTop:0}}>
          {claimed
            ? "Someone already holds this role. Enter the same code they used to take it over — useful if a browser was closed mid-session."
            : "Pick a code and share it only with co-facilitators. It is what lets you reclaim the role if your browser closes."}
        </p>
        <input value={code} onChange={e=>setCode(e.target.value)} placeholder="Facilitator code"
          disabled={waiting}
          onKeyDown={e=>{ if(e.key==="Enter"&&code.trim()&&!waiting) onClaim(code.trim()).then(setErr); }}/>
        {waiting && <div style={{fontFamily:MONO,fontSize:13,color:C.muted,marginTop:8}}>
          Signing in…</div>}
        {err && <div style={{color:C.warn,fontFamily:MONO,fontSize:13,marginTop:8}}>{err}</div>}
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button style={btn("primary")} disabled={!code.trim()||waiting}
            onClick={()=>onClaim(code.trim()).then(setErr)}>Claim the role</button>
          <button style={btn()} onClick={onBack}>Back</button>
        </div>
      </Section>
    </div>
  );
}

/* ---------------- facilitator ---------------- */

function Facilitator({cfg,teams,ids,saveCfg,saveTeam,busy,clientId,onExit,onReclaim}){
  const [org,setOrg] = useState(cfg?.org||"");
  const [scenario,setScenario] = useState(cfg?.scenario||"");
  const [pick,setPick] = useState(1);
  const [roleMsg,setStatusLocal] = useState("");
  // Outcome of the last board-wide action, shown under the phase controls.
  const [note,setStatus] = useState("");
  const deckMode = cfg?.expansion ? (cfg?.safeguards ? "sg" : "exp") : "base";
  /* Switching the safeguard pool on or off moves the budget by two, so the
     extra ways to spend come with something to spend. */
  const setDeck = (mode)=>{
    const next = {expansion:mode!=="base", safeguards:mode==="sg"};
    const was = safeguardsOn(cfg), will = safeguardsOn({...cfg, ...next});
    const b = cfg?.budget ?? 6;
    saveCfg({...next, budget: was===will ? b : will ? b+2 : Math.max(3, b-2)});
  };
  const grid = gridOf(cfg);
  const dealSize = DEAL_SIZES.includes(cfg?.dealSize) ? cfg.dealSize : 8;
  // once any team has acted, the arm is fixed for the rest of the session
  const started = ids.some(n=>{
    const t = teams[n];
    return t?.joined && ((t.purchases||[]).length || (t.measures||[]).length || t.pre);
  });
  const joinUrl = (()=>{
    try{
      const u = new URL(window.location.href); u.hash = "";
      return u.toString().replace(/[?&]condition=[^&]*/,"");
    }catch{ return ""; }
  })();
  const loaded = scenFor(cfg);

  const loadScenario = async (id)=>{
    const x = scenarioById(id); if(!x) return;
    setOrg(x.org); setScenario(x.text);
    // Pre-built scenarios supply the threat model, so lock it. Teams that join
    // later read it from the scenario rather than needing it written to them.
    // The safeguard pool adds ways to spend without adding points, so it adds two.
    await saveCfg({scenarioId:x.id, org:x.org, scenario:x.text,
      budget:x.budget + (safeguardsOn({...cfg, scenarioId:x.id}) ? 2 : 0),
      phase:"p1", timerEnd:null, threatLocked:true});
    for (const n of ids){
      const t = teams[n]; if(!t?.joined) continue;
      await saveTeam(n,{threat:{...x.draw}});
    }
  };
  const applyDraw = async (x)=>{
    for (const n of ids){
      const t = teams[n]; if(!t?.joined) continue;
      await saveTeam(n,{threat:{...x.draw}});
    }
    // Teams that are handed a threat should not be able to re-roll it
    await saveCfg({threatLocked:true});
  };
  const phase = cfg?.phase||"setup";
  const budget = cfg?.budget??6;

  /* A hand containing nothing that addresses the drawn threat punishes a team for
     the deal rather than for its reasoning, and across teams it makes deal luck an
     uncontrolled variable. So every hand is guaranteed at least one strong and one
     partial card for the loaded scenario, and by default every team is dealt the
     same eight — which is what "standardized deal composition" has to mean if the
     two arms are to be compared.

     Deals larger than eight raise the guarantee to two of each, so a wider hand
     does not dilute the relevant cards. Delayed threats in play each get one
     strong card too. Keys can name modifier cards (scenario 9 does), which are
     never dealt as controls, and cards a team already owns are skipped, so a
     guarantee can come up short; `short` reports that rather than hiding it.
     The hand is shuffled — the guaranteed cards used to be dealt first, which
     told an observant team where the answers were. */
  const deck = deckOf(cfg);
  const inDeck = (id)=>deck.some(c=>c.id===id);
  const buildHand = (owned, scen, size=8, injects=[])=>{
    const must = [];
    const take = (ids,k)=>{
      const got = sample((ids||[]).filter(id=>inDeck(id) && !owned.includes(id) && !must.includes(id)), k);
      must.push(...got);
      return got.length;
    };
    const need = size>8 ? 2 : 1;
    const short = [];
    if (scen){
      const s = take(scen.strong,need), p = take(scen.partial,need);
      if (s<need) short.push(`${s} of ${need} strong`);
      if (p<need) short.push(`${p} of ${need} partial`);
    }
    injects.forEach(x=>take(x?.strong,1));
    const quota = {...((expansionOn(cfg) ? TIER_MIX_EXP : TIER_MIX)[size] || {F:size-2,E:1,A:1})};
    must.forEach(id=>{ const tr = card(id).tier; quota[tr] = Math.max(0, quota[tr]-1); });
    const pool = (tier)=>deck.filter(c=>c.tier===tier && !owned.includes(c.id) && !must.includes(c.id)).map(c=>c.id);
    let rest = [...sample(pool("F"),quota.F), ...sample(pool("E"),quota.E), ...sample(pool("A"),quota.A)];
    // a tier that ran dry is topped up from whatever is left in the deck
    const gap = size - must.length - rest.length;
    if (gap>0){
      const left = deck.map(c=>c.id).filter(id=>!owned.includes(id) && !must.includes(id) && !rest.includes(id));
      rest = [...rest, ...sample(left, gap)];
    }
    const all = [...must, ...rest].slice(0,size);
    return {hand: sample(all, all.length), short};
  };

  /* The safeguard row: four cards, at least one relevant to the scenario or a
     delayed threat in play. A relevant safeguard whose parent is in the hand or
     already owned is preferred, so the guarantee is one a team can act on. */
  const buildSafeguards = (owned, scen, hand, injects=[])=>{
    const pool = SAFEGUARDS.map(s=>s.id).filter(id=>!owned.includes(id));
    const keys = [scen, ...injects].filter(Boolean);
    const relevant = pool.filter(id=>keys.some(k=>k.strong.includes(id) || k.partial.includes(id)));
    const reachable = relevant.filter(id=>parentHeld(card(id), [...hand, ...owned]));
    const must = sample(reachable.length ? reachable : relevant, 1);
    const all = [...must, ...sample(pool.filter(id=>!must.includes(id)), SAFEGUARD_DEAL-must.length)];
    return sample(all, all.length);
  };

  const dealAll = async ()=>{
    const scen = scenFor(cfg);
    const shared = cfg?.sameDeal !== false;
    const withSg = safeguardsOn(cfg);
    const injectsOf = (t)=>(t?.injects||[]).map(x=>injectFor(x.id, cfg)).filter(Boolean);
    // Teams advance together, so they share delayed threats; use the union.
    const roomInjects = Array.from(new Set(ids.flatMap(n=>teams[n]?.joined ? (teams[n].injects||[]).map(x=>x.id) : [])))
      .map(id=>injectFor(id, cfg)).filter(Boolean);
    const common = shared ? buildHand([], scen, dealSize, roomInjects) : null;
    const commonSg = shared && withSg ? buildSafeguards([], scen, common.hand, roomInjects) : [];
    const commonMods = shared ? sample(modsOf(cfg).map(m=>m.id),3) : null;
    const shortBy = [];
    for (const n of ids){
      const t = teams[n]; if(!t?.joined) continue;
      const owned = t.everBought||[];
      // an identical deal still has to skip cards a team already installed
      const same = shared && !owned.length;
      const dealt = same ? common : buildHand(owned, scen, dealSize, injectsOf(t));
      const sgHand = !withSg ? [] : same ? commonSg : buildSafeguards(owned, scen, dealt.hand, injectsOf(t));
      if (dealt.short.length) shortBy.push(`${t.name} (${dealt.short.join(", ")})`);
      await saveTeam(n,{hand:dealt.hand, sgHand,
        modHand: shared ? commonMods : sample(modsOf(cfg).map(m=>m.id),3),
        purchases:[], modifiers:[]});
    }
    setStatus((shared ? `Dealt — every team has the same ${dealSize} cards.`
                      : `Dealt — ${dealSize} cards each, varying by team.`)
      + (withSg ? ` Plus ${SAFEGUARD_DEAL} safeguards each.` : "")
      + (shortBy.length ? ` Guarantee not met for ${shortBy.join("; ")}: the scenario's key names too few control cards of that kind, or the team already owns them.` : ""));
  };
  const pending = [];
  ids.forEach(n=>{ (teams[n]?.modifiers||[]).forEach((m,i)=>{ if(m.status==="pending") pending.push({n,i,...m}); }); });

  const newRound = async ()=>{
    for (const n of ids){
      const t = teams[n];
      if(!t?.joined) continue;
      await saveTeam(n,{...blankTeam(n), name:t.name, members:t.members,
        joined:true, ownerUid:t.ownerUid});
    }
    await saveCfg({phase:"p1", timerEnd:null});
    setStatus("Board cleared. Teams are still seated — set the new scenario above.");
  };

  /* Campaign advance. Keeps the threat and carries the board forward instead of
     clearing it, which is the difference between a new round and a next
     engagement. Drift applies only where a team played Deferred Investment,
     because that card is the promise the drift is the price of. */
  /* Who would realize if we advanced now. The facilitator needs this before
     pressing the button, because realization is a moment to run aloud, not a
     red box a team discovers on its own. */
  const willRealize = (()=>{
    const scen = scenFor(cfg);
    if(!scen) return [];
    const top = grid.n-1;
    return ids.filter(n=>{
      const t = teams[n]; if(!t?.joined) return false;
      const deferred = (t.modifiers||[]).some(m=>m.id===28 && m.status==="accepted");
      const extra = deferred ? 1 : 0;
      const pos = t.post || t.pre;
      if (pos && pos.l + coverage(t.purchases||[], scen, grid).move + extra > top) return true;
      const installed = [...(t.everBought||[]), ...(t.purchases||[])];
      return (t.injects||[]).some(x=>{
        const p = x.post || x.pre;
        return p && p.l + coverage(installed, injectFor(x.id, cfg), grid).move + extra > top;
      });
    });
  })();
  const injectsOn = cfg?.injectsOn !== false;
  const upcomingInject = (()=>{
    const scen = scenFor(cfg);
    const seated = ids.map(n=>teams[n]).filter(t=>t?.joined);
    if (!injectsOn || !scen || !seated.length) return null;
    const t = seated[0];
    if ((t.injects||[]).length >= MAX_INJECTS) return null;
    return injectFor(nextInjectFor(scen, (t.injects||[]).map(x=>x.id), cfg), cfg);
  })();

  const nextEngagement = async ()=>{
    const scen = scenFor(cfg);
    const base = cfg?.budget ?? 6;
    const top = grid.n-1;
    for (const n of ids){
      const t = teams[n];
      if(!t?.joined) continue;

      const deferred = (t.modifiers||[]).some(m=>m.id===28 && m.status==="accepted");
      // Controls stay installed. An organization does not forget its backups.
      const installed = Array.from(new Set([...(t.everBought||[]), ...(t.purchases||[])]));
      const cov = coverage(t.purchases||[], scen, grid);
      // Without a loaded scenario there is no key to score against, so treat an
      // empty portfolio as unaddressed rather than freezing the board.
      if (!scen && !(t.purchases||[]).length) { cov.move = 1; cov.verdict = "unaddressed"; }

      /* One threat's likelihood moves on coverage; past the top row it is
         realized. The incident forces attention, so the threat resets to the
         middle rather than pinning at Very Likely forever. A team can climb out. */
      const step = (pos, move)=>{
        if (!pos) return {pos:null, realized:false, drifted:false};
        const target = pos.l + move + (deferred ? 1 : 0);   // deferring costs one cell of progress
        if (target > top) return {pos:{l:middleRow(grid), s:pos.s}, realized:true, drifted:false};
        const clamped = Math.max(0, target);
        // likelihood only; severity never moves
        return {pos:{l:clamped, s:pos.s}, realized:false, drifted:clamped > pos.l};
      };

      const main = step(t.post || t.pre || null, cov.move);
      let pos = main.pos;
      let drift = (t.drift||0) + (main.drifted ? 1 : 0);
      const hit = main.realized ? [scen?.title || "The main threat"] : [];

      /* Delayed threats already on the board move on their own keys. They are
         scored against everything installed, not just this round's purchases:
         a new threat meets every control the organization already has. */
      const injects = (t.injects||[]).map(x=>{
        const def = injectFor(x.id, cfg);
        const r = step(x.post || x.pre || null, coverage(installed, def, grid).move);
        if (r.realized) hit.push(def?.title || "A new threat");
        return {...x, pre:r.pos, post:null};
      });
      // And, if the facilitator has them on, a new one lands on top.
      let arrived = null;
      if (injectsOn && scen && injects.length < MAX_INJECTS){
        const id = nextInjectFor(scen, injects.map(x=>x.id), cfg);
        if (id){ injects.push({id, since:(t.engagement||1)+1, pre:null, post:null}); arrived = id; }
      }
      const realized = hit.length
        ? {at:Date.now(), outcome:resolveRealization(installed), threats:hit} : null;

      // Fresh allocation each engagement. Banking adds to it; an unhandled
      // incident costs a point of it, which is the Response line made real.
      // Standing risks move on the same logic: addressed ones ease, ignored ones worsen.
      const scenStanding = scen?.standing || [];
      const standingPos = {};
      let standingIgnored = 0;
      scenStanding.forEach(r=>{
        const cur = (t.standingPos||{})[r.id] || onGrid(r.pos, grid);
        const covered = r.cards.some(c=>installed.includes(c));
        const l = covered ? Math.max(0, cur.l-1) : Math.min(top, cur.l+1);
        if(!covered) standingIgnored++;
        standingPos[r.id] = {l, s:cur.s};
      });

      let nextBudget = base + (deferred ? 4 : 0);
      if (realized && !installed.includes(13)) nextBudget = Math.max(3, nextBudget-1);

      await saveTeam(n,{
        ...blankTeam(n), name:t.name, members:t.members, ownerUid:t.ownerUid, joined:true,
        threat:t.threat, pre:pos, post:null,
        engagement:(t.engagement||1)+1, everBought:installed, drift, realized,
        standingPos, standingIgnored, injects,
        lastVerdict: main.realized ? "realized" : cov.verdict,
        budgetOverride: nextBudget,
      });
      if (arrived) setStatus(`Next engagement. Delayed threat on every board: ${injectById(arrived)?.title}. Teams place it in Phase 1.`);
    }
    await saveCfg({phase:"p1", timerEnd:null});
    if (!injectsOn || !upcomingInject)
      setStatus("Next engagement. Controls stay installed; budgets refreshed; threats moved on coverage.");
  };

  const endSession = async ()=>{
    const label = new Date().toISOString().slice(0,16).replace(/[:T]/g,"-");
    const snapshot = {cfg, teams, archivedAt:Date.now()};
    await sSet(`archive:${label}`, snapshot);          // keep a copy first
    for (const n of ids) await sSet(teamKey(n), blankTeam(n));
    await saveCfg({phase:"setup", org:"", scenario:"", timerEnd:null});
    // setTeams lives in the root component; the next poll picks up the blank boards.
    setStatus(`Board cleared. A copy was kept as archive:${label}.`);
  };

  /* Columns added after Fall 2026 are appended at the end so analysis scripts
     that index by position keep working. The header used to list threat_method
     and threat_impact before verdict and standing_ignored while the rows wrote
     them after; it now matches the rows. */
  const exportData = ()=>{
    const at = (p)=> p ? `${grid.lik[p.l]} / ${grid.sev[p.s]}` : "";
    const rows = [["team","org","scenario","condition","measures_count","measures","engagement","drift","realized",
      "verdict","standing_ignored","threat_method","threat_impact","threat_resource","threat_motive","pre_likelihood","pre_severity","post_likelihood",
      "post_severity","budget","spent","purchases","ever_purchased","modifiers_accepted","residual","debrief_1","debrief_2","debrief_3","carry_forward","recommendation",
      "grid_size","deal_size","detail","hand","pre_why","post_why","new_threats","new_threat_positions","realized_threats",
      "expansion","safeguards","safeguard_hand","safeguards_purchased"]];
    ids.forEach(n=>{
      const t=teams[n]; if(!t?.joined) return;
      const spent=(t.purchases||[]).reduce((s,id)=>s+(card(id)?.cost||0),0);
      rows.push([t.name,cfg?.org||"",scenarioById(cfg?.scenarioId)?.title||"",
        cfg?.condition||"solutions",(t.measures||[]).length,(t.measures||[]).join("; "),t.engagement||1,t.drift||0,t.realized?"yes":"no",
        t.lastVerdict||"",t.standingIgnored??"",t.threat.method,t.threat.impact,t.threat.resource,t.threat.motive,
        t.pre?grid.lik[t.pre.l]:"",t.pre?grid.sev[t.pre.s]:"",
        t.post?grid.lik[t.post.l]:"",t.post?grid.sev[t.post.s]:"",
        t.budgetOverride ?? cfg?.budget ?? 6, spent,
        (t.purchases||[]).map(id=>card(id)?.name).join("; "),
        (t.everBought||[]).map(id=>card(id)?.name).join("; "),
        (t.modifiers||[]).filter(m=>m.status==="accepted").map(m=>card(m.id)?.name).join("; "),
        (t.residual||"").replace(/\n/g," "),
        ((t.debriefAnswers||{})[0]||"").replace(/\n/g," "),
        ((t.debriefAnswers||{})[1]||"").replace(/\n/g," "),
        ((t.debriefAnswers||{})[2]||"").replace(/\n/g," "),
        (t.carryAnswer||"").replace(/\n/g," "),
        (t.recommendation||"").replace(/\n/g," "),
        grid.n, dealSize, cfg?.detail||"standard",
        (t.hand||[]).map(id=>card(id)?.name).join("; "),
        (t.preWhy||"").replace(/\n/g," "), (t.postWhy||"").replace(/\n/g," "),
        (t.injects||[]).map(x=>injectById(x.id)?.title||x.id).join("; "),
        (t.injects||[]).map(x=>`${injectById(x.id)?.title||x.id}: ${at(x.pre)||"unplaced"} -> ${at(x.post)||"unplaced"}`).join("; "),
        (t.realized?.threats||[]).join("; "),
        expansionOn(cfg) ? "on" : "off", safeguardsOn(cfg) ? "on" : "off",
        (t.sgHand||[]).map(id=>card(id)?.name).join("; "),
        (t.purchases||[]).filter(id=>card(id)?.safeguard).map(id=>card(id)?.name).join("; ")]);
    });
    const csv = rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    const a=document.createElement("a"); a.href=url; a.download="solutions-session.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  /* If another device claimed the role, stop issuing commands. Two facilitators
     fighting over the phase is worse than one being locked out. */
  const displaced = cfg?.facilitatorId && cfg.facilitatorId !== clientId;
  if (displaced) {
    return (
      <div style={{maxWidth:460}}>
        <Section title="You no longer hold this role">
          <p style={{color:C.muted,fontSize:14.5,lineHeight:1.6,marginTop:0}}>
            Another device claimed the facilitator role for this session. To avoid two
            people changing the phase at once, this window has stopped.
          </p>
          <div style={{display:"flex",gap:8}}>
            <button style={btn("primary")} onClick={onReclaim}>Take it back</button>
            <button style={btn()} onClick={onExit}>Leave</button>
          </div>
        </Section>
      </div>
    );
  }

  const releaseRole = async ()=>{
    await saveCfg({facilitatorId:null, claimHash:null, claimCode:null});
    onExit();
  };
  const changeCode = async ()=>{
    const next = window.prompt("New facilitator code. Share it only with co-facilitators.");
    if(!next || !next.trim()) return;
    await saveCfg({claimHash: await hashCode(next.trim()), claimCode:null});
    setStatusLocal("Code changed. The old one no longer works.");
  };

  return (
    <div style={{display:"grid",gridTemplateColumns:"minmax(280px,1fr) minmax(300px,1.3fr)",gap:26,alignItems:"start"}}>
      <div>
        <Section title="Condition">
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {[["solutions","Solutions deck"],["control","Control — no Solutions cards"]].map(([v,lbl])=>(
              <button key={v} disabled={busy || started}
                onClick={()=>saveCfg({condition:v})}
                style={{...btn((cfg?.condition||"solutions")===v?"primary":"ghost"),fontSize:13}}>
                {lbl}
              </button>
            ))}
          </div>
          <p style={{fontFamily:MONO,fontSize:12.5,color:C.muted,lineHeight:1.6,marginTop:7}}>
            {started
              ? "Locked — teams have started. Changing arms mid-session would invalidate the data."
              : (cfg?.condition==="control"
                  ? "Teams place the threat and list the measures they would recommend, with no cards and no budget. Guidance, timing and interface are identical to the other arm."
                  : "Teams place the threat, then buy controls against a budget. Both arms also list the measures they raised, so breadth is comparable.")}
          </p>
          <div style={{marginTop:10,paddingTop:9,borderTop:`1px solid ${C.edge}`}}>
            <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted,marginBottom:5}}>Links to share</div>
            {[["Players",joinUrl],["Projector",joinUrl+"#projector"]].map(([lbl,u])=>(
              <div key={lbl} style={{display:"flex",gap:7,alignItems:"center",marginBottom:5}}>
                <span style={{fontFamily:MONO,fontSize:12.5,color:C.muted,minWidth:64}}>{lbl}</span>
                <input readOnly value={u} onFocus={e=>e.target.select()} style={{flex:1}}/>
              </div>
            ))}
            <p style={{fontFamily:MONO,fontSize:12.5,color:C.muted,lineHeight:1.6,marginTop:4}}>
              The arm is stored in the session, so students cannot switch it from their URL.
            </p>
          </div>
        </Section>

        <Section title="Scenario">
          <div style={{marginBottom:11}}>
            <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Deck</label>
            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
              {[["base","Base — 21 cards"],
                ["exp",`Expansion — +${EXP_SOLUTIONS.length} controls, +${EXP_MODIFIERS.length} modifiers`],
                ["sg",`Expansion + ${SAFEGUARDS.length} safeguards`]].map(([v,lbl])=>(
                <button key={v} disabled={busy} onClick={()=>setDeck(v)}
                  style={{...btn(deckMode===v?"primary":"ghost"),fontSize:13}}>{lbl}</button>
              ))}
            </div>
            <p style={{fontFamily:MONO,fontSize:12.5,color:C.muted,lineHeight:1.6,marginTop:6}}>
              {expansionOn(cfg)
                ? <>Adds {EXP_SOLUTIONS.map(c=>c.name).join(", ")}; the modifiers {EXP_MODIFIERS.map(m=>m.name).join(" and ")};
                    three scenarios (15–17); and two more delayed threats. Every base scenario's key scores
                    the new cards. Applies from the next deal.
                    {!cfg?.expansion && <span style={{color:C.brass}}> On because the loaded scenario needs it.</span>}</>
                : "Base keeps the deck identical to earlier sessions. Use an expansion for practitioner rooms."}
            </p>
            {safeguardsOn(cfg) && (
              <p style={{fontFamily:MONO,fontSize:12.5,color:C.muted,lineHeight:1.6,marginTop:4}}>
                Each team also gets a row of {SAFEGUARD_DEAL} safeguards — single CIS safeguards no card
                covers, 1 point each, bought from the same budget. A safeguard needs its parent
                control owned or bought this round. Budget is +2 while the pool is on.
              </p>
            )}
          </div>
          <div style={{display:"flex",gap:7,marginBottom:8,flexWrap:"wrap"}}>
            <select value={pick} onChange={e=>setPick(Number(e.target.value))} style={{flex:"1 1 180px"}}>
              {SCENARIOS.filter(x=>!x.exp || expansionOn(cfg)).map(x=>(
                <option key={x.id} value={x.id} style={{background:C.panel}}>
                  {x.id}. {x.title}{x.care?" (care)":""}{x.exp?" (expansion)":x.pro?" (practitioner)":""}
                </option>
              ))}
            </select>
            <button style={btn("primary")} disabled={busy} onClick={()=>loadScenario(pick)}>Load</button>
          </div>
          {loaded && (
            <div style={{border:`1px solid ${C.edge}`,borderRadius:4,padding:11,background:C.panel}}>
              <div style={{fontFamily:MONO,fontSize:12.5,color:C.solution,textTransform:"uppercase",
                letterSpacing:".08em"}}>Teaching target — facilitator only</div>
              <div style={{fontSize:14,lineHeight:1.55,margin:"5px 0 9px"}}>{loaded.target}</div>
              {loaded.care && (
                <div style={{fontFamily:MONO,fontSize:13,color:C.warn,lineHeight:1.55,marginBottom:9}}>
                  May land on personal experience. Offer the redraw to the team before reading it.
                </div>
              )}
              <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Expert key</div>
              <div style={{fontSize:13.5,lineHeight:1.6,marginTop:4}}>
                <span style={{color:C.ok}}>Strong:</span> {loaded.strong.map(i=>card(i)?.name).join(", ")}<br/>
                <span style={{color:C.brass}}>Partial:</span> {loaded.partial.map(i=>card(i)?.name).join(", ")}<br/>
                <span style={{color:C.muted}}>Weak here:</span> {loaded.weak.map(i=>card(i)?.name).join(", ")}
              </div>
              {loaded.env && (
                <details style={{marginTop:9}}>
                  <summary style={{fontFamily:MONO,fontSize:12.5,color:C.muted,cursor:"pointer"}}>
                    Technical brief — teams see it when detail is Technical
                  </summary>
                  <ul style={{margin:"6px 0 0",paddingLeft:18,fontSize:13,lineHeight:1.55}}>
                    {loaded.env.map((x,i)=><li key={i} style={{marginBottom:3}}>{x}</li>)}
                  </ul>
                </details>
              )}
              {loaded.inject && (
                <details style={{marginTop:7}}>
                  <summary style={{fontFamily:MONO,fontSize:12.5,color:C.muted,cursor:"pointer"}}>
                    Delayed threat — {loaded.inject.title}
                  </summary>
                  <div style={{fontSize:13,lineHeight:1.55,marginTop:6}}>{loaded.inject.text}</div>
                  <div style={{fontSize:13,lineHeight:1.6,marginTop:5}}>
                    <span style={{color:C.ok}}>Strong:</span> {loaded.inject.strong.map(i=>card(i)?.name).join(", ")}<br/>
                    <span style={{color:C.brass}}>Partial:</span> {loaded.inject.partial.map(i=>card(i)?.name).join(", ")}
                  </div>
                </details>
              )}
              <button style={{...btn(),marginTop:10,width:"100%",fontSize:13}} disabled={busy}
                onClick={()=>applyDraw(loaded)}>
                Re-deal the suggested threat model to every team
              </button>
              <div style={{display:"flex",gap:6,marginTop:7,alignItems:"center"}}>
                <span style={{fontFamily:MONO,fontSize:12.5,color:C.muted,flex:1}}>
                  Threat cards {cfg?.threatLocked?"locked":"open to teams"}
                </span>
                <button style={{...btn(),fontSize:12.5,padding:"3px 9px"}}
                  onClick={()=>saveCfg({threatLocked:!cfg?.threatLocked})}>
                  {cfg?.threatLocked?"Unlock":"Lock"}
                </button>
              </div>
            </div>
          )}
        </Section>

        <Section title="Session" right={<button style={btn()} onClick={onExit}>Leave</button>}>
          <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Client organization</label>
          <input value={org} onChange={e=>setOrg(e.target.value)} placeholder="e.g. a volunteer-run food bank"
            onBlur={()=>saveCfg({org})} style={{marginBottom:10}}/>
          <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Scenario read aloud</label>
          <textarea value={scenario} onChange={e=>setScenario(e.target.value)} onBlur={()=>saveCfg({scenario})}
            placeholder="One or two sentences the teams all start from."/>

          <div style={{marginTop:12}}>
            <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Audience — sets the two options below it</label>
            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
              {[["Students",{dealSize:8,detail:"standard"}],
                ["Practitioners",{dealSize:12,detail:"technical"}]].map(([lbl,p])=>(
                <button key={lbl} onClick={()=>saveCfg(p)}
                  style={{...btn(dealSize===p.dealSize && (cfg?.detail||"standard")===p.detail?"primary":"ghost"),fontSize:13}}>
                  {lbl}</button>
              ))}
            </div>
          </div>

          <div style={{marginTop:10}}>
            <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Scenario detail</label>
            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
              {[["standard","Standard — story only"],["technical","Technical — story plus environment brief"]].map(([v,lbl])=>(
                <button key={v} onClick={()=>saveCfg({detail:v})}
                  style={{...btn((cfg?.detail||"standard")===v?"primary":"ghost"),fontSize:13}}>{lbl}</button>
              ))}
            </div>
            <p style={{fontFamily:MONO,fontSize:12.5,color:C.muted,lineHeight:1.6,marginTop:6}}>
              Technical adds five to seven lines of systems, configuration and contracts to every
              team's screen. Reading takes longer, so the Phase 1 timer default rises to 10 minutes.
            </p>
          </div>

          <div style={{marginTop:10}}>
            <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Cards dealt to each team</label>
            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
              {DEAL_SIZES.map(k=>(
                <button key={k} onClick={()=>saveCfg({dealSize:k})}
                  style={{...btn(dealSize===k?"primary":"ghost"),fontSize:13}}>
                  {k}{k===8?" · default":""}
                </button>
              ))}
            </div>
            <p style={{fontFamily:MONO,fontSize:12.5,color:C.muted,lineHeight:1.6,marginTop:6}}>
              Above 8, every hand holds at least two strong and two partial cards for the
              scenario instead of one of each. The deck has 21 controls, so 14 shows two thirds
              of it and the budget becomes the only real constraint.
            </p>
          </div>

          <div style={{marginTop:10}}>
            <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Risk matrix</label>
            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
              {[3,5].map(k=>(
                <button key={k} disabled={busy || started} onClick={()=>saveCfg({gridSize:k})}
                  style={{...btn(grid.n===k?"primary":"ghost"),fontSize:13}}>
                  {k}×{k}{k===3?" · original study":""}
                </button>
              ))}
            </div>
            <p style={{fontFamily:MONO,fontSize:12.5,color:C.muted,lineHeight:1.6,marginTop:6}}>
              {started
                ? "Locked — teams have placed threats. New round clears the board and unlocks it."
                : "5×5 gives room to argue that a control moved a threat one notch. Use 3×3 when the data must compare with earlier sessions."}
            </p>
          </div>

          <div style={{marginTop:10}}>
            <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Learn-more links on cards</label>
            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
              {[[true,"On"],[false,"Off"]].map(([v,lbl])=>(
                <button key={lbl} onClick={()=>saveCfg({cisLinks:v})}
                  style={{...btn((cfg?.cisLinks!==false)===v?"primary":"ghost"),fontSize:13}}>{lbl}</button>
              ))}
            </div>
            <p style={{fontFamily:MONO,fontSize:12.5,color:C.muted,lineHeight:1.6,marginTop:6}}>
              Each card links to its CIS Control page in a new tab. Turn off for study sessions
              that must match earlier ones, where players had only the card face.
            </p>
          </div>
          <div style={{marginTop:12}}>
            <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Standing risks</label>
            <div style={{display:"flex",gap:6,marginTop:6}}>
              <button onClick={()=>saveCfg({standingOn:false})}
                style={{...btn(!cfg?.standingOn?"primary":"ghost"),fontSize:13}}>Off</button>
              <button onClick={()=>saveCfg({standingOn:true})}
                style={{...btn(cfg?.standingOn?"primary":"ghost"),fontSize:13}}>On — two per scenario</button>
            </div>
            <p style={{fontFamily:MONO,fontSize:12.5,color:C.muted,lineHeight:1.6,marginTop:6}}>
              Two problems the client already had, pre-placed on the matrix. Same budget, so
              teams must choose between today's incident and the chronic ones. Recommended from
              mid-course, not week one.
            </p>
          </div>

          <div style={{marginTop:12}}>
            <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>
              Teams — allow about {SEATS_PER_TEAM} students each
            </label>
            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
              {[6,8,10,12,16].map(k=>(
                <button key={k} onClick={()=>saveCfg({teamCount:k})}
                  style={{...btn((cfg?.teamCount??6)===k?"primary":"ghost"),fontSize:13}}>
                  {k} · up to {k*SEATS_PER_TEAM}
                </button>
              ))}
            </div>
            <p style={{fontFamily:MONO,fontSize:12.5,color:C.muted,lineHeight:1.6,marginTop:6}}>
              Reducing the count hides higher-numbered teams but does not delete them.
              Larger rooms refresh a little more slowly to keep request volume steady.
            </p>
          </div>

          <div style={{marginTop:12}}>
            <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Budget — the organization's resource level</label>
            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
              {[[5,"No IT staff"],[6,"IG1 · default"],[10,"IG2"],[15,"IG3"]].map(([b,lbl])=>(
                <button key={b} onClick={()=>saveCfg({budget:b})}
                  style={{...btn(budget===b?"primary":"ghost"),fontSize:13}}>{b} · {lbl}</button>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Phase">
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {PHASES.map(p=>(
              <button key={p.id} onClick={()=>saveCfg({phase:p.id})}
                style={{...btn(phase===p.id?"primary":"ghost"),textAlign:"left"}}>{p.label}</button>
            ))}
          </div>
          <button style={{...btn(),marginTop:10,width:"100%"}} disabled={busy} onClick={dealAll}>
            Deal {dealSize} controls + 3 modifiers to every team
          </button>
          {note && <div style={{fontFamily:MONO,fontSize:13,color:C.brass,lineHeight:1.6,marginTop:7}}>{note}</div>}
          <div style={{display:"flex",gap:6,marginTop:7,flexWrap:"wrap"}}>
            {[[true,"Same deal for all"],[false,"Vary by team"]].map(([v,lbl])=>(
              <button key={String(v)} onClick={()=>saveCfg({sameDeal:v})}
                style={{...btn((cfg?.sameDeal!==false)===v?"primary":"ghost"),fontSize:12.5}}>
                {lbl}</button>
            ))}
          </div>
          <p style={{fontFamily:MONO,fontSize:12.5,color:C.muted,lineHeight:1.6,marginTop:6}}>
            Every hand is guaranteed at least {dealSize>8?"two":"one"} strong and {dealSize>8?"two":"one"} partial
            card for the scenario, plus one strong card per delayed threat in play, so no team is
            punished for its deal. Keep <b>same deal</b> when collecting data.
          </p>
          <div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${C.edge}`}}>
            <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Campaign — same client, later in the term</label>
            <div style={{display:"flex",gap:6,marginTop:6,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Delayed threats</span>
              {[[true,"On"],[false,"Off"]].map(([v,lbl])=>(
                <button key={lbl} onClick={()=>saveCfg({injectsOn:v})}
                  style={{...btn(injectsOn===v?"primary":"ghost"),fontSize:12.5,padding:"3px 10px"}}>{lbl}</button>
              ))}
            </div>
            <p style={{fontFamily:MONO,fontSize:12.5,color:C.muted,lineHeight:1.6,marginTop:6}}>
              {injectsOn
                ? (upcomingInject
                    ? <>Advancing adds a new threat on top of the existing ones: <span style={{color:C.paper}}>{upcomingInject.title}</span>. Same budget, so teams must split it. Up to {MAX_INJECTS} stack.</>
                    : scenarioById(cfg?.scenarioId)
                      ? `Every board already carries ${MAX_INJECTS} delayed threats, or no team is seated; none will be added.`
                      : "Load a scenario first; delayed threats come from it.")
                : "Off. Advancing moves existing threats only."}
            </p>
            {willRealize.length>0 && (
              <div style={{marginTop:7,padding:"9px 11px",borderRadius:4,
                border:`1px solid ${C.warn}`,background:"rgba(209,118,111,.10)"}}>
                <div style={{fontFamily:MONO,fontSize:12.5,color:C.warn,letterSpacing:".06em",
                  textTransform:"uppercase"}}>Advancing will realize a threat</div>
                <div style={{fontSize:13,lineHeight:1.55,marginTop:4}}>
                  {willRealize.map(n=>teams[n]?.name).join(", ")}
                </div>
                <div style={{fontFamily:MONO,fontSize:12,color:C.muted,marginTop:5,lineHeight:1.6}}>
                  Say it aloud before they read it. Frame it as consequence, not failure, and ask
                  them to narrate what happened in the client's words.
                </div>
              </div>
            )}
            <button style={{...btn("primary"),marginTop:6,width:"100%"}} disabled={busy}
              onClick={()=>{ if(window.confirm(
                "Advance to the next engagement?\n\nThreats and matrix positions carry forward. "+
                "Teams that played Deferred Investment drift one cell toward Very Likely, or realize "+
                "if they were already there, and receive 10 points.\n\n"+
                (injectsOn && upcomingInject ? `A delayed threat lands on every board: ${upcomingInject.title}.\n\n` : "")+
                "Hands, purchases and modifiers are cleared. Export the CSV first.")) nextEngagement(); }}>
              Next engagement — carry the board forward
            </button>
            <p style={{fontFamily:MONO,fontSize:12.5,color:C.muted,lineHeight:1.6,marginTop:6}}>
              Use this instead of New round when the same organization returns. Severity never
              drifts; only likelihood does.{!cfg?.scenarioId && (
                <span style={{color:C.warn}}> No scenario is loaded, so coverage cannot be
                scored and threats will not move. Load one first.</span>)}
            </p>
          </div>

          <div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${C.edge}`}}>
            <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Another scenario, same room</label>
            <button style={{...btn(),marginTop:6,width:"100%"}} disabled={busy}
              onClick={()=>{ if(window.confirm(
                "Clear the board for another scenario?\n\nTeams keep their names and seats. "+
                "Threat cards, matrix placements, hands, purchases and modifiers are cleared, "+
                "and play returns to Phase 1.\n\nExport the CSV first if you want to keep this round.")) newRound(); }}>
              New round — keep teams, clear the board
            </button>
          </div>

          <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.edge}`}}>
            <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>When the class is over</label>
            <button style={{...btn("danger"),marginTop:6,width:"100%"}} disabled={busy}
              onClick={()=>{ if(window.confirm(
                "Clear the board for the next class?\n\nA timestamped copy is kept first, so nothing is lost. "+
                "Export the CSV before doing this if you have not already.\n\nIn campaign play, do NOT clear — "+
                "the same organization returns with drift applied.")) endSession(); }}>
              End session and clear board
            </button>
          </div>

          <div style={{marginTop:12}}>
            <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>
              Timer — everyone sees it, not just the projector
            </label>
            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
              <button style={{...btn("primary"),fontSize:13}}
                onClick={()=>saveCfg({timerEnd:Date.now()+phaseMinutes(phase,cfg)*60000})}>
                Start {phaseMinutes(phase,cfg)} min for this phase
              </button>
              {[5,10,15].map(m=>(
                <button key={m} style={{...btn(),fontSize:13}}
                  onClick={()=>saveCfg({timerEnd:Date.now()+m*60000})}>{m}</button>
              ))}
              <button style={{...btn(),fontSize:13}} onClick={()=>saveCfg({timerEnd:null})}>Clear</button>
            </div>
          </div>
          <p style={{fontFamily:MONO,fontSize:12.5,color:C.muted,lineHeight:1.6,marginTop:8}}>
            Dealing replaces any hand a team already has. Deal once, at the start of Phase 2.
          </p>
        </Section>

        {loaded && (cfg?.phase==="debrief"||cfg?.phase==="p3") && (
          <Section title="Debrief questions for this scenario">
            <ol style={{margin:0,paddingLeft:18,fontSize:14,lineHeight:1.6}}>
              {loaded.debrief.map((q,i)=><li key={i} style={{marginBottom:5}}>{q}</li>)}
            </ol>
          </Section>
        )}

        <Section title="Facilitator role">
          <p style={{fontFamily:MONO,fontSize:13,color:C.muted,lineHeight:1.6,margin:"0 0 9px"}}>
            You hold this role. Only someone with the code can take it, and only you can
            release it from here.
          </p>
          {roleMsg && <div style={{fontFamily:MONO,fontSize:13,color:C.brass,marginBottom:8}}>{roleMsg}</div>}
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            <button style={btn()} disabled={busy} onClick={changeCode}>Change the code</button>
            <button style={btn("danger")} disabled={busy}
              onClick={()=>{ if(window.confirm(
                "Release the facilitator role?\n\nThe session, teams and board are untouched. "+
                "The next person to open the facilitator page can claim it with any code they choose.\n\n"+
                "Do this at the end of class, or to hand over to a colleague.")) releaseRole(); }}>
              Release the role
            </button>
          </div>
        </Section>

        <Section title="Adjudication" right={<span style={{fontFamily:MONO,fontSize:13,
          padding:pending.length?"2px 8px":0, borderRadius:3,
          background:pending.length?C.brass:"transparent",
          color:pending.length?C.onAccent:C.muted}}>{pending.length} waiting</span>}>
          {pending.length===0
            ? <p style={{color:C.muted,fontSize:13.5,margin:0,lineHeight:1.6}}>
                Nothing to judge yet. When a team plays a modifier, its justification arrives here.</p>
            : pending.map((p,k)=>(
              <div key={k} style={{border:`1px solid ${C.edge}`,borderRadius:4,padding:11,marginBottom:8,background:C.panel}}>
                <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>{teams[p.n]?.name} · card {p.id}</div>
                <div style={{fontSize:14.5,fontWeight:500,margin:"3px 0 5px"}}>{card(p.id)?.name}</div>
                <div style={{fontSize:14,color:C.paper,lineHeight:1.55,fontStyle:"italic"}}>“{p.justification}”</div>
                <div style={{fontSize:12.5,color:C.muted,margin:"7px 0",lineHeight:1.5}}>
                  <b>Needs:</b> {card(p.id)?.demand}</div>
                <div style={{display:"flex",gap:7}}>
                  <button style={btn("primary")} onClick={()=>{
                    const mods=[...teams[p.n].modifiers]; mods[p.i]={...mods[p.i],status:"accepted"};
                    saveTeam(p.n,{modifiers:mods});
                  }}>Specific enough</button>
                  <button style={btn("danger")} onClick={()=>{
                    const mods=teams[p.n].modifiers.filter((_,i)=>i!==p.i);
                    saveTeam(p.n,{modifiers:mods});
                  }}>Return to deck</button>
                </div>
              </div>
            ))}
        </Section>
      </div>

      <div>
        <Section title="The room" right={
          <div style={{display:"flex",gap:7}}>
            <button style={btn()} onClick={()=>window.open(window.location.href.split("#")[0]+"#projector","_blank")}>
              Projector
            </button>
            <button style={btn()} onClick={exportData}>Export CSV</button>
          </div>}>
          <div style={{display:"grid",gap:9}}>
            {ids.map(n=>{
              const t = teams[n];
              if(!t?.joined) return (
                <div key={n} style={{border:`1px dashed ${C.edge}`,borderRadius:4,padding:"10px 12px",
                  fontFamily:MONO,fontSize:13,color:C.muted}}>Team {n} — no one here yet</div>
              );
              const spent=(t.purchases||[]).reduce((s,id)=>s+(card(id)?.cost||0),0);
              return (
                <div key={n} style={{border:`1px solid ${C.edge}`,borderRadius:4,padding:12,background:C.panel,
                  display:"grid",gridTemplateColumns:"1fr auto",gap:12,alignItems:"start"}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:15}}>{t.name}</div>
                    <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted,marginTop:2}}>
                      {t.members||"—"}
                      {(t.engagement||1)>1 && ` · engagement ${t.engagement}`}
                      {(t.drift||0)>0 && ` · drifted ${t.drift}`}
                      {t.realized && <span style={{color:C.warn,fontWeight:700}}> · THREAT REALIZED</span>}
                      {!t.realized && t.lastVerdict && t.lastVerdict!=="unscored" &&
                        <span style={{color:t.lastVerdict==="held"?C.ok:t.lastVerdict==="partial"?C.brass:C.warn}}>
                          {" "}· {t.lastVerdict}</span>}
                      {t.budgetOverride && <span style={{color:C.brass}}> · {t.budgetOverride} pts</span>}
                      {(t.standingIgnored||0)>0 &&
                        <span style={{color:C.warn}}> · {t.standingIgnored} standing ignored</span>}
                      {(t.injects||[]).length>0 &&
                        <span style={{color:C.solution}}> · +{t.injects.length} delayed threat{t.injects.length===1?"":"s"}
                          {t.injects.some(x=>!x.pre) && " (not yet placed)"}</span>}
                    </div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap",margin:"7px 0"}}>
                      {Object.entries(DIM_META).map(([k,m])=> t.threat[k] ? (
                        <span key={k} style={{fontFamily:MONO,fontSize:12.5,padding:"2px 6px",borderRadius:2,
                          border:`1px solid ${m.color}`,color:m.color}}>{t.threat[k]}</span>
                      ):null)}
                    </div>
                    <Tokens total={t.budgetOverride ?? budget} spent={spent}/>
                    <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted,marginTop:6,lineHeight:1.5}}>
                      {(t.purchases||[]).length
                        ? (t.purchases||[]).map(id=>card(id)?.name).join(" · ")
                        : "nothing bought yet"}
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    <Matrix pre={t.pre} post={t.post} compact grid={grid}
                      extras={(t.injects||[]).map((x,i)=>({...x, label:String(i+1), title:injectById(x.id)?.title||"New threat"}))}/>
                    {t.ownerUid && (
                      <button style={{...btn(),fontSize:12.5,padding:"4px 8px"}} disabled={busy}
                        onClick={()=>{ if(window.confirm(
                          `Release ${t.name}'s seat?\n\nTheir board is untouched. The next device to `+
                          `open this team takes it over. Use this when a laptop has died or a student `+
                          `has switched machines.`)) saveTeam(n,{ownerUid:null}); }}>
                        Release seat
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>
    </div>
  );
}


/* ---------------- projector ---------------- */

function OverlayMatrix({teams,ids,grid=GRIDS[3]}){
  // Same overall footprint on the wall whichever grid is in use.
  const size = grid.n===5 ? 84 : 118;
  const at = (l,s,which)=> ids.filter(n=>{
    const p = teams[n]?.[which]; return p && p.l===l && p.s===s;
  });
  return (
    <div style={{display:"grid",gridTemplateColumns:`auto repeat(${grid.n},${size}px)`,gap:6}}>
      <div/>
      {grid.sev.map(s=>(
        <div key={s} style={{fontFamily:MONO,fontSize:grid.n===5?13:14.5,color:C.muted,textAlign:"center",
          paddingBottom:5,alignSelf:"end"}}>{s}</div>
      ))}
      {grid.lik.map((l,li)=>(
        <React.Fragment key={l}>
          <div style={{fontFamily:MONO,fontSize:grid.n===5?13:14.5,color:C.muted,alignSelf:"center",
            paddingRight:10,textAlign:"right"}}>{l}</div>
          {grid.sev.map((sv,si)=>{
            const heat=(li+si)/(2*(grid.n-1));
            const pre=at(li,si,"pre"), post=at(li,si,"post");
            return (
              <div key={sv} style={{width:size,height:size,borderRadius:5,
                border:`1px solid ${C.edge}`,background:C.name==="dark" ? `rgba(209,118,111,${0.10+heat*0.22})` : `rgba(182,66,56,${0.07+heat*0.18})`,
                padding:7,display:"flex",flexWrap:"wrap",gap:5,alignContent:"flex-start"}}>
                {pre.map(n=>(
                  <span key={`b${n}`} title={`${teams[n]?.name} before`} style={{width:26,height:26,borderRadius:"50%",
                    border:`2px solid ${C.muted}`,color:C.muted,fontFamily:MONO,fontSize:13.5,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>{n}</span>
                ))}
                {post.map(n=>(
                  <span key={`a${n}`} title={`${teams[n]?.name} after`} style={{width:26,height:26,borderRadius:"50%",
                    background:C.brass,color:C.onAccent,fontFamily:MONO,fontSize:13.5,fontWeight:700,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>{n}</span>
                ))}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

function Countdown({end}){
  const [now,setNow] = useState(Date.now());
  useEffect(()=>{ const i=setInterval(()=>setNow(Date.now()),1000); return ()=>clearInterval(i); },[]);
  if(!end) return null;
  const left = Math.max(0, end-now);
  const m = Math.floor(left/60000), sec = Math.floor((left%60000)/1000);
  const low = left < 120000;
  return (
    <div style={{fontFamily:MONO,fontSize:54,fontWeight:600,lineHeight:1,
      color: left===0 ? C.warn : low ? C.brass : C.paper,
      fontVariantNumeric:"tabular-nums"}}>
      {left===0 ? "time" : `${m}:${String(sec).padStart(2,"0")}`}
    </div>
  );
}

function Projector({cfg,teams,ids,onExit}){
  const budget = cfg?.budget??6;
  const phase = PHASES.find(p=>p.id===(cfg?.phase||"setup"));
  const active = ids.filter(n=>teams[n]?.joined);
  const pending = active.reduce((a,n)=>a+(teams[n]?.modifiers||[]).filter(m=>m.status==="pending").length,0);
  const scen = scenFor(cfg);
  const grid = gridOf(cfg);

  return (
    <div style={{minHeight:"100%",background:C.slate,color:C.paper,fontFamily:SANS,padding:"26px 32px 34px"}}>
      <style>{`@media (prefers-reduced-motion: reduce){*{transition:none!important}}`}</style>

      <header style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
        gap:24,borderBottom:`1px solid ${C.edge}`,paddingBottom:16,marginBottom:22}}>
        <div style={{minWidth:0}}>
          <div style={{fontFamily:MONO,fontSize:14.5,letterSpacing:".18em",textTransform:"uppercase",color:C.solution}}>
            {phase?.label}
          </div>
          <h1 style={{fontSize:42,margin:"6px 0 0",fontWeight:600,letterSpacing:"-.025em"}}>
            {cfg?.org || "Solutions Table"}
          </h1>
          {cfg?.scenario && (
            <p style={{fontSize:20,lineHeight:1.5,color:C.paper,maxWidth:820,margin:"10px 0 0"}}>
              {cfg.scenario}
            </p>
          )}
          {cfg?.detail==="technical" && scen?.env && (
            <ul style={{fontSize:15.5,lineHeight:1.5,color:C.muted,maxWidth:900,margin:"10px 0 0",paddingLeft:20}}>
              {scen.env.map((x,i)=><li key={i}>{x}</li>)}
            </ul>
          )}
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <Countdown end={cfg?.timerEnd}/>
          <div style={{fontFamily:MONO,fontSize:15,color:C.muted,marginTop:8}}>
            budget {budget} · {active.length} team{active.length===1?"":"s"}
          </div>
          {pending>0 && (
            <div style={{fontFamily:MONO,fontSize:15,color:C.brass,marginTop:4}}>
              {pending} justification{pending===1?"":"s"} waiting
            </div>
          )}
          <button onClick={onExit} style={{...btn(),marginTop:12,fontSize:13,opacity:.5}}>Exit</button>
        </div>
      </header>

      <div style={{display:"grid",gridTemplateColumns:"minmax(400px,auto) 1fr",gap:36,alignItems:"start"}}>
        <div>
          <div style={{fontFamily:MONO,fontSize:13.5,letterSpacing:".1em",textTransform:"uppercase",
            color:C.muted,marginBottom:12}}>The room, on one grid</div>
          <OverlayMatrix teams={teams} ids={ids} grid={grid}/>
          <div style={{display:"flex",gap:22,marginTop:14,fontFamily:MONO,fontSize:14.5,color:C.muted}}>
            <span><span style={{display:"inline-block",width:14,height:14,borderRadius:"50%",
              border:`2px solid ${C.muted}`,marginRight:7,verticalAlign:"-2px"}}/>before controls</span>
            <span><span style={{display:"inline-block",width:15,height:15,borderRadius:"50%",
              background:C.brass,marginRight:7,verticalAlign:"-2px"}}/>after controls</span>
          </div>
        </div>

        <div>
          <div style={{fontFamily:MONO,fontSize:13.5,letterSpacing:".1em",textTransform:"uppercase",
            color:C.muted,marginBottom:12}}>What each team bought</div>
          {active.length===0 ? (
            <p style={{color:C.muted,fontSize:19}}>No teams have joined yet.</p>
          ) : (
            <div style={{display:"grid",gap:10}}>
              {active.map(n=>{
                const t=teams[n];
                const spent=(t.purchases||[]).reduce((a,id)=>a+(card(id)?.cost||0),0);
                const total = t.budgetOverride ?? budget;
                return (
                  <div key={n} style={{border:`1px solid ${C.edge}`,borderRadius:5,padding:"13px 16px",
                    background:C.panel,display:"grid",gridTemplateColumns:"34px 1fr auto",gap:14,alignItems:"start"}}>
                    <div style={{width:30,height:30,borderRadius:"50%",background:C.edge,color:C.paper,
                      fontFamily:MONO,fontSize:16,fontWeight:700,display:"flex",
                      alignItems:"center",justifyContent:"center"}}>{n}</div>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:20,fontWeight:600}}>{t.name}</div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",margin:"7px 0 8px"}}>
                        {Object.entries(DIM_META).map(([k,m])=> t.threat[k] ? (
                          <span key={k} style={{fontFamily:MONO,fontSize:13.5,padding:"2px 8px",borderRadius:3,
                            border:`1px solid ${m.color}`,color:m.color}}>{t.threat[k]}</span>
                        ):null)}
                        {(t.injects||[]).map(x=>(
                          <span key={x.id} style={{fontFamily:MONO,fontSize:13.5,padding:"2px 8px",borderRadius:3,
                            background:C.solution,color:C.onAccent}}>+ {injectById(x.id)?.title}</span>
                        ))}
                      </div>
                      <div style={{fontSize:16,color:C.paper,lineHeight:1.5}}>
                        {(t.purchases||[]).length
                          ? (t.purchases||[]).map(id=>card(id)?.name).join(" · ")
                          : <span style={{color:C.muted}}>nothing bought yet</span>}
                      </div>
                      {(t.modifiers||[]).filter(m=>m.status==="accepted").length>0 && (
                        <div style={{fontFamily:MONO,fontSize:13.5,color:C.solution,marginTop:6}}>
                          + {(t.modifiers||[]).filter(m=>m.status==="accepted")
                              .map(m=>card(m.id)?.name).join(" · ")}
                        </div>
                      )}
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:MONO,fontSize:27,fontWeight:600,
                        color: spent>=total ? C.brass : C.paper, fontVariantNumeric:"tabular-nums"}}>
                        {total-spent}
                      </div>
                      <div style={{fontFamily:MONO,fontSize:13,color:C.muted}}>left</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- player ---------------- */

function Player({cfg,teams,ids,teamN,setTeamN,saveTeam,busy,clientId,onExit}){
  const phase = cfg?.phase||"setup";
  const dims = cfg?.dims||DEFAULT_DIMS;
  const t = teamN ? (teams[teamN]||blankTeam(teamN)) : null;
  const [just,setJust] = useState({});
  const [sendMsg,setSendMsg] = useState("");
  /* The database refuses writes from anyone but the seat holder, so the
     interface disables them rather than letting a click fail. */
  const isOwner = !t?.ownerUid || t.ownerUid===clientId;
  const scen = scenFor(cfg);
  const useStanding = cfg?.standingOn && scen?.standing?.length;
  /* When the scenario supplies the threat model, show it from the scenario
     rather than from team state — otherwise a team that joins after the
     facilitator loaded it sees four empty, un-editable boxes. */
  const locked = !!(cfg?.threatLocked && scen?.draw);
  const threat = locked ? scen.draw : (t?.threat || {});
  const grid = gridOf(cfg);
  // Positions carry forward once play has started, otherwise use the scenario's
  const standing = useStanding
    ? (scen.standing||[]).map(r=>({...r, at:(t?.standingPos||{})[r.id] || onGrid(r.pos, grid)
        || {l:middleRow(grid),s:middleRow(grid)}}))
    : [];
  /* Delayed threats ride on the same matrix as numbered squares. Which one a
     click places is local to this screen; it is not worth a shared write. */
  const injects = (t?.injects||[]).map((x,i)=>{
    const def = injectFor(x.id, cfg);
    return {...x, def, label:String(i+1), title:def?.title||"New threat"};
  }).filter(x=>x.def);
  const [placing,setPlacing] = useState("main");
  const placingId = injects.some(x=>x.id===placing) ? placing : "main";
  const showLinks = cfg?.cisLinks !== false;
  const bought = [...(t?.purchases||[]), ...(t?.everBought||[])];
  const addressedIdsTrue = standing.filter(r=>r.cards.some(c=>bought.includes(c))).map(r=>r.id);
  /* Withheld until Phase 3. If teams can watch a square turn green while they
     shop, they stop reasoning and start clicking cards to see what lights up. */
  const reveal = phase==="p3" || phase==="debrief";
  const addressedIds = reveal ? addressedIdsTrue : [];
  // Banking last engagement buys a bigger budget this one
  const budget = t?.budgetOverride ?? (cfg?.budget??6);
  const control = cfg?.condition === "control";
  const [measureDraft,setMeasureDraft] = useState("");
  useEffect(()=>{
    if(!locked || !isOwner || !teamN) return;
    const cur = t?.threat || {};
    const same = ["method","impact","resource","motive"].every(k=>cur[k]===scen.draw[k]);
    if(!same) saveTeam(teamN,{threat:{...scen.draw}});
  },[locked,isOwner,teamN,t?.threat,scen]);

  if(!teamN){
    return (
      <Section title="Pick your team" right={<button style={btn()} onClick={onExit}>Back</button>}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:9}}>
          {ids.map(n=>{
            const taken = teams[n]?.joined;
            return (
              <button key={n} onClick={async()=>{
                  setTeamN(n);
                  const t = teams[n];
                  if(!t?.ownerUid) await saveTeam(n,{...(t||blankTeam(n)),joined:true,ownerUid:clientId});
                }}
                style={{...btn(taken?"ghost":"primary"),padding:"14px 10px",textAlign:"left"}}>
                <div style={{fontSize:15,color:C.paper,fontWeight:600}}>{teams[n]?.name||`Team ${n}`}</div>
                <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted,marginTop:3}}>
                  {!teams[n]?.ownerUid ? "open"
                    : teams[n].ownerUid===clientId ? "yours"
                    : `taken${teams[n]?.members? ` · ${teams[n].members}`:""} — watch only`}
                </div>
              </button>
            );
          })}
        </div>
      </Section>
    );
  }

  const spent = (t.purchases||[]).reduce((s,id)=>s+(card(id)?.cost||0),0);
  const remaining = budget - spent;
  const modsPlayed = (t.modifiers||[]).length;
  const deferred = (t.modifiers||[]).some(m=>m.id===28 && m.status==="accepted");
  const cap = deferred ? Math.min(budget,4) : budget;

  const pickFor = (which)=>(l,s)=>{
    if (placingId==="main") return saveTeam(teamN,{[which]:{l,s}});
    saveTeam(teamN,{injects:(t.injects||[]).map(x=>x.id===placingId ? {...x,[which]:{l,s}} : x)});
  };
  const placeSwitch = (which)=> injects.length>0 && (
    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:9}}>
      <span style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Placing:</span>
      <button onClick={()=>setPlacing("main")} aria-pressed={placingId==="main"}
        style={{...btn(placingId==="main"?"primary":"ghost"),fontSize:12.5,padding:"4px 10px"}}>
        ● {scen?.title || "Main threat"}{!t[which] ? " — not placed" : ""}
      </button>
      {injects.map(x=>(
        <button key={x.id} onClick={()=>setPlacing(x.id)} aria-pressed={placingId===x.id}
          style={{...btn(placingId===x.id?"primary":"ghost"),fontSize:12.5,padding:"4px 10px",
            borderColor:C.solution}}>
          ■{x.label} {x.title}{!x[which] ? " — not placed" : ""}
        </button>
      ))}
    </div>
  );

  const held = [...(t.purchases||[]), ...(t.everBought||[])];
  const toggleBuy = (id)=>{
    const c = card(id);
    const has = (t.purchases||[]).includes(id);
    if(has){
      // A safeguard cannot outlive the control it refines; returning the
      // parent returns its safeguards too.
      const left = t.purchases.filter(x=>x!==id);
      const still = [...left, ...(t.everBought||[])];
      return saveTeam(teamN,{purchases:left.filter(x=>parentHeld(card(x), still))});
    }
    if(!parentHeld(c, held)) return;
    if(spent + c.cost > cap) return;
    saveTeam(teamN,{purchases:[...(t.purchases||[]),id]});
  };

  const playModifier = async (id)=>{
    const text = (just[id]||"").trim();
    if(text.length<12) return setSendMsg("Write a little more before sending.");
    if(id===24 && !(t.purchases||[]).some(p=>p===4||p===7))
      return setSendMsg("Least Privilege needs card 4 or 7 bought first.");
    if(modsPlayed>=2) return setSendMsg("You have already played two modifiers.");
    setSendMsg("Sending…");
    const ok = await saveTeam(teamN,{modifiers:[...(t.modifiers||[]),
      {id, justification:text, status:"pending", sentAt:Date.now()}]});
    if(ok===false){ setSendMsg("It did not send. Tell your facilitator."); return; }
    setJust(j=>({...j,[id]:""}));
    setSendMsg("Sent. Waiting on the facilitator.");
    setTimeout(()=>setSendMsg(""),4000);
  };

  return (
    <div>
      <Section title={t.name} right={
        <div style={{display:"flex",gap:7}}>
          <button style={btn()} onClick={()=>setTeamN(null)}>Switch team</button>
          <button style={btn()} onClick={onExit}>Leave</button>
        </div>}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10}}>
          <div>
            <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Team name</label>
            <input value={t.name} disabled={!isOwner}
              onChange={e=>saveTeam(teamN,{name:e.target.value})}/>
          </div>
          <div>
            <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Who is playing</label>
            <input value={t.members} placeholder="first names" disabled={!isOwner}
              onChange={e=>saveTeam(teamN,{members:e.target.value})}/>
          </div>
        </div>
        {t.realized && (phase==="setup"||phase==="p1") && (
          <div style={{marginTop:12,padding:"12px 14px",borderRadius:4,
            border:`1px solid ${C.warn}`,background:"rgba(192,69,59,.10)"}}>
            <div style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".08em",
              textTransform:"uppercase",color:C.warn}}>It happened</div>
            <p style={{fontSize:14.5,lineHeight:1.6,margin:"6px 0 9px"}}>
              {(t.realized?.threats||[]).length
                ? <><b>{t.realized.threats.join(" and ")}</b> {t.realized.threats.length===1?"was":"were"} already
                    at <b>{grid.lik[grid.n-1]}</b>, and nothing you bought pulled {t.realized.threats.length===1?"it":"them"} back.</>
                : <>You left this at <b>{grid.lik[grid.n-1]}</b> and nothing you bought pulled it back.</>}
              {" "}The attack succeeded. What follows is decided by what you have bought across every
              engagement, not by chance.
            </p>
            <div style={{display:"grid",gap:4}}>
              {(t.realized?.outcome||[]).map((o,i)=>(
                <div key={i} style={{display:"flex",gap:9,fontSize:14,lineHeight:1.5}}>
                  <span style={{fontFamily:MONO,fontSize:13,minWidth:76,
                    color:o.had?C.ok:C.warn}}>{o.q}</span>
                  <span style={{color:o.had?C.paper:"#E8A9A3"}}>{o.text}</span>
                </div>
              ))}
            </div>
            <p style={{fontFamily:MONO,fontSize:13,color:C.muted,lineHeight:1.6,marginBottom:0,marginTop:9}}>
              Tell the room what happened in the client's words, using your Human Impact card.
            </p>
          </div>
        )}
        {!t.realized && t.lastVerdict && t.lastVerdict!=="unscored" && (phase==="setup"||phase==="p1") && (
          <div style={{marginTop:12,padding:"10px 13px",borderRadius:4,
            border:`1px solid ${t.lastVerdict==="held"?C.ok:t.lastVerdict==="partial"?C.brass:C.warn}`,
            background: t.lastVerdict==="held" ? "rgba(78,140,90,.12)"
                      : t.lastVerdict==="partial" ? "rgba(217,180,91,.10)" : "rgba(192,69,59,.10)"}}>
            <div style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".08em",textTransform:"uppercase",
              color: t.lastVerdict==="held"?C.ok:t.lastVerdict==="partial"?C.brass:C.warn}}>
              Engagement {t.engagement} · last year's portfolio {t.lastVerdict==="held"?"held"
                : t.lastVerdict==="partial"?"helped a little":"did not address this"}
            </div>
            <p style={{fontSize:14,lineHeight:1.6,margin:"5px 0 0",color:C.paper}}>
              {t.lastVerdict==="held"
                ? "What you bought addressed this threat directly, so it is less likely than it was. Severity is unchanged — it always is."
                : t.lastVerdict==="partial"
                ? "Some of what you bought touches this threat, but not squarely. Likelihood has not moved."
                : "Nothing you bought addressed this threat, so it is more likely than it was."}
            </p>
          </div>
        )}
        {!t.realized && (t.drift||0)>0 && (phase==="setup"||phase==="p1") && (
          <div style={{marginTop:12,padding:"9px 12px",borderRadius:4,
            border:`1px solid ${C.brass}`,background:"rgba(217,180,91,.10)",
            fontFamily:MONO,fontSize:13,color:C.brass,lineHeight:1.6}}>
            Engagement {t.engagement}. This threat has drifted {t.drift} cell{(t.drift||0)===1?"":"s"} toward
            Very Likely while you waited. Severity has not moved — it never does.
          </div>
        )}
        {!isOwner && (
          <div style={{marginTop:12,padding:"9px 12px",borderRadius:4,
            border:`1px solid ${C.brass}`,background:"rgba(217,180,91,.10)",
            fontFamily:MONO,fontSize:13,color:C.brass,lineHeight:1.6}}>
            Another device holds this team. You can follow along, but changes are made
            there. If that device is gone, ask the facilitator to release the seat.
          </div>
        )}
        {useStanding && (
          <div style={{marginTop:12,border:`1px solid ${C.edge}`,borderRadius:4,
            background:C.panel,padding:"11px 13px"}}>
            <div style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".08em",
              textTransform:"uppercase",color:C.muted}}>
              Already true of this organization
            </div>
            <div style={{display:"grid",gap:7,marginTop:8}}>
              {standing.map(r=>{
                const done = addressedIds.includes(r.id);
                return (
                  <div key={r.id} style={{display:"flex",gap:9,alignItems:"flex-start"}}>
                    <span style={{width:17,height:17,borderRadius:2,flexShrink:0,marginTop:1,
                      fontFamily:MONO,fontSize:12.5,display:"flex",alignItems:"center",
                      justifyContent:"center",
                      background:done?C.ok:"transparent",
                      border:`1.5px solid ${done?C.ok:C.muted}`,
                      color:done?C.onAccent:C.muted}}>
                      {String.fromCharCode(64+r.id)}
                    </span>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:14,lineHeight:1.5,
                        color:done?"#D6D2C8":C.paper}}>{r.text}</div>
                      <div style={{fontFamily:MONO,fontSize:12.5,color:done?C.ok:C.muted,marginTop:2}}>
                        {grid.lik[r.at.l]} · {grid.sev[r.at.s]}
                        {done && " · addressed by what you have bought"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p style={{fontFamily:MONO,fontSize:12.5,color:C.muted,lineHeight:1.6,margin:"9px 0 0"}}>
              These were here before today's incident. Your budget covers all of it or none of it.
            </p>
          </div>
        )}
        {cfg?.scenario && (
          <div style={{marginTop:12,padding:12,borderLeft:`3px solid ${C.brass}`,background:C.panel,
            borderRadius:"0 4px 4px 0",fontSize:15,lineHeight:1.6}}>{cfg.scenario}</div>
        )}
        {cfg?.detail==="technical" && scen?.env && (
          <details open style={{marginTop:10,padding:"10px 12px",border:`1px solid ${C.edge}`,
            borderRadius:4,background:C.panel}}>
            <summary style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".08em",
              textTransform:"uppercase",color:C.muted,cursor:"pointer"}}>
              Technical environment
            </summary>
            <ul style={{margin:"8px 0 0",paddingLeft:18,fontSize:14,lineHeight:1.6}}>
              {scen.env.map((x,i)=><li key={i} style={{marginBottom:4}}>{x}</li>)}
            </ul>
            <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted,marginTop:6,lineHeight:1.6}}>
              Every purchase should point at a line here. If it cannot, ask why you are buying it.
            </div>
          </details>
        )}
        {injects.length>0 && (
          <div style={{marginTop:12,display:"grid",gap:9}}>
            {injects.map(x=>(
              <div key={x.id} style={{padding:"11px 13px",borderRadius:4,
                border:`1px solid ${C.solution}`,background:"rgba(124,95,168,.10)"}}>
                <div style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".08em",
                  textTransform:"uppercase",color:C.solution}}>
                  ■{x.label} · Delayed threat, arrived at engagement {x.since||2} — on top of the existing one
                </div>
                <div style={{fontSize:15,fontWeight:600,margin:"5px 0 3px"}}>{x.title}</div>
                <div style={{fontSize:14,lineHeight:1.6}}>{x.def.text}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:7}}>
                  {Object.entries(DIM_META).map(([k,m])=> x.def.draw?.[k] ? (
                    <span key={k} style={{fontFamily:MONO,fontSize:12.5,padding:"2px 6px",borderRadius:2,
                      border:`1px solid ${m.color}`,color:m.color}}>{x.def.draw[k]}</span>
                  ):null)}
                </div>
                {!x.pre && (phase==="setup"||phase==="p1") && (
                  <div style={{fontFamily:MONO,fontSize:12.5,color:C.brass,marginTop:7}}>
                    Not placed yet — choose ■{x.label} above the matrix in Phase 1, then click a cell.
                  </div>
                )}
              </div>
            ))}
            <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted,lineHeight:1.6}}>
              Your budget did not grow with the threats. One portfolio has to cover all of them,
              or you have to say which one you are leaving.
            </div>
          </div>
        )}
      </Section>

      <PhaseGuide phase={phase==="setup"?"p1":phase}/>

      {(phase==="p1"||phase==="setup") && (
        <Section title="Phase 1 — build the threat model" right={<>
          {!locked && <button style={btn("primary")} disabled={!isOwner} onClick={()=>saveTeam(teamN,{threat:{
            method:sample(dims.method,1)[0], impact:sample(dims.impact,1)[0],
            resource:sample(dims.resource,1)[0], motive:sample(dims.motive,1)[0]}})}>
            Roll for cards
          </button>}
          {locked && <span style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>
            set by the scenario</span>}
        </>}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:9,marginBottom:16}}>
            {Object.entries(DIM_META).map(([k,m])=>(
              <div key={k} style={{border:`1px solid ${C.edge}`,borderLeft:`3px solid ${m.color}`,
                borderRadius:4,padding:"10px 12px",background:C.panel,minHeight:62}}>
                <div style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".08em",textTransform:"uppercase",color:m.color}}>{m.label}</div>
                <select value={threat[k]||""} disabled={!isOwner || locked}
                  onChange={e=>saveTeam(teamN,{threat:{...t.threat,[k]:e.target.value}})}
                  style={{marginTop:6,border:"none",background:"transparent",padding:"2px 0",
                    fontFamily:SANS,fontSize:15,color:C.paper}}>
                  <option value="">choose…</option>
                  {(dims[k]||[]).map(v=><option key={v} value={v} style={{background:C.panel}}>{v}</option>)}
                </select>
              </div>
            ))}
          </div>
          <p style={{fontFamily:MONO,fontSize:13,color:C.muted,lineHeight:1.6,margin:"0 0 14px"}}>
            The roll randomizes which cards you draw. It never decides how an attack turns out —
            that follows from what you buy.
          </p>
          <div style={{display:"flex",gap:26,flexWrap:"wrap",alignItems:"flex-start"}}>
            <div>
              <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted,marginBottom:7}}>
                Place the threat. Justify severity by naming who the Human Impact card harms.
              </div>
              {placeSwitch("pre")}
              <Matrix pre={t.pre} post={t.post} standing={standing} addressed={addressedIds}
                grid={grid} extras={injects}
                interactive={isOwner} onPick={pickFor("pre")}/>
            </div>
            <div style={{flex:"1 1 240px",minWidth:220}}>
              <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>
                Why this cell? Name who gets hurt, and what makes it this likely.
              </label>
              <textarea value={t.preWhy||""} disabled={!isOwner}
                onChange={e=>saveTeam(teamN,{preWhy:e.target.value})}
                placeholder="Severity: who is harmed, and how badly. Likelihood: what about this organization makes it this likely."/>
            </div>
          </div>
        </Section>
      )}

      {phase==="p2" && (
        <Section title={control ? "Phase 2 — what should they do?" : "Phase 2 — buy your defense"}
          right={control ? null : <Tokens total={budget} spent={spent}/>}>

          <div style={{marginBottom:16}}>
            <div style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".08em",
              textTransform:"uppercase",color:C.solution}}>
              Measures your team would recommend
            </div>
            <p style={{fontSize:14,lineHeight:1.6,color:C.muted,margin:"5px 0 9px"}}>
              {control
                ? "List everything you would tell this organization to do. Add them one at a time. There is no budget — say what you actually think they need."
                : "List everything your team raised, including anything you could not afford. This is separate from what you buy below."}
            </p>
            <div style={{display:"flex",gap:7,marginBottom:8}}>
              <input value={measureDraft} disabled={!isOwner}
                placeholder="One measure, in your own words"
                onChange={e=>setMeasureDraft(e.target.value)}
                onKeyDown={e=>{
                  if(e.key==="Enter" && measureDraft.trim()){
                    saveTeam(teamN,{measures:[...(t.measures||[]),measureDraft.trim()]});
                    setMeasureDraft("");
                  }
                }}/>
              <button style={btn("primary")} disabled={!isOwner||!measureDraft.trim()}
                onClick={()=>{ saveTeam(teamN,{measures:[...(t.measures||[]),measureDraft.trim()]});
                  setMeasureDraft(""); }}>Add</button>
            </div>
            {(t.measures||[]).length>0 ? (
              <ol style={{margin:0,paddingLeft:20,fontSize:14,lineHeight:1.7}}>
                {(t.measures||[]).map((m,i)=>(
                  <li key={i} style={{marginBottom:2}}>
                    {m}
                    {isOwner && <button
                      onClick={()=>saveTeam(teamN,{measures:(t.measures||[]).filter((_,k)=>k!==i)})}
                      style={{...btn(),fontSize:12,padding:"1px 7px",marginLeft:9}}>remove</button>}
                  </li>
                ))}
              </ol>
            ) : (
              <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Nothing listed yet.</div>
            )}
          </div>

          {!control && deferred && (
            <div style={{fontFamily:MONO,fontSize:13,color:C.brass,marginBottom:10}}>
              Deferred Investment accepted — your spend is capped at 4 this round.
            </div>
          )}
          {!control && (t.everBought||[]).length>0 && (
            <div style={{marginBottom:14,padding:"9px 12px",borderRadius:4,
              border:`1px solid ${C.edge}`,background:C.panel}}>
              <div style={{fontFamily:MONO,fontSize:12.5,color:C.ok,textTransform:"uppercase",
                letterSpacing:".08em"}}>Already in place — no need to buy again</div>
              <div style={{fontSize:14,lineHeight:1.6,marginTop:4,color:C.paper}}>
                {(t.everBought||[]).map(id=>card(id)?.name).join(" · ")}
              </div>
            </div>
          )}
          {control ? null : !(t.hand||[]).length ? (
            <p style={{color:C.muted,fontSize:14.5,margin:0}}>Waiting for the facilitator to deal.</p>
          ) : (
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(215px,1fr))",gap:8,marginBottom:20}}>
                {(t.hand||[]).map(id=>{
                  const c=card(id); const bought=(t.purchases||[]).includes(id);
                  const unaffordable = !bought && spent + c.cost > cap;
                  return <CardTile key={id} c={c} state={bought?"bought":""}
                    links={showLinks ? cardLinks(c) : []}
                    disabled={unaffordable || !isOwner}
                    onClick={()=>toggleBuy(id)} note={bought?"bought":unaffordable?"not enough left":null}/>;
                })}
              </div>

              {(t.sgHand||[]).length>0 && (
                <div style={{marginBottom:20}}>
                  <div style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".08em",
                    textTransform:"uppercase",color:C.solution}}>Safeguards — deepen a control you hold</div>
                  <p style={{fontSize:14,lineHeight:1.6,color:C.muted,margin:"5px 0 9px"}}>
                    One narrow CIS safeguard each, 1 point from the same budget. A safeguard only
                    works inside its parent control, so you need that control already installed or
                    bought this round. Returning the parent returns its safeguards.
                  </p>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(215px,1fr))",gap:8}}>
                    {(t.sgHand||[]).map(id=>{
                      const c=card(id); const bought=(t.purchases||[]).includes(id);
                      const ok = parentHeld(c, held);
                      const unaffordable = !bought && spent + c.cost > cap;
                      const parents = c.parents.map(p=>card(p)?.name).join(" or ");
                      return <CardTile key={id} c={c} state={bought?"bought":""}
                        links={showLinks ? cardLinks(c) : []}
                        disabled={(!bought && !ok) || unaffordable || !isOwner}
                        onClick={()=>toggleBuy(id)}
                        note={bought ? `bought · refines ${parents}`
                          : !ok ? `needs ${parents} first`
                          : unaffordable ? "not enough left" : `${c.blurb}`}/>;
                    })}
                  </div>
                </div>
              )}

              <div style={{border:`1px solid ${C.solution}`,borderRadius:4,
                background:"rgba(124,95,168,.08)",padding:"10px 12px",marginBottom:10}}>
                <div style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".08em",
                  textTransform:"uppercase",color:C.solution}}>What modifiers are</div>
                <p style={{fontSize:14,lineHeight:1.6,margin:"5px 0 7px"}}>
                  They cost nothing, but they are not free points. Each one asks you to make a
                  claim about <b>your</b> organization and <b>your</b> threat. Type it, send it,
                  and the facilitator decides whether it is specific enough. Vague answers come
                  back and the card returns to the deck.
                </p>
                <div style={{fontSize:13,lineHeight:1.6}}>
                  <div style={{color:C.warn}}>✗ &ldquo;People are the weakest link.&rdquo; True of
                    everywhere, so it says nothing about here.</div>
                  <div style={{color:C.ok,marginTop:3}}>✓ &ldquo;Staff will share the one MFA phone
                    at the front desk, so we would need per-person enrolment.&rdquo;</div>
                </div>
                <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted,marginTop:7}}>
                  Each card asks its own question and gives you a sentence to fill in.
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",
                gap:10,marginBottom:8,flexWrap:"wrap"}}>
                <span style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>
                  {2-modsPlayed} modifier{2-modsPlayed===1?"":"s"} left to play
                </span>
                {((t.purchases||[]).length>0 || modsPlayed>0) && (
                  <button style={{...btn(),fontSize:13}} disabled={busy||!isOwner}
                    onClick={()=>{ if(window.confirm(
                      "Clear this team's purchases and modifiers?\n\nYour hand and your threat stay as they are — "+
                      "only the picks are undone.")) saveTeam(teamN,{purchases:[],modifiers:[]}); }}>
                    Clear our picks
                  </button>
                )}
              </div>
              <div style={{display:"grid",gap:8}}>
                {(t.modHand||[]).map(id=>{
                  const m=card(id);
                  const played=(t.modifiers||[]).find(x=>x.id===id);
                  const prereq = id===24 ? [4,7] : [];
                  const holds = prereq.some(p=>(t.purchases||[]).includes(p) || (t.everBought||[]).includes(p));
                  const dealt = prereq.some(p=>(t.hand||[]).includes(p) || (t.everBought||[]).includes(p));
                  const blocked = prereq.length>0 && !holds;
                  const blockMsg = !blocked ? null
                    : dealt
                      ? `Buy ${prereq.map(p=>card(p)?.name).join(" or ")} first, then this becomes available.`
                      : `You cannot play this one — neither ${prereq.map(p=>card(p)?.name).join(" nor ")} was dealt to you this round.`;
                  return (
                    <div key={id} style={{border:`1px solid ${played?C.solution:C.edge}`,borderRadius:4,
                      padding:11,background:C.panel}}>
                      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"baseline"}}>
                        <span style={{fontSize:15,fontWeight:500}}>{m.name}</span>
                        <span style={{fontFamily:MONO,fontSize:12.5,color:played
                          ? (played.status==="accepted"?C.ok:C.brass) : C.muted}}>
                          {played? (played.status==="accepted"?"accepted":"waiting on facilitator") : "free"}
                        </span>
                      </div>
                      <div style={{fontSize:13.5,lineHeight:1.55,color:C.paper,
                        margin:"5px 0 7px"}}>{m.ask || m.demand}</div>
                      {blocked && <div style={{fontFamily:MONO,fontSize:13,color:C.warn,
                        margin:"0 0 7px",lineHeight:1.55}}>{blockMsg}</div>}
                      {!played && (
                        <>
                          <textarea value={just[id]||""} onChange={e=>setJust(j=>({...j,[id]:e.target.value}))}
                            placeholder={blocked ? blockMsg
                              : (m.frame || "Answer the question above with something specific.")}
                            disabled={blocked||modsPlayed>=2||!isOwner}/>
                          <button style={{...btn("primary"),marginTop:7}}
                            disabled={blocked||modsPlayed>=2||!isOwner||(just[id]||"").trim().length<12}
                            onClick={()=>playModifier(id)}>Send to facilitator</button>
                          {sendMsg && <div style={{fontFamily:MONO,fontSize:13,marginTop:6,
                            color: sendMsg.startsWith("Sent") ? C.ok
                                 : sendMsg.startsWith("Sending") ? C.muted : C.warn}}>{sendMsg}</div>}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Section>
      )}

      {phase==="debrief" && scen && (
        <Section title="Debrief">
          <p style={{fontSize:14,color:C.muted,lineHeight:1.6,margin:"0 0 14px"}}>
            One sentence each. Write what your team actually decided, not what sounds right —
            these are the answers you will be asked to defend out loud.
          </p>

          {(t.engagement||1)>1 && (
            <div style={{marginBottom:14,paddingBottom:12,borderBottom:`1px solid ${C.edge}`}}>
              <div style={{display:"flex",gap:9,alignItems:"flex-start",marginBottom:5}}>
                <span style={{width:19,height:19,borderRadius:"50%",flexShrink:0,marginTop:1,
                  background:(t.carryAnswer||"").trim() ? C.ok : C.edge,
                  color:(t.carryAnswer||"").trim() ? C.onAccent : C.muted,
                  fontFamily:MONO,fontSize:12.5,display:"flex",
                  alignItems:"center",justifyContent:"center"}}>↻</span>
                <span style={{fontSize:14.5,lineHeight:1.55}}>
                  Asked every engagement: what would you do differently from last time, and why?
                </span>
              </div>
              <textarea value={t.carryAnswer||""} disabled={!isOwner} style={{minHeight:44}}
                placeholder="One sentence."
                onChange={e=>saveTeam(teamN,{carryAnswer:e.target.value})}/>
            </div>
          )}

          <div style={{display:"grid",gap:14}}>
            {(scen.debrief||[]).map((q,i)=>(
              <div key={i}>
                <div style={{display:"flex",gap:9,alignItems:"flex-start",marginBottom:5}}>
                  <span style={{width:19,height:19,borderRadius:"50%",flexShrink:0,marginTop:1,
                    background:(t.debriefAnswers||{})[i]?.trim() ? C.ok : C.edge,
                    color:(t.debriefAnswers||{})[i]?.trim() ? C.onAccent : C.muted,
                    fontFamily:MONO,fontSize:13,display:"flex",
                    alignItems:"center",justifyContent:"center"}}>{i+1}</span>
                  <span style={{fontSize:15,lineHeight:1.55}}>{q}</span>
                </div>
                <textarea value={(t.debriefAnswers||{})[i]||""} disabled={!isOwner}
                  style={{minHeight:44}} placeholder="One sentence."
                  onChange={e=>saveTeam(teamN,{debriefAnswers:{...(t.debriefAnswers||{}),[i]:e.target.value}})}/>
              </div>
            ))}
          </div>

          <div style={{marginTop:20,paddingTop:16,borderTop:`1px solid ${C.edge}`}}>
            <div style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".08em",
              textTransform:"uppercase",color:C.brass}}>And then the one that matters</div>
            <label style={{fontFamily:MONO,fontSize:13,color:C.muted,display:"block",
              margin:"7px 0 5px",lineHeight:1.6}}>
              If you could tell this organization one thing, what would it be? Say it in their
              words, not in card names — &ldquo;turn on multi-factor authentication&rdquo; is a card;
              &ldquo;nobody should be able to move money on the strength of an email&rdquo; is a
              recommendation.
            </label>
            <textarea value={t.recommendation||""} disabled={!isOwner}
              placeholder="Nobody should be able to move money on the strength of an email, even from the director."
              onChange={e=>saveTeam(teamN,{recommendation:e.target.value})}/>
            <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted,marginTop:6,lineHeight:1.6}}>
              Keep this. You will be handed it back later in the course, when you write the real
              thing for a real client.
            </div>
          </div>
        </Section>
      )}

      {(phase==="p3"||phase==="debrief") && (
        <Section title="Phase 3 — what still gets through">
          {scen && (
            <div style={{marginBottom:16,border:`1px solid ${C.edge}`,borderRadius:4,
              background:C.panel,padding:"12px 14px"}}>
              <div style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".08em",
                textTransform:"uppercase",color:C.solution}}>
                The new threat — how each purchase matches it
              </div>

              <div style={{fontSize:15,fontWeight:600,margin:"7px 0 3px"}}>{scen.title}</div>
              <div style={{fontSize:14,color:C.muted,lineHeight:1.5}}>{cfg?.org}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",margin:"8px 0 12px"}}>
                {Object.entries(DIM_META).map(([k,m])=> threat[k] ? (
                  <span key={k} style={{fontFamily:MONO,fontSize:12.5,padding:"2px 7px",
                    borderRadius:2,border:`1px solid ${m.color}`,color:m.color}}>{threat[k]}</span>
                ):null)}
              </div>

              {control ? (
                <>
                  <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted,marginBottom:6}}>
                    What your team recommended
                  </div>
                  {(t.measures||[]).length ? (
                    <ol style={{margin:0,paddingLeft:20,fontSize:14,lineHeight:1.7}}>
                      {(t.measures||[]).map((m,i)=><li key={i}>{m}</li>)}
                    </ol>
                  ) : <div style={{fontSize:14,color:C.muted}}>Nothing was listed.</div>}
                  <div style={{fontSize:14,lineHeight:1.6,marginTop:11,color:C.brass}}>
                    Decide together whether these would actually make this threat less likely,
                    then move the marker. Severity does not move — controls change how often
                    something happens, not who gets hurt when it does.
                  </div>
                </>
              ) : (()=>{
                const bp = t.purchases||[];
                const verdictOf = (id)=> (scen.strong||[]).includes(id) ? "strong"
                                       : (scen.partial||[]).includes(id) ? "partial" : "off";
                const LBL = {
                  strong:{t:"addresses it", c:C.ok},
                  partial:{t:"helps, but not squarely", c:C.brass},
                  off:{t:"not this threat", c:C.muted},
                };
                if(!bp.length) return (
                  <div style={{fontSize:14,color:C.muted}}>You bought nothing this round.</div>
                );
                const anyStrong = bp.some(id=>verdictOf(id)==="strong");
                const anyPartial = bp.some(id=>verdictOf(id)==="partial");
                return (
                  <>
                    <div style={{display:"grid",gap:9}}>
                      {bp.map(id=>{
                        const k = verdictOf(id);
                        const v = LBL[k];
                        const why = (scen.why||{})[id];
                        return (
                          <div key={id} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                            <span style={{width:9,height:9,borderRadius:"50%",flexShrink:0,
                              marginTop:6,background:v.c}}/>
                            <div style={{minWidth:0}}>
                              <div style={{display:"flex",gap:9,alignItems:"baseline",flexWrap:"wrap"}}>
                                <span style={{fontSize:14.5,fontWeight:600}}>{card(id)?.name}</span>
                                <span style={{fontFamily:MONO,fontSize:13,color:v.c}}>{v.t}</span>
                              </div>
                              <div style={{fontSize:13.5,lineHeight:1.5,color:C.muted,marginTop:2}}>
                                {why || (k==="off"
                                  ? "nothing in this scenario turns on it, which does not make it a bad purchase in general"
                                  : "relevant here, though the key does not record why")}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{fontSize:14,lineHeight:1.6,marginTop:11,
                      color: anyStrong ? C.ok : anyPartial ? C.brass : C.warn}}>
                      {anyStrong
                        ? `At least one purchase works directly against ${scen.title.toLowerCase()}, so it should be less likely than when you placed it. Likelihood runs down the grid — move the marker up a row.`
                        : anyPartial
                        ? `Nothing you bought works directly against ${scen.title.toLowerCase()}, though something is adjacent. Likelihood probably sits where it is.`
                        : `Nothing you bought works against ${scen.title.toLowerCase()}. It is as likely now as it was before you spent anything.`}
                    </div>
                    <div style={{fontFamily:MONO,fontSize:13,color:C.muted,marginTop:7,lineHeight:1.6}}>
                      Severity does not move — controls change how often something happens, not who
                      gets hurt when it does. Do you want to move the marker now that you can see this?
                    </div>
                  </>
                );
              })()}

              {!control && injects.length>0 && (
                <div style={{marginTop:13,paddingTop:11,borderTop:`1px solid ${C.edge}`}}>
                  <div style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".08em",
                    textTransform:"uppercase",color:C.solution}}>
                    Delayed threats — what your purchases do against each
                  </div>
                  <div style={{display:"grid",gap:9,marginTop:8}}>
                    {injects.map(x=>{
                      const bp = [...(t.purchases||[]), ...(t.everBought||[])];
                      const hits = bp.filter(id=>x.def.strong.includes(id));
                      const near = bp.filter(id=>x.def.partial.includes(id));
                      const col = hits.length ? C.ok : near.length ? C.brass : C.warn;
                      return (
                        <div key={x.id} style={{display:"flex",gap:9,alignItems:"flex-start"}}>
                          <span style={{width:17,height:17,borderRadius:2,flexShrink:0,marginTop:1,
                            fontFamily:MONO,fontSize:12,display:"flex",alignItems:"center",
                            justifyContent:"center",background:C.solution,color:C.onAccent}}>{x.label}</span>
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:14.5,fontWeight:600}}>{x.title}</div>
                            <div style={{fontSize:13.5,lineHeight:1.55,color:col,marginTop:2}}>
                              {hits.length
                                ? `Addressed by ${hits.map(id=>card(id)?.name).join(" and ")}: ${x.def.why?.[hits[0]] || "it works directly against this"}.`
                                : near.length
                                ? `Only partly: ${near.map(id=>card(id)?.name).join(" and ")} — ${x.def.why?.[near[0]] || "adjacent, not square on"}.`
                                : "Nothing you have in place works against this one. It will be more likely next engagement."}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted,marginTop:7,lineHeight:1.6}}>
                    Counts what you bought this round and what was already installed — a new threat
                    meets every control the organization has, not just this year's.
                  </div>
                </div>
              )}

              {useStanding && standing.length>0 && (
                <div style={{marginTop:13,paddingTop:11,borderTop:`1px solid ${C.edge}`}}>
                  <div style={{fontFamily:MONO,fontSize:12.5,letterSpacing:".08em",
                    textTransform:"uppercase",color:C.solution}}>
                    Separately: the problems this client already had
                  </div>
                  <div style={{display:"grid",gap:7,marginTop:8}}>
                    {standing.map(r=>{
                      const by = r.cards.filter(c=>bought.includes(c));
                      const done = by.length>0;
                      return (
                        <div key={r.id} style={{display:"flex",gap:9,alignItems:"flex-start"}}>
                          <span style={{width:17,height:17,borderRadius:2,flexShrink:0,marginTop:1,
                            fontFamily:MONO,fontSize:12.5,display:"flex",alignItems:"center",
                            justifyContent:"center",background:done?C.ok:"transparent",
                            border:`1.5px solid ${done?C.ok:C.warn}`,
                            color:done?C.onAccent:C.warn}}>{String.fromCharCode(64+r.id)}</span>
                          <div>
                            <div style={{fontSize:14,lineHeight:1.5}}>{r.text}</div>
                            <div style={{fontFamily:MONO,fontSize:13,marginTop:2,
                              color:done?C.ok:C.warn}}>
                              {done
                                ? `covered by ${by.map(c=>card(c)?.name).join(" and ")}`
                                : "still open — nothing you bought touches this"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{display:"flex",gap:28,flexWrap:"wrap",alignItems:"flex-start"}}>
            <div>
              <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted,marginBottom:7}}>
                Same threat, re-placed with your controls in place.
              </div>
              {placeSwitch("post")}
              <Matrix pre={t.pre} post={t.post} standing={standing} addressed={addressedIds}
                grid={grid} extras={injects}
                interactive={isOwner} onPick={pickFor("post")}/>
            </div>
            <div style={{flex:"1 1 260px",minWidth:240}}>
              <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>
                Which purchase moved the marker, and by how many {grid.n===5?"notches":"rows"}?
              </label>
              <textarea value={t.postWhy||""} disabled={!isOwner} style={{marginBottom:10}}
                onChange={e=>saveTeam(teamN,{postWhy:e.target.value})}
                placeholder="Name the card and the line of the scenario it answers. If nothing moved it, say so."/>
              <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>
                Something still gets through. What is it?
              </label>
              <textarea value={t.residual} disabled={!isOwner}
                onChange={e=>saveTeam(teamN,{residual:e.target.value})}
                placeholder="What an attacker could still do, given what you bought."/>
              <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted,marginTop:10,lineHeight:1.6}}>
                Bought: {(t.purchases||[]).map(id=>card(id)?.name).join(" · ")||"nothing"}
              </div>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
