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

const BUILD = "2026-08-28.2054";

const MONO = "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, monospace";
const SANS = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

const SOLUTIONS = [
  [1,"Software Updates",1,"F","CIS 7 (7.1, 7.3, 7.4)"],
  [2,"Social Engineering Awareness",1,"F","CIS 14 (14.1–14.3)"],
  [3,"Deepfake & AI Fraud Awareness",1,"F","CIS 14 (14.2, 14.9)"],
  [4,"Identity & Access Management",1,"F","CIS 6 (6.1, 6.2, 6.7)"],
  [5,"Password & Authentication",1,"F","CIS 5, 6 (5.2, 6.3–6.5)"],
  [6,"Backup & Recovery",1,"F","CIS 11 (11.1–11.4)"],
  [7,"Account Lifecycle Management",1,"F","CIS 5 (5.1, 5.3, 5.5)"],
  [8,"Physical Security",1,"F","No dedicated control"],
  [9,"Asset Inventory",1,"F","CIS 1 (1.1, 1.2)"],
  [10,"Software Inventory",1,"F","CIS 2 (2.1–2.3)"],
  [11,"Secure Configuration",1,"F","CIS 4 (4.1, 4.2, 4.6, 4.7)"],
  [12,"Email & Browser Protections",1,"F","CIS 9 (9.1, 9.2, 9.6)"],
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


/* ---- Scenario library. Mirrors Appendix C of the facilitator manual.
   Expert keys are shown to the facilitator only, never to players. ---- */
const SCENARIOS = [
  {id:1, care:false, budget:6, title:"Payroll Redirection",
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
];
const scenarioById = (id) => SCENARIOS.find(x=>x.id===id);

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
function coverage(purchases=[], scen){
  if(!scen) return {score:0, move:0, verdict:"unscored"};
  const strong = purchases.filter(id=>scen.strong.includes(id));
  const partial = purchases.filter(id=>scen.partial.includes(id));
  const score = strong.length*2 + partial.length;
  const move = score>=2 ? -1 : score===1 ? 0 : +1;
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
const LIKELIHOOD = ["Not Likely","Likely","Very Likely"];
const SEVERITY = ["Not Severe","Severe","Very Severe"];
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
const CFG_KEY = "game:config";
const teamKey = (n) => `game:team:${n}`;
const card = (id) => SOLUTIONS.find(c=>c.id===id) || MODIFIERS.find(c=>c.id===id);

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

function Matrix({pre,post,onPick,interactive,compact,standing=[],addressed=[]}){
  const cell = compact?34:58;
  return (
    <div style={{display:"inline-block"}}>
      <div style={{display:"grid",gridTemplateColumns:`auto repeat(3,${cell}px)`,gap:3}}>
        <div/>
        {SEVERITY.map(s=>(
          <div key={s} style={{fontFamily:MONO,fontSize:12.5,color:C.muted,textAlign:"center",paddingBottom:3}}>
            {compact? s.split(" ")[0] : s}
          </div>
        ))}
        {LIKELIHOOD.map((l,li)=>(
          <React.Fragment key={l}>
            <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted,alignSelf:"center",paddingRight:6,textAlign:"right"}}>
              {compact? l.split(" ")[0] : l}
            </div>
            {SEVERITY.map((s,si)=>{
              const isPre = pre && pre.l===li && pre.s===si;
              const isPost = post && post.l===li && post.s===si;
              const heat = (li+si)/4;
              return (
                <button key={s} disabled={!interactive} onClick={()=>onPick && onPick(li,si)}
                  aria-label={`${l}, ${s}`}
                  style={{
                    width:cell,height:cell,borderRadius:3,cursor:interactive?"pointer":"default",
                    border:`1px solid ${C.edge}`,
                    background:C.name==="dark" ? `rgba(209,118,111,${0.10+heat*0.22})` : `rgba(182,66,56,${0.07+heat*0.18})`,
                    display:"flex",alignItems:"center",justifyContent:"center",gap:3,padding:0,
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
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      {!compact && (
        <div style={{display:"flex",gap:14,marginTop:8,fontFamily:MONO,fontSize:12.5,color:C.muted}}>
          <span><span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",border:`2px solid ${C.muted}`,marginRight:5}}/>before</span>
          <span><span style={{display:"inline-block",width:9,height:9,borderRadius:"50%",background:C.brass,marginRight:5}}/>after</span>
        </div>
      )}
    </div>
  );
}

function CardTile({c,state,onClick,disabled,note}){
  const bought = state==="bought";
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        textAlign:"left",width:"100%",padding:"9px 11px",borderRadius:4,
        border:`1px solid ${bought?C.brass:C.edge}`,
        background: bought ? "rgba(217,180,91,.10)" : C.panel,
        cursor: disabled?"not-allowed":"pointer", opacity: disabled&&!bought?.45:1,
        borderLeft:`3px solid ${C.solution}`, display:"block",
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
            what belongs on the list. And it gives you something to look up: search
            &ldquo;CIS Control 7&rdquo; after today and you will find the full detail, which
            &ldquo;keep things patched&rdquo; would not have given you.
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
      const claimHash = await hashCode(code);
      const wrote = await sSet(CFG_KEY, {...(c||{}), facilitatorId:clientId, claimHash, claimCode:null,
        condition: c?.condition || URL_CONDITION || "solutions",
        phase:c?.phase||"setup", dims:c?.dims||DEFAULT_DIMS,
        teamCount:c?.teamCount??DEFAULT_TEAMS,
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
  const loaded = scenarioById(cfg?.scenarioId);

  const loadScenario = async (id)=>{
    const x = scenarioById(id); if(!x) return;
    setOrg(x.org); setScenario(x.text);
    // Pre-built scenarios supply the threat model, so lock it. Teams that join
    // later read it from the scenario rather than needing it written to them.
    await saveCfg({scenarioId:x.id, org:x.org, scenario:x.text, budget:x.budget,
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
     two arms are to be compared. */
  const buildHand = (owned, scen)=>{
    const free = (tier)=>SOLUTIONS.filter(c=>c.tier===tier && !owned.includes(c.id)).map(c=>c.id);
    const must = [];
    if (scen){
      const s1 = (scen.strong||[]).filter(id=>!owned.includes(id));
      const p1 = (scen.partial||[]).filter(id=>!owned.includes(id));
      if (s1.length) must.push(sample(s1,1)[0]);
      if (p1.length) must.push(sample(p1,1)[0]);
    }
    const pool = (tier)=>free(tier).filter(id=>!must.includes(id));
    const rest = [...sample(pool("F"), Math.max(0,6-must.length)),
                  ...sample(pool("E"),1), ...sample(pool("A"),1)];
    return [...must, ...rest].slice(0,8);
  };

  const dealAll = async ()=>{
    const scen = scenarioById(cfg?.scenarioId);
    const shared = cfg?.sameDeal !== false;
    const commonHand = shared ? buildHand([], scen) : null;
    const commonMods = shared ? sample(MODIFIERS.map(m=>m.id),3) : null;
    for (const n of ids){
      const t = teams[n]; if(!t?.joined) continue;
      const owned = t.everBought||[];
      // an identical deal still has to skip cards a team already installed
      const hand = shared
        ? (owned.length ? buildHand(owned, scen) : commonHand)
        : buildHand(owned, scen);
      await saveTeam(n,{hand, modHand: shared ? commonMods : sample(MODIFIERS.map(m=>m.id),3),
        purchases:[], modifiers:[]});
    }
    setStatus(shared ? "Dealt — every team has the same eight cards."
                     : "Dealt — hands vary by team.");
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
    const scen = scenarioById(cfg?.scenarioId);
    if(!scen) return [];
    return ids.filter(n=>{
      const t = teams[n]; if(!t?.joined) return false;
      const pos = t.post || t.pre; if(!pos) return false;
      const deferred = (t.modifiers||[]).some(m=>m.id===28 && m.status==="accepted");
      const cov = coverage(t.purchases||[], scen);
      return pos.l + cov.move + (deferred?1:0) > LIKELIHOOD.length-1;
    });
  })();

  const nextEngagement = async ()=>{
    const scen = scenarioById(cfg?.scenarioId);
    const base = cfg?.budget ?? 6;
    for (const n of ids){
      const t = teams[n];
      if(!t?.joined) continue;

      const deferred = (t.modifiers||[]).some(m=>m.id===28 && m.status==="accepted");
      // Controls stay installed. An organization does not forget its backups.
      const installed = Array.from(new Set([...(t.everBought||[]), ...(t.purchases||[])]));
      const cov = coverage(t.purchases||[], scen);
      // Without a loaded scenario there is no key to score against, so treat an
      // empty portfolio as unaddressed rather than freezing the board.
      if (!scen && !(t.purchases||[]).length) { cov.move = 1; cov.verdict = "unaddressed"; }

      let pos = t.post || t.pre || null;
      let realized = null, drift = t.drift||0;
      if (pos){
        const move = cov.move + (deferred ? 1 : 0);   // deferring costs one cell of progress
        const target = pos.l + move;
        if (target > LIKELIHOOD.length-1){
          realized = {at:Date.now(), outcome:resolveRealization(installed)};
          // The incident forces attention, so the threat resets to the middle
          // rather than pinning at Very Likely forever. A team can climb out.
          pos = {l:1, s:pos.s};
        } else {
          const clamped = Math.max(0, target);
          if (clamped > pos.l) drift = drift+1;
          pos = {l:clamped, s:pos.s};                 // likelihood only; severity never moves
        }
      }

      // Fresh allocation each engagement. Banking adds to it; an unhandled
      // incident costs a point of it, which is the Response line made real.
      // Standing risks move on the same logic: addressed ones ease, ignored ones worsen.
      const scenStanding = scen?.standing || [];
      const standingPos = {};
      let standingIgnored = 0;
      scenStanding.forEach(r=>{
        const cur = (t.standingPos||{})[r.id] || r.pos;
        const covered = r.cards.some(c=>installed.includes(c));
        const l = covered ? Math.max(0, cur.l-1) : Math.min(LIKELIHOOD.length-1, cur.l+1);
        if(!covered) standingIgnored++;
        standingPos[r.id] = {l, s:cur.s};
      });

      let nextBudget = base + (deferred ? 4 : 0);
      if (realized && !installed.includes(13)) nextBudget = Math.max(3, nextBudget-1);

      await saveTeam(n,{
        ...blankTeam(n), name:t.name, members:t.members, ownerUid:t.ownerUid, joined:true,
        threat:t.threat, pre:pos, post:null,
        engagement:(t.engagement||1)+1, everBought:installed, drift, realized,
        standingPos, standingIgnored,
        lastVerdict: realized ? "realized" : cov.verdict,
        budgetOverride: nextBudget,
      });
    }
    await saveCfg({phase:"p1", timerEnd:null});
    setStatus("Next engagement. Controls stay installed; budgets refreshed; threats moved on coverage.");
  };

  const endSession = async ()=>{
    const label = new Date().toISOString().slice(0,16).replace(/[:T]/g,"-");
    const snapshot = {cfg, teams, archivedAt:Date.now()};
    await sSet(`archive:${label}`, snapshot);          // keep a copy first
    for (const n of ids) await sSet(teamKey(n), blankTeam(n));
    await saveCfg({phase:"setup", org:"", scenario:"", timerEnd:null});
    setTeams({});
    setStatus(`Board cleared. A copy was kept as archive:${label}.`);
  };

  const exportData = ()=>{
    const rows = [["team","org","scenario","condition","measures_count","measures","engagement","drift","realized","threat_method","threat_impact",
      "verdict","standing_ignored","threat_resource","threat_motive","pre_likelihood","pre_severity","post_likelihood",
      "post_severity","budget","spent","purchases","ever_purchased","modifiers_accepted","residual","debrief_1","debrief_2","debrief_3","carry_forward","recommendation"]];
    ids.forEach(n=>{
      const t=teams[n]; if(!t?.joined) return;
      const spent=(t.purchases||[]).reduce((s,id)=>s+(card(id)?.cost||0),0);
      rows.push([t.name,cfg?.org||"",scenarioById(cfg?.scenarioId)?.title||"",
        cfg?.condition||"solutions",(t.measures||[]).length,(t.measures||[]).join("; "),t.engagement||1,t.drift||0,t.realized?"yes":"no",
        t.lastVerdict||"",t.standingIgnored??"",t.threat.method,t.threat.impact,t.threat.resource,t.threat.motive,
        t.pre?LIKELIHOOD[t.pre.l]:"",t.pre?SEVERITY[t.pre.s]:"",
        t.post?LIKELIHOOD[t.post.l]:"",t.post?SEVERITY[t.post.s]:"",
        t.budgetOverride ?? cfg?.budget ?? 6, spent,
        (t.purchases||[]).map(id=>card(id)?.name).join("; "),
        (t.everBought||[]).map(id=>card(id)?.name).join("; "),
        (t.modifiers||[]).filter(m=>m.status==="accepted").map(m=>card(m.id)?.name).join("; "),
        (t.residual||"").replace(/\n/g," "),
        ((t.debriefAnswers||{})[0]||"").replace(/\n/g," "),
        ((t.debriefAnswers||{})[1]||"").replace(/\n/g," "),
        ((t.debriefAnswers||{})[2]||"").replace(/\n/g," "),
        (t.carryAnswer||"").replace(/\n/g," "),
        (t.recommendation||"").replace(/\n/g," ")]);
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
          <div style={{display:"flex",gap:7,marginBottom:8,flexWrap:"wrap"}}>
            <select value={pick} onChange={e=>setPick(Number(e.target.value))} style={{flex:"1 1 180px"}}>
              {SCENARIOS.map(x=>(
                <option key={x.id} value={x.id} style={{background:C.panel}}>
                  {x.id}. {x.title}{x.care?" (care)":""}
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
            Deal 8 controls + 3 modifiers to every team
          </button>
          <div style={{display:"flex",gap:6,marginTop:7,flexWrap:"wrap"}}>
            {[[true,"Same deal for all"],[false,"Vary by team"]].map(([v,lbl])=>(
              <button key={String(v)} onClick={()=>saveCfg({sameDeal:v})}
                style={{...btn((cfg?.sameDeal!==false)===v?"primary":"ghost"),fontSize:12.5}}>
                {lbl}</button>
            ))}
          </div>
          <p style={{fontFamily:MONO,fontSize:12.5,color:C.muted,lineHeight:1.6,marginTop:6}}>
            Every hand is guaranteed at least one card that addresses the drawn threat, so no
            team is punished for its deal. Keep <b>same deal</b> when collecting data.
          </p>
          <div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${C.edge}`}}>
            <label style={{fontFamily:MONO,fontSize:12.5,color:C.muted}}>Campaign — same client, later in the term</label>
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
                "if they were already there, and receive 10 points.\n\nHands, purchases and modifiers "+
                "are cleared. Export the CSV first.")) nextEngagement(); }}>
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
                onClick={()=>saveCfg({timerEnd:Date.now()+(PHASE_MINUTES[phase]||8)*60000})}>
                Start {PHASE_MINUTES[phase]||8} min for this phase
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
                    </div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap",margin:"7px 0"}}>
                      {Object.entries(DIM_META).map(([k,m])=> t.threat[k] ? (
                        <span key={k} style={{fontFamily:MONO,fontSize:12.5,padding:"2px 6px",borderRadius:2,
                          border:`1px solid ${m.color}`,color:m.color}}>{t.threat[k]}</span>
                      ):null)}
                    </div>
                    <Tokens total={budget} spent={spent}/>
                    <div style={{fontFamily:MONO,fontSize:12.5,color:C.muted,marginTop:6,lineHeight:1.5}}>
                      {(t.purchases||[]).length
                        ? (t.purchases||[]).map(id=>card(id)?.name).join(" · ")
                        : "nothing bought yet"}
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    <Matrix pre={t.pre} post={t.post} compact/>
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

function OverlayMatrix({teams,ids,size=118}){
  const at = (l,s,which)=> ids.filter(n=>{
    const p = teams[n]?.[which]; return p && p.l===l && p.s===s;
  });
  return (
    <div style={{display:"grid",gridTemplateColumns:`auto repeat(3,${size}px)`,gap:6}}>
      <div/>
      {SEVERITY.map(s=>(
        <div key={s} style={{fontFamily:MONO,fontSize:14.5,color:C.muted,textAlign:"center",paddingBottom:5}}>{s}</div>
      ))}
      {LIKELIHOOD.map((l,li)=>(
        <React.Fragment key={l}>
          <div style={{fontFamily:MONO,fontSize:14.5,color:C.muted,alignSelf:"center",
            paddingRight:10,textAlign:"right"}}>{l}</div>
          {SEVERITY.map((sv,si)=>{
            const heat=(li+si)/4;
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
          <OverlayMatrix teams={teams} ids={ids}/>
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
                        color: spent>=budget ? C.brass : C.paper, fontVariantNumeric:"tabular-nums"}}>
                        {budget-spent}
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
  const scen = scenarioById(cfg?.scenarioId);
  const useStanding = cfg?.standingOn && scen?.standing?.length;
  /* When the scenario supplies the threat model, show it from the scenario
     rather than from team state — otherwise a team that joins after the
     facilitator loaded it sees four empty, un-editable boxes. */
  const locked = !!(cfg?.threatLocked && scen?.draw);
  const threat = locked ? scen.draw : (t?.threat || {});
  // Positions carry forward once play has started, otherwise use the scenario's
  const standing = useStanding
    ? (scen.standing||[]).map(r=>({...r, at:(t?.standingPos||{})[r.id] || r.pos || {l:1,s:1}}))
    : [];
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

  const toggleBuy = (id)=>{
    const c = card(id);
    const has = (t.purchases||[]).includes(id);
    if(has) return saveTeam(teamN,{purchases:t.purchases.filter(x=>x!==id)});
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
              You left this at <b>Very Likely</b> and deferred again. The attack succeeded.
              What follows is decided by what you have bought across every engagement, not by chance.
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
                        {LIKELIHOOD[r.at.l]} · {SEVERITY[r.at.s]}
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
              <Matrix pre={t.pre} post={t.post} standing={standing} addressed={addressedIds}
                interactive={isOwner} onPick={(l,s)=>saveTeam(teamN,{pre:{l,s}})}/>
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
                    disabled={unaffordable || !isOwner}
                    onClick={()=>toggleBuy(id)} note={bought?"bought":unaffordable?"not enough left":null}/>;
                })}
              </div>

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
              <Matrix pre={t.pre} post={t.post} standing={standing} addressed={addressedIds}
                interactive={isOwner} onPick={(l,s)=>saveTeam(teamN,{post:{l,s}})}/>
            </div>
            <div style={{flex:"1 1 260px",minWidth:240}}>
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
