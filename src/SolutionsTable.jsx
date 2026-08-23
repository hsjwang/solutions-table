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
const TEAM_IDS = [1,2,3,4,5,6];
const CFG_KEY = "game:config";
const teamKey = (n) => `game:team:${n}`;
const card = (id) => SOLUTIONS.find(c=>c.id===id) || MODIFIERS.find(c=>c.id===id);

const blankTeam = (n) => ({
  n, name:`Team ${n}`, members:"", joined:false,
  threat:{method:"",impact:"",resource:"",motive:""},
  pre:null, post:null, hand:[], modHand:[], purchases:[],
  modifiers:[], residual:"", updatedAt:0,
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

function Matrix({pre,post,onPick,interactive,compact}){
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
  const [clientId] = useState(()=>Math.random().toString(36).slice(2,10));
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
  const roleRef = useRef({role:null,teamN:null});
  roleRef.current = {role,teamN};

  const refresh = useCallback(async ()=>{
    const c = await sGet(CFG_KEY);
    if (c) setCfg(c);
    const {role:r, teamN:tn} = roleRef.current;
    if (r === "fac" || r === "projector") {
      const entries = await Promise.all(TEAM_IDS.map(async n=>[n, await sGet(teamKey(n))]));
      const next = {};
      entries.forEach(([n,t])=>{ if(t) next[n]=t; });
      setTeams(next);
    } else if (tn) {
      const t = await sGet(teamKey(tn));
      if (t) setTeams(prev=>({...prev,[tn]:t}));
    } else if (r === "player") {
      // team picker needs to know which seats are taken; read once, not on a loop
      const entries = await Promise.all(TEAM_IDS.map(async n=>[n, await sGet(teamKey(n))]));
      const next = {};
      entries.forEach(([n,t])=>{ if(t) next[n]=t; });
      setTeams(next);
    }
  },[]);

  useEffect(()=>{
    refresh();
    poll.current = setInterval(refresh, 4000);
    return ()=>clearInterval(poll.current);
  },[refresh]);

  // Fetch immediately when the role or team changes rather than waiting a tick.
  useEffect(()=>{ refresh(); },[role,teamN,refresh]);

  useEffect(()=>{
    if (typeof window==="undefined") return;
    const h = window.location.hash.toLowerCase();
    if (h.includes("projector")) setRole("projector");
    else if (h.includes("facilitator")) setRole("fac-gate");
  },[]);

  const saveCfg = async (patch)=>{
    setBusy(true);
    const next = {...(cfg||{}), ...patch, updatedAt:Date.now()};
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

  if (role==="projector") return <Projector cfg={cfg} teams={teams} onExit={()=>setRole(null)}/>;
  if (role===null) return shell(<Gate onPlayer={()=>setRole("player")} onFac={()=>setRole("fac-gate")}
    onProjector={()=>setRole("projector")} cfg={cfg}/>);
  if (role==="fac-gate") return shell(
    <FacGate cfg={cfg} clientId={clientId} onClaim={async(code)=>{
      const c = await sGet(CFG_KEY);
      if (c?.facilitatorId && c.facilitatorId!==clientId && c.claimCode!==code) return "That code does not match the facilitator for this session.";
      await saveCfg({...(c||{}), facilitatorId:clientId, claimCode:code,
        phase:c?.phase||"setup", budget:c?.budget??6, dims:c?.dims||DEFAULT_DIMS,
        org:c?.org||"", scenario:c?.scenario||""});
      setRole("fac"); return null;
    }} onBack={()=>setRole(null)}/>
  );
  if (role==="fac") return shell(
    <Facilitator cfg={cfg} teams={teams} saveCfg={saveCfg} saveTeam={saveTeam} busy={busy}
      onExit={()=>setRole(null)}/>
  );
  return shell(
    <Player cfg={cfg} teams={teams} teamN={teamN} setTeamN={setTeamN}
      saveTeam={saveTeam} busy={busy} onExit={()=>{setRole(null);setTeamN(null);}}/>
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

function FacGate({onClaim,onBack,cfg,clientId}){
  const [code,setCode] = useState("");
  const [err,setErr] = useState(null);
  const claimed = cfg?.facilitatorId && cfg.facilitatorId!==clientId;
  return (
    <div style={{maxWidth:420}}>
      <Section title="Facilitator">
        <p style={{color:C.muted,fontSize:13,lineHeight:1.6,marginTop:0}}>
          {claimed
            ? "Someone already holds this role. Enter the same code they used to take it over — useful if a browser was closed mid-session."
            : "Pick a code and share it only with co-facilitators. It is what lets you reclaim the role if your browser closes."}
        </p>
        <input value={code} onChange={e=>setCode(e.target.value)} placeholder="Facilitator code"
          onKeyDown={e=>{ if(e.key==="Enter"&&code.trim()) onClaim(code.trim()).then(setErr); }}/>
        {err && <div style={{color:"#E88C84",fontFamily:MONO,fontSize:11,marginTop:8}}>{err}</div>}
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button style={btn("primary")} disabled={!code.trim()}
            onClick={()=>onClaim(code.trim()).then(setErr)}>Claim the role</button>
          <button style={btn()} onClick={onBack}>Back</button>
        </div>
      </Section>
    </div>
  );
}

/* ---------------- facilitator ---------------- */

function Facilitator({cfg,teams,saveCfg,saveTeam,busy,onExit}){
  const [org,setOrg] = useState(cfg?.org||"");
  const [scenario,setScenario] = useState(cfg?.scenario||"");
  const phase = cfg?.phase||"setup";
  const budget = cfg?.budget??6;

  const dealAll = async ()=>{
    for (const n of TEAM_IDS){
      const t = teams[n]; if(!t?.joined) continue;
      const found = SOLUTIONS.filter(c=>c.tier==="F").map(c=>c.id);
      const ext = SOLUTIONS.filter(c=>c.tier==="E").map(c=>c.id);
      const adv = SOLUTIONS.filter(c=>c.tier==="A").map(c=>c.id);
      const hand = [...sample(found,6),...sample(ext,1),...sample(adv,1)];
      await saveTeam(n,{hand, modHand:sample(MODIFIERS.map(m=>m.id),3), purchases:[], modifiers:[]});
    }
  };
  const pending = [];
  TEAM_IDS.forEach(n=>{ (teams[n]?.modifiers||[]).forEach((m,i)=>{ if(m.status==="pending") pending.push({n,i,...m}); }); });

  const newRound = async ()=>{
    for (const n of TEAM_IDS){
      const t = teams[n];
      if(!t?.joined) continue;
      await saveTeam(n,{...blankTeam(n), name:t.name, members:t.members, joined:true});
    }
    await saveCfg({phase:"p1", timerEnd:null});
    setStatus("Board cleared. Teams are still seated — set the new scenario above.");
  };

  const endSession = async ()=>{
    const label = new Date().toISOString().slice(0,16).replace(/[:T]/g,"-");
    const snapshot = {cfg, teams, archivedAt:Date.now()};
    await sSet(`archive:${label}`, snapshot);          // keep a copy first
    for (const n of TEAM_IDS) await sSet(teamKey(n), blankTeam(n));
    await saveCfg({phase:"setup", org:"", scenario:"", timerEnd:null});
    setTeams({});
    setStatus(`Board cleared. A copy was kept as archive:${label}.`);
  };

  const exportData = ()=>{
    const rows = [["team","org","threat_method","threat_impact","threat_resource","threat_motive",
      "pre_likelihood","pre_severity","post_likelihood","post_severity","spent","purchases",
      "modifiers_accepted","residual"]];
    TEAM_IDS.forEach(n=>{
      const t=teams[n]; if(!t?.joined) return;
      const spent=(t.purchases||[]).reduce((s,id)=>s+(card(id)?.cost||0),0);
      rows.push([t.name,cfg?.org||"",t.threat.method,t.threat.impact,t.threat.resource,t.threat.motive,
        t.pre?LIKELIHOOD[t.pre.l]:"",t.pre?SEVERITY[t.pre.s]:"",
        t.post?LIKELIHOOD[t.post.l]:"",t.post?SEVERITY[t.post.s]:"",spent,
        (t.purchases||[]).map(id=>card(id)?.name).join("; "),
        (t.modifiers||[]).filter(m=>m.status==="accepted").map(m=>card(m.id)?.name).join("; "),
        (t.residual||"").replace(/\n/g," ")]);
    });
    const csv = rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    const a=document.createElement("a"); a.href=url; a.download="solutions-session.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{display:"grid",gridTemplateColumns:"minmax(280px,1fr) minmax(300px,1.3fr)",gap:26,alignItems:"start"}}>
      <div>
        <Section title="Session" right={<button style={btn()} onClick={onExit}>Leave</button>}>
          <label style={{fontFamily:MONO,fontSize:10,color:C.muted}}>Client organization</label>
          <input value={org} onChange={e=>setOrg(e.target.value)} placeholder="e.g. a volunteer-run food bank"
            onBlur={()=>saveCfg({org})} style={{marginBottom:10}}/>
          <label style={{fontFamily:MONO,fontSize:10,color:C.muted}}>Scenario read aloud</label>
          <textarea value={scenario} onChange={e=>setScenario(e.target.value)} onBlur={()=>saveCfg({scenario})}
            placeholder="One or two sentences the teams all start from."/>
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
            {TEAM_IDS.map(n=>{
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
                    <div style={{fontFamily:MONO,fontSize:10,color:C.muted,marginTop:2}}>{t.members||"—"}</div>
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
                  <Matrix pre={t.pre} post={t.post} compact/>
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

function OverlayMatrix({teams,size=118}){
  const at = (l,s,which)=> TEAM_IDS.filter(n=>{
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

function Projector({cfg,teams,onExit}){
  const budget = cfg?.budget??6;
  const phase = PHASES.find(p=>p.id===(cfg?.phase||"setup"));
  const active = TEAM_IDS.filter(n=>teams[n]?.joined);
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
          <OverlayMatrix teams={teams}/>
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

function Player({cfg,teams,teamN,setTeamN,saveTeam,busy,onExit}){
  const phase = cfg?.phase||"setup";
  const budget = cfg?.budget??6;
  const dims = cfg?.dims||DEFAULT_DIMS;
  const t = teamN ? (teams[teamN]||blankTeam(teamN)) : null;
  const [just,setJust] = useState({});

  if(!teamN){
    return (
      <Section title="Pick your team" right={<button style={btn()} onClick={onExit}>Back</button>}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:9}}>
          {TEAM_IDS.map(n=>{
            const taken = teams[n]?.joined;
            return (
              <button key={n} onClick={async()=>{ setTeamN(n); if(!taken) await saveTeam(n,{...blankTeam(n),joined:true}); }}
                style={{...btn(taken?"ghost":"primary"),padding:"14px 10px",textAlign:"left"}}>
                <div style={{fontSize:14,color:C.paper,fontWeight:600}}>{teams[n]?.name||`Team ${n}`}</div>
                <div style={{fontFamily:MONO,fontSize:10,color:C.muted,marginTop:3}}>
                  {taken? (teams[n]?.members||"joined") : "open"}
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
            <input value={t.name} onChange={e=>saveTeam(teamN,{name:e.target.value})}/>
          </div>
          <div>
            <label style={{fontFamily:MONO,fontSize:10,color:C.muted}}>Who is playing</label>
            <input value={t.members} placeholder="first names" onChange={e=>saveTeam(teamN,{members:e.target.value})}/>
          </div>
        </div>
        {cfg?.scenario && (
          <div style={{marginTop:12,padding:12,borderLeft:`3px solid ${C.brass}`,background:C.panel,
            borderRadius:"0 4px 4px 0",fontSize:13.5,lineHeight:1.6}}>{cfg.scenario}</div>
        )}
      </Section>

      {(phase==="p1"||phase==="setup") && (
        <Section title="Phase 1 — build the threat" right={
          <button style={btn("primary")} onClick={()=>saveTeam(teamN,{threat:{
            method:sample(dims.method,1)[0], impact:sample(dims.impact,1)[0],
            resource:sample(dims.resource,1)[0], motive:sample(dims.motive,1)[0]}})}>
            Roll for cards
          </button>}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:9,marginBottom:16}}>
            {Object.entries(DIM_META).map(([k,m])=>(
              <div key={k} style={{border:`1px solid ${C.edge}`,borderLeft:`3px solid ${m.color}`,
                borderRadius:4,padding:"10px 12px",background:C.panel,minHeight:62}}>
                <div style={{fontFamily:MONO,fontSize:9.5,letterSpacing:".08em",textTransform:"uppercase",color:m.color}}>{m.label}</div>
                <select value={t.threat[k]||""} onChange={e=>saveTeam(teamN,{threat:{...t.threat,[k]:e.target.value}})}
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
              <Matrix pre={t.pre} post={t.post} interactive onPick={(l,s)=>saveTeam(teamN,{pre:{l,s}})}/>
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
          {!(t.hand||[]).length ? (
            <p style={{color:C.muted,fontSize:13,margin:0}}>Waiting for the facilitator to deal.</p>
          ) : (
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(215px,1fr))",gap:8,marginBottom:20}}>
                {(t.hand||[]).map(id=>{
                  const c=card(id); const bought=(t.purchases||[]).includes(id);
                  const unaffordable = !bought && spent + c.cost > cap;
                  return <CardTile key={id} c={c} state={bought?"bought":""} disabled={unaffordable}
                    onClick={()=>toggleBuy(id)} note={bought?"bought":unaffordable?"not enough left":null}/>;
                })}
              </div>

              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",
                gap:10,marginBottom:8,flexWrap:"wrap"}}>
                <span style={{fontFamily:MONO,fontSize:10,color:C.muted}}>
                  Modifiers — free, {2-modsPlayed} left to play. Each needs a specific justification.
                </span>
                {((t.purchases||[]).length>0 || modsPlayed>0) && (
                  <button style={{...btn(),fontSize:11}} disabled={busy}
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
                            disabled={blocked||modsPlayed>=2}/>
                          <button style={{...btn("primary"),marginTop:7}}
                            disabled={blocked||modsPlayed>=2||(just[id]||"").trim().length<12}
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
              <Matrix pre={t.pre} post={t.post} interactive onPick={(l,s)=>saveTeam(teamN,{post:{l,s}})}/>
            </div>
            <div style={{flex:"1 1 260px",minWidth:240}}>
              <label style={{fontFamily:MONO,fontSize:10,color:C.muted}}>
                Something still gets through. What is it?
              </label>
              <textarea value={t.residual} onChange={e=>saveTeam(teamN,{residual:e.target.value})}
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
