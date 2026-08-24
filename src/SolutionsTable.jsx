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

const C = {
  slate: "#161B22", panel: "#1E252E", edge: "#2C3540",
  paper: "#F6F4EF", ink: "#1A1F26", muted: "#8B97A6",
  impact: "#3E7CB1", motive: "#E08A3C", resource: "#C0453B",
  method: "#4E8C5A", solution: "#7C5FA8", brass: "#D9B45B",
  ok: "#4E8C5A", warn: "#C0453B",
};
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

const MODIFIERS = [
  [22,"Defense in Depth","Name two purchases that fail by different means."],
  [23,"Fail Safe Defaults","Name the state a purchased control fails into."],
  [24,"Least Privilege","Requires card 4 or 7. Name one access you would reduce and what breaks."],
  [25,"Human Factors","Name a purchase staff will circumvent, and how."],
  [26,"Risk Acceptance","Played instead of a purchase. Name the risk and its owner."],
  [27,"Compensating Control","Name what you cannot afford and what the substitute misses."],
  [28,"Deferred Investment","Cap spend at 4, bank 2. Name your exposure and for how long."],
].map(([id,name,demand])=>({id,name,demand,cost:0}));


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
   debrief:["The attack was technically trivial and you rated it Very Severe. What made it severe, and would it be severe at a different organization?",
            "Nobody can buy a callback rule. Which purchase would you trade for one sentence in a written procedure?",
            "The voice on the phone was cloned. Does awareness training still work when familiarity stops being evidence?"]},

  {id:2, care:false, budget:6, title:"Ransomware",
   org:"Cedar Ridge Health Clinic — 2 providers, 900 patients",
   target:"Once it has happened, prevention cards are worth nothing and recovery cards are worth everything.",
   text:"Cedar Ridge is a two-provider clinic serving about nine hundred patients in a county with no other primary care. On Monday morning the front desk cannot open the scheduling system. Every file on the shared drive has a new extension, and a text file on the desktop asks for payment in cryptocurrency. The practice manager thinks there is a backup, but it is on a drive plugged into the same server, and nobody has ever restored from it.",
   draw:{method:"Technological Attack",impact:"Physical Wellbeing",resource:"Money",motive:"Personal Gain"},
   strong:[6,13,16], partial:[1,12,21], weak:[19],
   standing:[{id:1, text:"The scheduling software has not been updated in two years.", pos:{l:2,s:2}, cards:[1,10]}, {id:2, text:"Nobody has checked whether the anti-malware is still running.", pos:{l:1,s:2}, cards:[16,9]}],
   debrief:["The backup existed and was useless. What is the difference between having a backup and having a recovery?",
            "Impact is Physical Wellbeing, not Financial. What does a clinic without scheduling do to a patient?",
            "If you bought only prevention, describe your Monday."]},

  {id:3, care:true, budget:6, title:"A Laptop Leaves the Building",
   org:"Wilder House — a twelve-bed shelter",
   target:"When Human Impact is physical safety, ordinary controls carry stakes students have not attached to them before.",
   text:"Wilder House is a twelve-bed shelter. A caseworker's laptop was taken from her car in a grocery store parking lot on Saturday. It holds an offline copy of the intake spreadsheet: names, dates of birth, the schools children attend, and current addresses for eleven families. The laptop has a login password. Nothing else.",
   draw:{method:"Physical Attack",impact:"Physical Wellbeing",resource:"Entitlement",motive:"Curiosity"},
   strong:[14,8,4], partial:[9,13], weak:[15,18],
   standing:[{id:1, text:"Staff use personal phones for client contact.", pos:{l:2,s:2}, cards:[4,14]}, {id:2, text:"The room holding paper intake files is left unlocked.", pos:{l:1,s:2}, cards:[8]}],
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
   debrief:["Nobody attacked this organization. Is this a security incident?",
            "The right answer costs one point and takes an afternoon. Why is it the one nobody does?",
            "How would this organization even produce a list of who has access?"]},

  {id:5, care:false, budget:10, title:"The Vendor's Breach",
   org:"Northbridge School District — four rural schools",
   target:"Nothing you buy internally helps. The only real control was written a year earlier in a contract.",
   text:"Northbridge is a rural district of four schools. Their bus routing and student scheduling run on a hosted platform used by two hundred districts. On Thursday a reporter calls the superintendent for comment on a breach at that vendor. The district has had no notification. The vendor's support line has a recorded message. The data includes student names, home addresses, and bus stop times.",
   draw:{method:"Indirect Attack",impact:"Relationships",resource:"Technical Expertise",motive:"Personal Gain"},
   strong:[17,13], partial:[9,21], weak:[1,11,16,18],
   standing:[{id:1, text:"Nobody has a list of the cloud services the district uses.", pos:{l:2,s:1}, cards:[17,9]}, {id:2, text:"Teacher accounts stay active after they leave.", pos:{l:2,s:1}, cards:[7]}],
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
   debrief:["You had ten points. What is the cheapest purchase that actually closes this?",
            "Penetration testing would have found it. Was it worth three points here, and what would have to be true first?",
            "A utility can post public notices. What is the worst version of this that does not involve stealing anything?"]},

  {id:7, care:true, budget:10, title:"The Trusted Paralegal",
   org:"Eastgate Legal Aid — housing and immigration",
   target:"Every preventive control fails, because the access was authorized. Detection is the only lever left.",
   text:"Eastgate Legal Aid handles housing and immigration matters. A paralegal of six years has legitimate access to the case system. A client reports that her landlord seems to know the contents of a filing that has not been served. The paralegal and the landlord attend the same church. There is no evidence of an intrusion, and nothing in the system is broken.",
   draw:{method:"Processes",impact:"Emotional Wellbeing",resource:"Entitlement",motive:"Desire or Obsession"},
   strong:[15,4,20], partial:[13,17], weak:[12,14,1],
   standing:[{id:1, text:"Staff email client files to personal accounts to work at home.", pos:{l:2,s:2}, cards:[12,14]}, {id:2, text:"Two former staff still have building keys.", pos:{l:1,s:1}, cards:[8,7]}],
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
   debrief:["Someone bought Software Updates. What happens when the vendor has stopped shipping them?",
            "If you deferred, name the exposure and say for how long. Would you put that in writing to the board?",
            "Revisit this later and drift the threat. Was deferring still the right call?"]},

  {id:10, care:false, budget:10, title:"Donor Records in a Shared Mailbox",
   org:"Second Chance Animal Rescue",
   target:"Obligations survive the incident. Notification is not a technical control and cannot be bought afterwards.",
   text:"Second Chance runs on donations and a shared mailbox that six volunteers access with the same password. On Friday the mailbox began sending donation appeals to the entire contact list from an address that is not theirs. The mailbox holds four years of correspondence, including scanned cheques with routing numbers and a spreadsheet of major donors.",
   draw:{method:"Manipulation or Coercion",impact:"Financial Wellbeing",resource:"Money",motive:"Personal Gain"},
   strong:[5,7,13], partial:[12,15,21], weak:[18,16],
   standing:[{id:1, text:"Volunteer accounts are never removed.", pos:{l:2,s:1}, cards:[7]}, {id:2, text:"There is no record of who changes the donation page.", pos:{l:1,s:1}, cards:[15,11]}],
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
  {id:"p1", label:"Phase 1 — Threat & placement"},
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
  modifiers:[], residual:"", ownerUid:null,
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
          background: used ? "transparent" : `radial-gradient(circle at 34% 30%, #F0D488, ${C.brass})`,
          border: used ? `1.5px dashed ${C.edge}` : `1.5px solid #A8873F`,
          boxShadow: used ? "none" : "0 1px 3px rgba(0,0,0,.45)",
          transition:"all .18s ease",
        }}/>;
      })}
      <span style={{fontFamily:MONO,fontSize:12,color:C.muted,marginLeft:6}}>
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
          <div key={s} style={{fontFamily:MONO,fontSize:9,color:C.muted,textAlign:"center",paddingBottom:3}}>
            {compact? s.split(" ")[0] : s}
          </div>
        ))}
        {LIKELIHOOD.map((l,li)=>(
          <React.Fragment key={l}>
            <div style={{fontFamily:MONO,fontSize:9,color:C.muted,alignSelf:"center",paddingRight:6,textAlign:"right"}}>
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
                    background:`rgba(192,69,59,${0.06+heat*0.20})`,
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
        <div style={{display:"flex",gap:14,marginTop:8,fontFamily:MONO,fontSize:10,color:C.muted}}>
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
        <span style={{fontFamily:SANS,fontSize:13,color:C.paper,fontWeight:500,lineHeight:1.25}}>{c.name}</span>
        <span style={{fontFamily:MONO,fontSize:11,color:c.cost===0?C.muted:C.brass,whiteSpace:"nowrap"}}>
          {c.cost===0?"free":`${c.cost} pt${c.cost>1?"s":""}`}
        </span>
      </div>
      <div style={{fontFamily:MONO,fontSize:10,color:C.muted,marginTop:3}}>
        {String(c.id).padStart(2,"0")} · {c.ctrl || c.demand}
      </div>
      {note && <div style={{fontFamily:MONO,fontSize:10,color:C.brass,marginTop:4}}>{note}</div>}
    </button>
  );
}

function Section({title,children,right}){
  return (
    <section style={{marginBottom:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",
        borderBottom:`1px solid ${C.edge}`,paddingBottom:5,marginBottom:10}}>
        <h3 style={{fontFamily:MONO,fontSize:11,letterSpacing:".09em",textTransform:"uppercase",
          color:C.muted,margin:0,fontWeight:500}}>{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

const btn = (kind="ghost") => ({
  fontFamily:MONO,fontSize:12,padding:"7px 13px",borderRadius:3,cursor:"pointer",
  border:`1px solid ${kind==="primary"?C.brass:C.edge}`,
  background: kind==="primary"?"rgba(217,180,91,.14)":kind==="danger"?"rgba(192,69,59,.14)":"transparent",
  color: kind==="primary"?C.brass:kind==="danger"?"#E88C84":C.paper,
});

/* ---------------- root ---------------- */

export default function SolutionsTable(){
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
  };

  const shell = (children)=>(
    <div style={{minHeight:"100%",background:C.slate,color:C.paper,fontFamily:SANS,padding:"20px 18px 40px"}}>
      <style>{`
        button:focus-visible{outline:2px solid ${C.brass};outline-offset:2px}
        input,textarea,select{font-family:${MONO};font-size:12px;background:${C.panel};
          color:${C.paper};border:1px solid ${C.edge};border-radius:3px;padding:7px 9px;width:100%;box-sizing:border-box}
        textarea{resize:vertical;min-height:56px;line-height:1.5}
        @media (prefers-reduced-motion: reduce){*{transition:none!important}}
      `}</style>
      <header style={{maxWidth:1100,margin:"0 auto 22px",display:"flex",
        justifyContent:"space-between",alignItems:"flex-end",gap:12,flexWrap:"wrap"}}>
        <div>
          <div style={{fontFamily:MONO,fontSize:10,letterSpacing:".16em",color:C.solution,textTransform:"uppercase"}}>
            Solutions dimension
          </div>
          <h1 style={{fontFamily:SANS,fontSize:26,margin:"3px 0 0",fontWeight:600,letterSpacing:"-.02em"}}>
            Solutions Table
          </h1>
        </div>
        <div style={{fontFamily:MONO,fontSize:11,color:C.muted,textAlign:"right"}}>
          {cfg?.org ? <div style={{color:C.paper}}>{cfg.org}</div> : null}
          <div>{PHASES.find(p=>p.id===(cfg?.phase||"setup"))?.label}</div>
          {status && <div style={{color:C.brass,marginTop:3}}>{status}</div>}
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
      await saveCfg({...(c||{}), facilitatorId:clientId, claimHash, claimCode:null,
        phase:c?.phase||"setup", dims:c?.dims||DEFAULT_DIMS,
        teamCount:c?.teamCount??DEFAULT_TEAMS,
        scenarioId:c?.scenarioId ?? (fresh ? s1.id : undefined),
        budget:c?.budget ?? (fresh ? s1.budget : 6),
        org:c?.org || (fresh ? s1.org : ""),
        scenario:c?.scenario || (fresh ? s1.text : "")});
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
      <p style={{color:C.muted,fontSize:14,lineHeight:1.6,marginTop:0}}>
        A shared board for the Solutions dimension. Everyone opens the same link.
        One person takes the facilitator role; everyone else joins a team.
      </p>
      {cfg?.org && (
        <div style={{background:C.panel,border:`1px solid ${C.edge}`,borderRadius:4,padding:12,marginBottom:16}}>
          <div style={{fontFamily:MONO,fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:".08em"}}>Session in progress</div>
          <div style={{fontSize:15,marginTop:4}}>{cfg.org}</div>
        </div>
      )}
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button style={{...btn("primary"),padding:"11px 20px"}} onClick={onPlayer}>Join a team</button>
        <button style={{...btn(),padding:"11px 20px"}} onClick={onFac}>Take the facilitator role</button>
        <button style={{...btn(),padding:"11px 20px"}} onClick={onProjector}>Open the projector view</button>
      </div>
      <p style={{color:C.muted,fontSize:12,marginTop:20,lineHeight:1.6,fontFamily:MONO}}>
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
        <p style={{color:C.muted,fontSize:13,lineHeight:1.6,marginTop:0}}>
          {claimed
            ? "Someone already holds this role. Enter the same code they used to take it over — useful if a browser was closed mid-session."
            : "Pick a code and share it only with co-facilitators. It is what lets you reclaim the role if your browser closes."}
        </p>
        <input value={code} onChange={e=>setCode(e.target.value)} placeholder="Facilitator code"
          disabled={waiting}
          onKeyDown={e=>{ if(e.key==="Enter"&&code.trim()&&!waiting) onClaim(code.trim()).then(setErr); }}/>
        {waiting && <div style={{fontFamily:MONO,fontSize:10.5,color:C.muted,marginTop:8}}>
          Signing in…</div>}
        {err && <div style={{color:"#E88C84",fontFamily:MONO,fontSize:11,marginTop:8}}>{err}</div>}
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
  const loaded = scenarioById(cfg?.scenarioId);

  const loadScenario = async (id)=>{
    const x = scenarioById(id); if(!x) return;
    setOrg(x.org); setScenario(x.text);
    await saveCfg({scenarioId:x.id, org:x.org, scenario:x.text, budget:x.budget, phase:"p1", timerEnd:null});
  };
  const applyDraw = async (x)=>{
    for (const n of ids){
      const t = teams[n]; if(!t?.joined) continue;
      await saveTeam(n,{threat:{...x.draw}});
    }
  };
  const phase = cfg?.phase||"setup";
  const budget = cfg?.budget??6;

  const dealAll = async ()=>{
    for (const n of ids){
      const t = teams[n]; if(!t?.joined) continue;
      const owned = t.everBought||[];
      const free = (tier)=>SOLUTIONS.filter(c=>c.tier===tier && !owned.includes(c.id)).map(c=>c.id);
      const found = free("F"), ext = free("E"), adv = free("A");
      const hand = [...sample(found,6),...sample(ext,1),...sample(adv,1)];
      await saveTeam(n,{hand, modHand:sample(MODIFIERS.map(m=>m.id),3), purchases:[], modifiers:[]});
    }
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
    const rows = [["team","org","engagement","drift","realized","threat_method","threat_impact",
      "verdict","standing_ignored","threat_resource","threat_motive","pre_likelihood","pre_severity","post_likelihood",
      "post_severity","budget","spent","purchases","ever_purchased","modifiers_accepted","residual"]];
    ids.forEach(n=>{
      const t=teams[n]; if(!t?.joined) return;
      const spent=(t.purchases||[]).reduce((s,id)=>s+(card(id)?.cost||0),0);
      rows.push([t.name,cfg?.org||"",t.engagement||1,t.drift||0,t.realized?"yes":"no",
        t.lastVerdict||"",t.standingIgnored??"",t.threat.method,t.threat.impact,t.threat.resource,t.threat.motive,
        t.pre?LIKELIHOOD[t.pre.l]:"",t.pre?SEVERITY[t.pre.s]:"",
        t.post?LIKELIHOOD[t.post.l]:"",t.post?SEVERITY[t.post.s]:"",
        t.budgetOverride ?? cfg?.budget ?? 6, spent,
        (t.purchases||[]).map(id=>card(id)?.name).join("; "),
        (t.everBought||[]).map(id=>card(id)?.name).join("; "),
        (t.modifiers||[]).filter(m=>m.status==="accepted").map(m=>card(m.id)?.name).join("; "),
        (t.residual||"").replace(/\n/g," ")]);
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
          <p style={{color:C.muted,fontSize:13,lineHeight:1.6,marginTop:0}}>
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
              <div style={{fontFamily:MONO,fontSize:10,color:C.solution,textTransform:"uppercase",
                letterSpacing:".08em"}}>Teaching target — facilitator only</div>
              <div style={{fontSize:12.5,lineHeight:1.55,margin:"5px 0 9px"}}>{loaded.target}</div>
              {loaded.care && (
                <div style={{fontFamily:MONO,fontSize:10.5,color:C.warn,lineHeight:1.55,marginBottom:9}}>
                  May land on personal experience. Offer the redraw to the team before reading it.
                </div>
              )}
              <div style={{fontFamily:MONO,fontSize:10,color:C.muted}}>Expert key</div>
              <div style={{fontSize:11.5,lineHeight:1.6,marginTop:4}}>
                <span style={{color:C.ok}}>Strong:</span> {loaded.strong.map(i=>card(i)?.name).join(", ")}<br/>
                <span style={{color:C.brass}}>Partial:</span> {loaded.partial.map(i=>card(i)?.name).join(", ")}<br/>
                <span style={{color:C.muted}}>Weak here:</span> {loaded.weak.map(i=>card(i)?.name).join(", ")}
              </div>
              <button style={{...btn(),marginTop:10,width:"100%",fontSize:11}} disabled={busy}
                onClick={()=>applyDraw(loaded)}>
                Also deal the suggested threat cards to every team
              </button>
            </div>
          )}
        </Section>

        <Section title="Session" right={<button style={btn()} onClick={onExit}>Leave</button>}>
          <label style={{fontFamily:MONO,fontSize:10,color:C.muted}}>Client organization</label>
          <input value={org} onChange={e=>setOrg(e.target.value)} placeholder="e.g. a volunteer-run food bank"
            onBlur={()=>saveCfg({org})} style={{marginBottom:10}}/>
          <label style={{fontFamily:MONO,fontSize:10,color:C.muted}}>Scenario read aloud</label>
          <textarea value={scenario} onChange={e=>setScenario(e.target.value)} onBlur={()=>saveCfg({scenario})}
            placeholder="One or two sentences the teams all start from."/>
          <div style={{marginTop:12}}>
            <label style={{fontFamily:MONO,fontSize:10,color:C.muted}}>Standing risks</label>
            <div style={{display:"flex",gap:6,marginTop:6}}>
              <button onClick={()=>saveCfg({standingOn:false})}
                style={{...btn(!cfg?.standingOn?"primary":"ghost"),fontSize:11}}>Off</button>
              <button onClick={()=>saveCfg({standingOn:true})}
                style={{...btn(cfg?.standingOn?"primary":"ghost"),fontSize:11}}>On — two per scenario</button>
            </div>
            <p style={{fontFamily:MONO,fontSize:10,color:C.muted,lineHeight:1.6,marginTop:6}}>
              Two problems the client already had, pre-placed on the matrix. Same budget, so
              teams must choose between today's incident and the chronic ones. Recommended from
              mid-course, not week one.
            </p>
          </div>

          <div style={{marginTop:12}}>
            <label style={{fontFamily:MONO,fontSize:10,color:C.muted}}>
              Teams — allow about {SEATS_PER_TEAM} students each
            </label>
            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
              {[6,8,10,12,16].map(k=>(
                <button key={k} onClick={()=>saveCfg({teamCount:k})}
                  style={{...btn((cfg?.teamCount??6)===k?"primary":"ghost"),fontSize:11}}>
                  {k} · up to {k*SEATS_PER_TEAM}
                </button>
              ))}
            </div>
            <p style={{fontFamily:MONO,fontSize:10,color:C.muted,lineHeight:1.6,marginTop:6}}>
              Reducing the count hides higher-numbered teams but does not delete them.
              Larger rooms refresh a little more slowly to keep request volume steady.
            </p>
          </div>

          <div style={{marginTop:12}}>
            <label style={{fontFamily:MONO,fontSize:10,color:C.muted}}>Budget — the organization's resource level</label>
            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
              {[[5,"No IT staff"],[6,"IG1 · default"],[10,"IG2"],[15,"IG3"]].map(([b,lbl])=>(
                <button key={b} onClick={()=>saveCfg({budget:b})}
                  style={{...btn(budget===b?"primary":"ghost"),fontSize:11}}>{b} · {lbl}</button>
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
          <div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${C.edge}`}}>
            <label style={{fontFamily:MONO,fontSize:10,color:C.muted}}>Campaign — same client, later in the term</label>
            <button style={{...btn("primary"),marginTop:6,width:"100%"}} disabled={busy}
              onClick={()=>{ if(window.confirm(
                "Advance to the next engagement?\n\nThreats and matrix positions carry forward. "+
                "Teams that played Deferred Investment drift one cell toward Very Likely, or realize "+
                "if they were already there, and receive 10 points.\n\nHands, purchases and modifiers "+
                "are cleared. Export the CSV first.")) nextEngagement(); }}>
              Next engagement — carry the board forward
            </button>
            <p style={{fontFamily:MONO,fontSize:10,color:C.muted,lineHeight:1.6,marginTop:6}}>
              Use this instead of New round when the same organization returns. Severity never
              drifts; only likelihood does.
            </p>
          </div>

          <div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${C.edge}`}}>
            <label style={{fontFamily:MONO,fontSize:10,color:C.muted}}>Another scenario, same room</label>
            <button style={{...btn(),marginTop:6,width:"100%"}} disabled={busy}
              onClick={()=>{ if(window.confirm(
                "Clear the board for another scenario?\n\nTeams keep their names and seats. "+
                "Threat cards, matrix placements, hands, purchases and modifiers are cleared, "+
                "and play returns to Phase 1.\n\nExport the CSV first if you want to keep this round.")) newRound(); }}>
              New round — keep teams, clear the board
            </button>
          </div>

          <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.edge}`}}>
            <label style={{fontFamily:MONO,fontSize:10,color:C.muted}}>When the class is over</label>
            <button style={{...btn("danger"),marginTop:6,width:"100%"}} disabled={busy}
              onClick={()=>{ if(window.confirm(
                "Clear the board for the next class?\n\nA timestamped copy is kept first, so nothing is lost. "+
                "Export the CSV before doing this if you have not already.\n\nIn campaign play, do NOT clear — "+
                "the same organization returns with drift applied.")) endSession(); }}>
              End session and clear board
            </button>
          </div>

          <div style={{marginTop:12}}>
            <label style={{fontFamily:MONO,fontSize:10,color:C.muted}}>Timer on the projector</label>
            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
              {[5,8,10,15].map(m=>(
                <button key={m} style={{...btn(),fontSize:11}}
                  onClick={()=>saveCfg({timerEnd:Date.now()+m*60000})}>{m} min</button>
              ))}
              <button style={{...btn(),fontSize:11}} onClick={()=>saveCfg({timerEnd:null})}>Clear</button>
            </div>
          </div>
          <p style={{fontFamily:MONO,fontSize:10,color:C.muted,lineHeight:1.6,marginTop:8}}>
            Dealing replaces any hand a team already has. Deal once, at the start of Phase 2.
          </p>
        </Section>

        {loaded && (cfg?.phase==="debrief"||cfg?.phase==="p3") && (
          <Section title="Debrief questions for this scenario">
            <ol style={{margin:0,paddingLeft:18,fontSize:12.5,lineHeight:1.6}}>
              {loaded.debrief.map((q,i)=><li key={i} style={{marginBottom:5}}>{q}</li>)}
            </ol>
          </Section>
        )}

        <Section title="Facilitator role">
          <p style={{fontFamily:MONO,fontSize:10.5,color:C.muted,lineHeight:1.6,margin:"0 0 9px"}}>
            You hold this role. Only someone with the code can take it, and only you can
            release it from here.
          </p>
          {roleMsg && <div style={{fontFamily:MONO,fontSize:10.5,color:C.brass,marginBottom:8}}>{roleMsg}</div>}
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

        <Section title="Adjudication" right={<span style={{fontFamily:MONO,fontSize:11,color:pending.length?C.brass:C.muted}}>{pending.length} waiting</span>}>
          {pending.length===0
            ? <p style={{color:C.muted,fontSize:12,margin:0,lineHeight:1.6}}>
                Nothing to judge yet. When a team plays a modifier, its justification arrives here.</p>
            : pending.map((p,k)=>(
              <div key={k} style={{border:`1px solid ${C.edge}`,borderRadius:4,padding:11,marginBottom:8,background:C.panel}}>
                <div style={{fontFamily:MONO,fontSize:10,color:C.muted}}>{teams[p.n]?.name} · card {p.id}</div>
                <div style={{fontSize:13,fontWeight:500,margin:"3px 0 5px"}}>{card(p.id)?.name}</div>
                <div style={{fontSize:12.5,color:C.paper,lineHeight:1.55,fontStyle:"italic"}}>“{p.justification}”</div>
                <div style={{fontFamily:MONO,fontSize:10,color:C.muted,margin:"7px 0"}}>Needs: {card(p.id)?.demand}</div>
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
                  fontFamily:MONO,fontSize:11,color:C.muted}}>Team {n} — no one here yet</div>
              );
              const spent=(t.purchases||[]).reduce((s,id)=>s+(card(id)?.cost||0),0);
              return (
                <div key={n} style={{border:`1px solid ${C.edge}`,borderRadius:4,padding:12,background:C.panel,
                  display:"grid",gridTemplateColumns:"1fr auto",gap:12,alignItems:"start"}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:14}}>{t.name}</div>
                    <div style={{fontFamily:MONO,fontSize:10,color:C.muted,marginTop:2}}>
                      {t.members||"—"}
                      {(t.engagement||1)>1 && ` · engagement ${t.engagement}`}
                      {(t.drift||0)>0 && ` · drifted ${t.drift}`}
                      {t.realized && <span style={{color:C.warn}}> · realized</span>}
                      {!t.realized && t.lastVerdict && t.lastVerdict!=="unscored" &&
                        <span style={{color:t.lastVerdict==="held"?C.ok:t.lastVerdict==="partial"?C.brass:C.warn}}>
                          {" "}· {t.lastVerdict}</span>}
                      {t.budgetOverride && <span style={{color:C.brass}}> · {t.budgetOverride} pts</span>}
                      {(t.standingIgnored||0)>0 &&
                        <span style={{color:C.warn}}> · {t.standingIgnored} standing ignored</span>}
                    </div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap",margin:"7px 0"}}>
                      {Object.entries(DIM_META).map(([k,m])=> t.threat[k] ? (
                        <span key={k} style={{fontFamily:MONO,fontSize:9.5,padding:"2px 6px",borderRadius:2,
                          border:`1px solid ${m.color}`,color:m.color}}>{t.threat[k]}</span>
                      ):null)}
                    </div>
                    <Tokens total={budget} spent={spent}/>
                    <div style={{fontFamily:MONO,fontSize:10,color:C.muted,marginTop:6,lineHeight:1.5}}>
                      {(t.purchases||[]).length
                        ? (t.purchases||[]).map(id=>card(id)?.name).join(" · ")
                        : "nothing bought yet"}
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    <Matrix pre={t.pre} post={t.post} compact/>
                    {t.ownerUid && (
                      <button style={{...btn(),fontSize:10,padding:"4px 8px"}} disabled={busy}
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
        <div key={s} style={{fontFamily:MONO,fontSize:13,color:C.muted,textAlign:"center",paddingBottom:5}}>{s}</div>
      ))}
      {LIKELIHOOD.map((l,li)=>(
        <React.Fragment key={l}>
          <div style={{fontFamily:MONO,fontSize:13,color:C.muted,alignSelf:"center",
            paddingRight:10,textAlign:"right"}}>{l}</div>
          {SEVERITY.map((sv,si)=>{
            const heat=(li+si)/4;
            const pre=at(li,si,"pre"), post=at(li,si,"post");
            return (
              <div key={sv} style={{width:size,height:size,borderRadius:5,
                border:`1px solid ${C.edge}`,background:`rgba(192,69,59,${0.06+heat*0.22})`,
                padding:7,display:"flex",flexWrap:"wrap",gap:5,alignContent:"flex-start"}}>
                {pre.map(n=>(
                  <span key={`b${n}`} title={`${teams[n]?.name} before`} style={{width:26,height:26,borderRadius:"50%",
                    border:`2px solid ${C.muted}`,color:C.muted,fontFamily:MONO,fontSize:12,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>{n}</span>
                ))}
                {post.map(n=>(
                  <span key={`a${n}`} title={`${teams[n]?.name} after`} style={{width:26,height:26,borderRadius:"50%",
                    background:C.brass,color:"#2A1F05",fontFamily:MONO,fontSize:12,fontWeight:700,
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
    <div style={{fontFamily:MONO,fontSize:52,fontWeight:600,lineHeight:1,
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
          <div style={{fontFamily:MONO,fontSize:13,letterSpacing:".18em",textTransform:"uppercase",color:C.solution}}>
            {phase?.label}
          </div>
          <h1 style={{fontSize:40,margin:"6px 0 0",fontWeight:600,letterSpacing:"-.025em"}}>
            {cfg?.org || "Solutions Table"}
          </h1>
          {cfg?.scenario && (
            <p style={{fontSize:19,lineHeight:1.5,color:"#D6D2C8",maxWidth:820,margin:"10px 0 0"}}>
              {cfg.scenario}
            </p>
          )}
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <Countdown end={cfg?.timerEnd}/>
          <div style={{fontFamily:MONO,fontSize:14,color:C.muted,marginTop:8}}>
            budget {budget} · {active.length} team{active.length===1?"":"s"}
          </div>
          {pending>0 && (
            <div style={{fontFamily:MONO,fontSize:14,color:C.brass,marginTop:4}}>
              {pending} justification{pending===1?"":"s"} waiting
            </div>
          )}
          <button onClick={onExit} style={{...btn(),marginTop:12,fontSize:11,opacity:.5}}>Exit</button>
        </div>
      </header>

      <div style={{display:"grid",gridTemplateColumns:"minmax(400px,auto) 1fr",gap:36,alignItems:"start"}}>
        <div>
          <div style={{fontFamily:MONO,fontSize:12,letterSpacing:".1em",textTransform:"uppercase",
            color:C.muted,marginBottom:12}}>The room, on one grid</div>
          <OverlayMatrix teams={teams} ids={ids}/>
          <div style={{display:"flex",gap:22,marginTop:14,fontFamily:MONO,fontSize:13,color:C.muted}}>
            <span><span style={{display:"inline-block",width:14,height:14,borderRadius:"50%",
              border:`2px solid ${C.muted}`,marginRight:7,verticalAlign:"-2px"}}/>before controls</span>
            <span><span style={{display:"inline-block",width:15,height:15,borderRadius:"50%",
              background:C.brass,marginRight:7,verticalAlign:"-2px"}}/>after controls</span>
          </div>
        </div>

        <div>
          <div style={{fontFamily:MONO,fontSize:12,letterSpacing:".1em",textTransform:"uppercase",
            color:C.muted,marginBottom:12}}>What each team bought</div>
          {active.length===0 ? (
            <p style={{color:C.muted,fontSize:18}}>No teams have joined yet.</p>
          ) : (
            <div style={{display:"grid",gap:10}}>
              {active.map(n=>{
                const t=teams[n];
                const spent=(t.purchases||[]).reduce((a,id)=>a+(card(id)?.cost||0),0);
                return (
                  <div key={n} style={{border:`1px solid ${C.edge}`,borderRadius:5,padding:"13px 16px",
                    background:C.panel,display:"grid",gridTemplateColumns:"34px 1fr auto",gap:14,alignItems:"start"}}>
                    <div style={{width:30,height:30,borderRadius:"50%",background:C.edge,color:C.paper,
                      fontFamily:MONO,fontSize:15,fontWeight:700,display:"flex",
                      alignItems:"center",justifyContent:"center"}}>{n}</div>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:19,fontWeight:600}}>{t.name}</div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",margin:"7px 0 8px"}}>
                        {Object.entries(DIM_META).map(([k,m])=> t.threat[k] ? (
                          <span key={k} style={{fontFamily:MONO,fontSize:12,padding:"2px 8px",borderRadius:3,
                            border:`1px solid ${m.color}`,color:m.color}}>{t.threat[k]}</span>
                        ):null)}
                      </div>
                      <div style={{fontSize:15,color:"#D6D2C8",lineHeight:1.5}}>
                        {(t.purchases||[]).length
                          ? (t.purchases||[]).map(id=>card(id)?.name).join(" · ")
                          : <span style={{color:C.muted}}>nothing bought yet</span>}
                      </div>
                      {(t.modifiers||[]).filter(m=>m.status==="accepted").length>0 && (
                        <div style={{fontFamily:MONO,fontSize:12,color:C.solution,marginTop:6}}>
                          + {(t.modifiers||[]).filter(m=>m.status==="accepted")
                              .map(m=>card(m.id)?.name).join(" · ")}
                        </div>
                      )}
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:MONO,fontSize:26,fontWeight:600,
                        color: spent>=budget ? C.brass : C.paper, fontVariantNumeric:"tabular-nums"}}>
                        {budget-spent}
                      </div>
                      <div style={{fontFamily:MONO,fontSize:11,color:C.muted}}>left</div>
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
  /* The database refuses writes from anyone but the seat holder, so the
     interface disables them rather than letting a click fail. */
  const isOwner = !t?.ownerUid || t.ownerUid===clientId;
  const scen = scenarioById(cfg?.scenarioId);
  const useStanding = cfg?.standingOn && scen?.standing?.length;
  // Positions carry forward once play has started, otherwise use the scenario's
  const standing = useStanding
    ? scen.standing.map(r=>({...r, at:(t?.standingPos||{})[r.id] || r.pos}))
    : [];
  const addressedIds = standing
    .filter(r=>r.cards.some(c=>(t?.purchases||[]).includes(c) || (t?.everBought||[]).includes(c)))
    .map(r=>r.id);
  // Banking last engagement buys a bigger budget this one
  const budget = t?.budgetOverride ?? (cfg?.budget??6);

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
                <div style={{fontSize:14,color:C.paper,fontWeight:600}}>{teams[n]?.name||`Team ${n}`}</div>
                <div style={{fontFamily:MONO,fontSize:10,color:C.muted,marginTop:3}}>
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

  const playModifier = (id)=>{
    const text = (just[id]||"").trim();
    if(text.length<12) return;
    if(id===24 && !(t.purchases||[]).some(p=>p===4||p===7)) return;
    if(modsPlayed>=2) return;
    saveTeam(teamN,{modifiers:[...(t.modifiers||[]),{id,justification:text,status:"pending"}]});
    setJust(j=>({...j,[id]:""}));
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
            <label style={{fontFamily:MONO,fontSize:10,color:C.muted}}>Team name</label>
            <input value={t.name} disabled={!isOwner}
              onChange={e=>saveTeam(teamN,{name:e.target.value})}/>
          </div>
          <div>
            <label style={{fontFamily:MONO,fontSize:10,color:C.muted}}>Who is playing</label>
            <input value={t.members} placeholder="first names" disabled={!isOwner}
              onChange={e=>saveTeam(teamN,{members:e.target.value})}/>
          </div>
        </div>
        {t.realized && (
          <div style={{marginTop:12,padding:"12px 14px",borderRadius:4,
            border:`1px solid ${C.warn}`,background:"rgba(192,69,59,.10)"}}>
            <div style={{fontFamily:MONO,fontSize:10,letterSpacing:".08em",
              textTransform:"uppercase",color:C.warn}}>It happened</div>
            <p style={{fontSize:13,lineHeight:1.6,margin:"6px 0 9px"}}>
              You left this at <b>Very Likely</b> and deferred again. The attack succeeded.
              What follows is decided by what you have bought across every engagement, not by chance.
            </p>
            <div style={{display:"grid",gap:4}}>
              {t.realized.outcome.map((o,i)=>(
                <div key={i} style={{display:"flex",gap:9,fontSize:12.5,lineHeight:1.5}}>
                  <span style={{fontFamily:MONO,fontSize:10.5,minWidth:76,
                    color:o.had?C.ok:C.warn}}>{o.q}</span>
                  <span style={{color:o.had?C.paper:"#E8A9A3"}}>{o.text}</span>
                </div>
              ))}
            </div>
            <p style={{fontFamily:MONO,fontSize:10.5,color:C.muted,lineHeight:1.6,marginBottom:0,marginTop:9}}>
              Tell the room what happened in the client's words, using your Human Impact card.
            </p>
          </div>
        )}
        {!t.realized && t.lastVerdict && t.lastVerdict!=="unscored" && (
          <div style={{marginTop:12,padding:"10px 13px",borderRadius:4,
            border:`1px solid ${t.lastVerdict==="held"?C.ok:t.lastVerdict==="partial"?C.brass:C.warn}`,
            background: t.lastVerdict==="held" ? "rgba(78,140,90,.12)"
                      : t.lastVerdict==="partial" ? "rgba(217,180,91,.10)" : "rgba(192,69,59,.10)"}}>
            <div style={{fontFamily:MONO,fontSize:10,letterSpacing:".08em",textTransform:"uppercase",
              color: t.lastVerdict==="held"?C.ok:t.lastVerdict==="partial"?C.brass:C.warn}}>
              Engagement {t.engagement} · last year's portfolio {t.lastVerdict==="held"?"held"
                : t.lastVerdict==="partial"?"helped a little":"did not address this"}
            </div>
            <p style={{fontSize:12.5,lineHeight:1.6,margin:"5px 0 0",color:"#D6D2C8"}}>
              {t.lastVerdict==="held"
                ? "What you bought addressed this threat directly, so it is less likely than it was. Severity is unchanged — it always is."
                : t.lastVerdict==="partial"
                ? "Some of what you bought touches this threat, but not squarely. Likelihood has not moved."
                : "Nothing you bought addressed this threat, so it is more likely than it was."}
            </p>
          </div>
        )}
        {!t.realized && (t.drift||0)>0 && (
          <div style={{marginTop:12,padding:"9px 12px",borderRadius:4,
            border:`1px solid ${C.brass}`,background:"rgba(217,180,91,.10)",
            fontFamily:MONO,fontSize:11,color:C.brass,lineHeight:1.6}}>
            Engagement {t.engagement}. This threat has drifted {t.drift} cell{(t.drift||0)===1?"":"s"} toward
            Very Likely while you waited. Severity has not moved — it never does.
          </div>
        )}
        {!isOwner && (
          <div style={{marginTop:12,padding:"9px 12px",borderRadius:4,
            border:`1px solid ${C.brass}`,background:"rgba(217,180,91,.10)",
            fontFamily:MONO,fontSize:11,color:C.brass,lineHeight:1.6}}>
            Another device holds this team. You can follow along, but changes are made
            there. If that device is gone, ask the facilitator to release the seat.
          </div>
        )}
        {useStanding && (
          <div style={{marginTop:12,border:`1px solid ${C.edge}`,borderRadius:4,
            background:C.panel,padding:"11px 13px"}}>
            <div style={{fontFamily:MONO,fontSize:10,letterSpacing:".08em",
              textTransform:"uppercase",color:C.muted}}>
              Already true of this organization
            </div>
            <div style={{display:"grid",gap:7,marginTop:8}}>
              {standing.map(r=>{
                const done = addressedIds.includes(r.id);
                return (
                  <div key={r.id} style={{display:"flex",gap:9,alignItems:"flex-start"}}>
                    <span style={{width:17,height:17,borderRadius:2,flexShrink:0,marginTop:1,
                      fontFamily:MONO,fontSize:9.5,display:"flex",alignItems:"center",
                      justifyContent:"center",
                      background:done?C.ok:"transparent",
                      border:`1.5px solid ${done?C.ok:C.muted}`,
                      color:done?"#0E1A12":C.muted}}>
                      {String.fromCharCode(64+r.id)}
                    </span>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:12.5,lineHeight:1.5,
                        color:done?"#D6D2C8":C.paper}}>{r.text}</div>
                      <div style={{fontFamily:MONO,fontSize:9.5,color:done?C.ok:C.muted,marginTop:2}}>
                        {LIKELIHOOD[r.at.l]} · {SEVERITY[r.at.s]}
                        {done && " · addressed by what you have bought"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p style={{fontFamily:MONO,fontSize:10,color:C.muted,lineHeight:1.6,margin:"9px 0 0"}}>
              These were here before today's incident. Your budget covers all of it or none of it.
            </p>
          </div>
        )}
        {cfg?.scenario && (
          <div style={{marginTop:12,padding:12,borderLeft:`3px solid ${C.brass}`,background:C.panel,
            borderRadius:"0 4px 4px 0",fontSize:13.5,lineHeight:1.6}}>{cfg.scenario}</div>
        )}
      </Section>

      {(phase==="p1"||phase==="setup") && (
        <Section title="Phase 1 — build the threat" right={
          <button style={btn("primary")} disabled={!isOwner} onClick={()=>saveTeam(teamN,{threat:{
            method:sample(dims.method,1)[0], impact:sample(dims.impact,1)[0],
            resource:sample(dims.resource,1)[0], motive:sample(dims.motive,1)[0]}})}>
            Roll for cards
          </button>}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:9,marginBottom:16}}>
            {Object.entries(DIM_META).map(([k,m])=>(
              <div key={k} style={{border:`1px solid ${C.edge}`,borderLeft:`3px solid ${m.color}`,
                borderRadius:4,padding:"10px 12px",background:C.panel,minHeight:62}}>
                <div style={{fontFamily:MONO,fontSize:9.5,letterSpacing:".08em",textTransform:"uppercase",color:m.color}}>{m.label}</div>
                <select value={t.threat[k]||""} disabled={!isOwner}
                  onChange={e=>saveTeam(teamN,{threat:{...t.threat,[k]:e.target.value}})}
                  style={{marginTop:6,border:"none",background:"transparent",padding:"2px 0",
                    fontFamily:SANS,fontSize:13.5,color:C.paper}}>
                  <option value="">choose…</option>
                  {(dims[k]||[]).map(v=><option key={v} value={v} style={{background:C.panel}}>{v}</option>)}
                </select>
              </div>
            ))}
          </div>
          <p style={{fontFamily:MONO,fontSize:10.5,color:C.muted,lineHeight:1.6,margin:"0 0 14px"}}>
            The roll randomizes which cards you draw. It never decides how an attack turns out —
            that follows from what you buy.
          </p>
          <div style={{display:"flex",gap:26,flexWrap:"wrap",alignItems:"flex-start"}}>
            <div>
              <div style={{fontFamily:MONO,fontSize:10,color:C.muted,marginBottom:7}}>
                Place the threat. Justify severity by naming who the Human Impact card harms.
              </div>
              <Matrix pre={t.pre} post={t.post} standing={standing} addressed={addressedIds}
                interactive={isOwner} onPick={(l,s)=>saveTeam(teamN,{pre:{l,s}})}/>
            </div>
          </div>
        </Section>
      )}

      {phase==="p2" && (
        <Section title="Phase 2 — buy your defense"
          right={<Tokens total={budget} spent={spent}/>}>
          {deferred && (
            <div style={{fontFamily:MONO,fontSize:11,color:C.brass,marginBottom:10}}>
              Deferred Investment accepted — your spend is capped at 4 this round.
            </div>
          )}
          {(t.everBought||[]).length>0 && (
            <div style={{marginBottom:14,padding:"9px 12px",borderRadius:4,
              border:`1px solid ${C.edge}`,background:C.panel}}>
              <div style={{fontFamily:MONO,fontSize:10,color:C.ok,textTransform:"uppercase",
                letterSpacing:".08em"}}>Already in place — no need to buy again</div>
              <div style={{fontSize:12.5,lineHeight:1.6,marginTop:4,color:"#D6D2C8"}}>
                {(t.everBought||[]).map(id=>card(id)?.name).join(" · ")}
              </div>
            </div>
          )}
          {!(t.hand||[]).length ? (
            <p style={{color:C.muted,fontSize:13,margin:0}}>Waiting for the facilitator to deal.</p>
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

              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",
                gap:10,marginBottom:8,flexWrap:"wrap"}}>
                <span style={{fontFamily:MONO,fontSize:10,color:C.muted}}>
                  Modifiers — free, {2-modsPlayed} left to play. Each needs a specific justification.
                </span>
                {((t.purchases||[]).length>0 || modsPlayed>0) && (
                  <button style={{...btn(),fontSize:11}} disabled={busy||!isOwner}
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
                  const blocked = id===24 && !(t.purchases||[]).some(p=>p===4||p===7);
                  return (
                    <div key={id} style={{border:`1px solid ${played?C.solution:C.edge}`,borderRadius:4,
                      padding:11,background:C.panel}}>
                      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"baseline"}}>
                        <span style={{fontSize:13.5,fontWeight:500}}>{m.name}</span>
                        <span style={{fontFamily:MONO,fontSize:10,color:played
                          ? (played.status==="accepted"?C.ok:C.brass) : C.muted}}>
                          {played? (played.status==="accepted"?"accepted":"waiting on facilitator") : "free"}
                        </span>
                      </div>
                      <div style={{fontFamily:MONO,fontSize:10,color:C.muted,margin:"4px 0 7px"}}>{m.demand}</div>
                      {!played && (
                        <>
                          <textarea value={just[id]||""} onChange={e=>setJust(j=>({...j,[id]:e.target.value}))}
                            placeholder={blocked?"Buy card 4 or 7 first.":"Name a specific person, system, or failure."}
                            disabled={blocked||modsPlayed>=2||!isOwner}/>
                          <button style={{...btn("primary"),marginTop:7}}
                            disabled={blocked||modsPlayed>=2||!isOwner||(just[id]||"").trim().length<12}
                            onClick={()=>playModifier(id)}>Send to facilitator</button>
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

      {(phase==="p3"||phase==="debrief") && (
        <Section title="Phase 3 — what still gets through">
          <div style={{display:"flex",gap:28,flexWrap:"wrap",alignItems:"flex-start"}}>
            <div>
              <div style={{fontFamily:MONO,fontSize:10,color:C.muted,marginBottom:7}}>
                Same threat, re-placed with your controls in place.
              </div>
              <Matrix pre={t.pre} post={t.post} standing={standing} addressed={addressedIds}
                interactive={isOwner} onPick={(l,s)=>saveTeam(teamN,{post:{l,s}})}/>
            </div>
            <div style={{flex:"1 1 260px",minWidth:240}}>
              <label style={{fontFamily:MONO,fontSize:10,color:C.muted}}>
                Something still gets through. What is it?
              </label>
              <textarea value={t.residual} disabled={!isOwner}
                onChange={e=>saveTeam(teamN,{residual:e.target.value})}
                placeholder="What an attacker could still do, given what you bought."/>
              <div style={{fontFamily:MONO,fontSize:10,color:C.muted,marginTop:10,lineHeight:1.6}}>
                Bought: {(t.purchases||[]).map(id=>card(id)?.name).join(" · ")||"nothing"}
              </div>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
