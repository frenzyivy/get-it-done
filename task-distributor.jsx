import { useState, useEffect, useRef } from "react";

/* ─── UTILITIES ──────────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 10);

const fmt = (secs) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const fmtShort = (secs) => {
  if (!secs || secs <= 0) return "0s";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${secs}s`;
};

/* ─── CONSTANTS ──────────────────────────── */
const PRIORITIES = [
  { value: "low", label: "Low", color: "#6b7280", bg: "#f3f4f6" },
  { value: "medium", label: "Med", color: "#d97706", bg: "#fef3c7" },
  { value: "high", label: "High", color: "#dc2626", bg: "#fee2e2" },
  { value: "urgent", label: "Urgent", color: "#fff", bg: "#dc2626" },
];

const TAG_COLORS = [
  "#8b5cf6","#06b6d4","#f59e0b","#ec4899","#10b981",
  "#ef4444","#3b82f6","#a855f7","#14b8a6","#f97316","#6366f1","#84cc16",
];

const DEFAULT_TAGS = [
  { id: uid(), name: "AI Agency", color: "#8b5cf6" },
  { id: uid(), name: "Content", color: "#f59e0b" },
  { id: uid(), name: "GRE", color: "#10b981" },
  { id: uid(), name: "KomalFi", color: "#3b82f6" },
  { id: uid(), name: "YouTube", color: "#ef4444" },
  { id: uid(), name: "Outreach", color: "#06b6d4" },
];

const KANBAN_COLS = [
  { id: "todo", label: "To Do", icon: "○", accent: "#8b5cf6" },
  { id: "in_progress", label: "In Progress", icon: "◐", accent: "#f59e0b" },
  { id: "done", label: "Done", icon: "●", accent: "#10b981" },
];

const initTasks = [
  {
    id: uid(), title: "Create YouTube Launch Content", status: "in_progress",
    priority: "high", tagIds: [DEFAULT_TAGS[1].id, DEFAULT_TAGS[4].id],
    dueDate: "2026-04-25", timeSpent: 2700,
    sessions: [
      { start: "2026-04-16T10:00", duration: 1500, subtaskId: null, subtaskTitle: "Write script for Episode 1" },
      { start: "2026-04-16T14:30", duration: 1200, subtaskId: null, subtaskTitle: "Record screen capture demo" },
    ],
    subtasks: [
      { id: "yt1", title: "Write script for Episode 1", done: true, timeSpent: 1500 },
      { id: "yt2", title: "Record screen capture demo", done: false, timeSpent: 1200 },
      { id: "yt3", title: "Edit in DaVinci Resolve", done: false, timeSpent: 0 },
      { id: "yt4", title: "Create thumbnail", done: false, timeSpent: 0 },
    ],
  },
  {
    id: uid(), title: "Alainza Bizz CRM - Email Module", status: "todo",
    priority: "medium", tagIds: [DEFAULT_TAGS[0].id, DEFAULT_TAGS[3].id],
    dueDate: "2026-05-01", timeSpent: 0, sessions: [],
    subtasks: [
      { id: "crm1", title: "Design unified inbox view", done: false, timeSpent: 0 },
      { id: "crm2", title: "Integrate Instantly.ai API", done: false, timeSpent: 0 },
    ],
  },
  {
    id: uid(), title: "Poland Dental Outreach Campaign", status: "done",
    priority: "low", tagIds: [DEFAULT_TAGS[0].id, DEFAULT_TAGS[5].id],
    dueDate: "2026-04-15", timeSpent: 5400,
    sessions: [
      { start: "2026-04-12T09:00", duration: 3600, subtaskId: null, subtaskTitle: "Source 200 leads via Vibe Prospecting" },
      { start: "2026-04-13T11:00", duration: 1800, subtaskId: null, subtaskTitle: "Write cold email sequence" },
    ],
    subtasks: [
      { id: "pl1", title: "Source 200 leads via Vibe Prospecting", done: true, timeSpent: 3600 },
      { id: "pl2", title: "Write cold email sequence", done: true, timeSpent: 1800 },
    ],
  },
  {
    id: uid(), title: "GRE Verbal - Reading Comp Practice", status: "in_progress",
    priority: "medium", tagIds: [DEFAULT_TAGS[2].id],
    dueDate: "2026-05-10", timeSpent: 900,
    sessions: [
      { start: "2026-04-17T08:00", duration: 900, subtaskId: null, subtaskTitle: "Complete 20 RC passages" },
    ],
    subtasks: [
      { id: "gre1", title: "Complete 20 RC passages", done: true, timeSpent: 900 },
      { id: "gre2", title: "Review wrong answers & patterns", done: false, timeSpent: 0 },
      { id: "gre3", title: "Timed practice set #3", done: false, timeSpent: 0 },
    ],
  },
];

function getProgress(subtasks) {
  if (!subtasks || !subtasks.length) return 0;
  return Math.round((subtasks.filter((s) => s.done).length / subtasks.length) * 100);
}

/* ─── TINY COMPONENTS ────────────────────── */
function PriorityBadge({ priority }) {
  const p = PRIORITIES.find((x) => x.value === priority) || PRIORITIES[0];
  return <span style={{ fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:6,background:p.bg,color:p.color,letterSpacing:.5,textTransform:"uppercase" }}>{p.label}</span>;
}

function TagBadge({ tag }) {
  if (!tag) return null;
  return <span style={{ fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:6,background:tag.color+"18",color:tag.color,letterSpacing:.3,whiteSpace:"nowrap" }}>{tag.name}</span>;
}

function ProgressBar({ value, height = 6, accent }) {
  return (
    <div style={{ width:"100%",height,borderRadius:height,background:"rgba(0,0,0,0.06)",overflow:"hidden" }}>
      <div style={{ width:`${value}%`,height:"100%",borderRadius:height,background:accent||(value===100?"#10b981":value>50?"#f59e0b":"#8b5cf6"),transition:"width 0.4s cubic-bezier(.4,0,.2,1)" }} />
    </div>
  );
}

/* ─── POMODORO TIMER (with subtask selector) */
function PomodoroTimer({ task, onUpdate }) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [activeSubtaskId, setActiveSubtaskId] = useState("__general__");
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);

  useEffect(() => {
    if (running) {
      startTimeRef.current = new Date().toISOString();
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const activeSub = task.subtasks.find((s) => s.id === activeSubtaskId);
  const activeLabel = activeSub ? activeSub.title : "General (whole task)";

  const handleStart = () => { setElapsed(0); setRunning(true); };
  const handlePause = () => setRunning(false);
  const handleResume = () => setRunning(true);

  const handleStop = () => {
    setRunning(false);
    if (elapsed > 0) {
      const newSession = {
        start: startTimeRef.current || new Date().toISOString(),
        duration: elapsed,
        subtaskId: activeSubtaskId === "__general__" ? null : activeSubtaskId,
        subtaskTitle: activeLabel,
      };
      const updatedSubtasks = activeSubtaskId !== "__general__"
        ? task.subtasks.map((s) => s.id === activeSubtaskId ? { ...s, timeSpent: (s.timeSpent || 0) + elapsed } : s)
        : task.subtasks;
      onUpdate({
        ...task,
        timeSpent: (task.timeSpent || 0) + elapsed,
        sessions: [...(task.sessions || []), newSession],
        subtasks: updatedSubtasks,
      });
    }
    setElapsed(0);
  };

  const handleDiscard = () => { setRunning(false); setElapsed(0); };

  const totalTime = (task.timeSpent || 0) + (running ? elapsed : 0);
  const sessionCount = (task.sessions || []).length + (running ? 1 : 0);

  const timerIcon = (
    <button onClick={(e) => { e.stopPropagation(); setShowPanel(!showPanel); }}
      title={totalTime > 0 ? `${fmtShort(totalTime)} tracked` : "Start timer"}
      style={{
        background: running ? "#8b5cf6" : totalTime > 0 ? "rgba(139,92,246,0.1)" : "rgba(0,0,0,0.04)",
        border:"none",borderRadius:8,cursor:"pointer",
        width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",
        position:"relative",flexShrink:0,transition:"all 0.2s",
      }}>
      {running
        ? <span style={{ fontSize:13,lineHeight:1 }}>⏸</span>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={totalTime>0?"#8b5cf6":"#999"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      }
      {running && <span style={{ position:"absolute",top:-3,right:-3,width:8,height:8,borderRadius:"50%",background:"#ef4444",animation:"pomoPulse 1s ease-in-out infinite" }} />}
    </button>
  );

  const btnStyle = (bg) => ({
    background:bg,color:"#fff",border:"none",borderRadius:10,
    padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
  });

  const panel = showPanel ? (
    <div style={{
      background:"linear-gradient(135deg, #f8f7ff, #f0f0ff)",borderRadius:12,padding:14,
      marginTop:8,border:"1.5px solid rgba(139,92,246,0.15)",
    }} onClick={(e) => e.stopPropagation()}>

      {/* Subtask selector */}
      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:11,fontWeight:700,color:"#888",textTransform:"uppercase",letterSpacing:.5,marginBottom:4 }}>Working on</div>
        <select
          value={activeSubtaskId}
          onChange={(e) => setActiveSubtaskId(e.target.value)}
          disabled={running}
          style={{
            width:"100%",padding:"8px 10px",borderRadius:10,fontSize:13,fontFamily:"inherit",
            border: running ? "1.5px solid rgba(139,92,246,0.3)" : "1.5px solid #e5e7eb",
            background: running ? "rgba(139,92,246,0.05)" : "#fff",
            color: running ? "#8b5cf6" : "#1a1a2e",
            fontWeight:600,cursor: running ? "not-allowed" : "pointer",
            outline:"none",
          }}>
          <option value="__general__">🎯 General (whole task)</option>
          {task.subtasks.map((s) => (
            <option key={s.id} value={s.id}>
              {s.done ? "✅" : "○"} {s.title}{s.timeSpent > 0 ? ` (${fmtShort(s.timeSpent)})` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Timer display */}
      <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:4 }}>
        <div style={{
          fontFamily:"'DM Sans', monospace",fontSize:36,fontWeight:800,
          color: running ? "#8b5cf6" : "#1a1a2e",letterSpacing:1,
          textShadow: running ? "0 0 20px rgba(139,92,246,0.3)" : "none",
          transition:"all 0.3s",
        }}>
          {fmt(elapsed)}
        </div>
      </div>
      {running && (
        <div style={{ textAlign:"center",fontSize:12,color:"#8b5cf6",fontWeight:600,marginBottom:8 }}>
          ▸ {activeLabel}
        </div>
      )}

      {/* Controls */}
      <div style={{ display:"flex",gap:8,justifyContent:"center",marginBottom:12 }}>
        {!running && elapsed === 0 && (
          <button onClick={handleStart} style={{ ...btnStyle("#8b5cf6"),padding:"8px 24px",display:"flex",alignItems:"center",gap:6 }}>▶ Start</button>
        )}
        {running && (
          <>
            <button onClick={handlePause} style={btnStyle("#f59e0b")}>⏸ Pause</button>
            <button onClick={handleStop} style={btnStyle("#10b981")}>⏹ Save</button>
          </>
        )}
        {!running && elapsed > 0 && (
          <>
            <button onClick={handleResume} style={btnStyle("#8b5cf6")}>▶ Resume</button>
            <button onClick={handleStop} style={btnStyle("#10b981")}>⏹ Save</button>
            <button onClick={handleDiscard} style={{ ...btnStyle("rgba(0,0,0,0.06)"),color:"#888" }}>✕ Discard</button>
          </>
        )}
      </div>

      {/* Stats */}
      <div style={{ display:"flex",gap:16,justifyContent:"center",padding:"8px 0",borderTop:"1px solid rgba(139,92,246,0.1)" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:18,fontWeight:800,color:"#8b5cf6" }}>{fmtShort(totalTime)}</div>
          <div style={{ fontSize:10,color:"#888",fontWeight:600,textTransform:"uppercase",letterSpacing:.5 }}>Total</div>
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:18,fontWeight:800,color:"#1a1a2e" }}>{sessionCount}</div>
          <div style={{ fontSize:10,color:"#888",fontWeight:600,textTransform:"uppercase",letterSpacing:.5 }}>Sessions</div>
        </div>
      </div>

      {/* Session log with subtask labels */}
      {(task.sessions || []).length > 0 && (
        <div style={{ marginTop:8 }}>
          <div style={{ fontSize:11,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:.5,marginBottom:4 }}>Session Log</div>
          <div style={{ maxHeight:150,overflowY:"auto" }}>
            {[...(task.sessions || [])].reverse().map((s, i) => {
              const d = new Date(s.start);
              return (
                <div key={i} style={{ display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid rgba(0,0,0,0.04)",fontSize:12 }}>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontWeight:600,color:"#1a1a2e",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>
                      {s.subtaskTitle || "General"}
                    </div>
                    <div style={{ color:"#aaa",fontSize:11 }}>
                      {d.toLocaleDateString("en-IN",{day:"numeric",month:"short"})} · {d.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}
                    </div>
                  </div>
                  <span style={{ fontWeight:700,color:"#8b5cf6",whiteSpace:"nowrap" }}>{fmtShort(s.duration)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  ) : null;

  return { timerIcon, panel, running, totalTime };
}

/* ─── TAG PICKER ─────────────────────────── */
function TagPicker({ tags, selectedIds, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position:"relative" }}>
      <button onClick={() => setShow(!show)} style={{ fontSize:12,padding:"4px 10px",borderRadius:8,border:"1.5px solid #e5e7eb",fontFamily:"inherit",cursor:"pointer",background:"#fff",color:"#666" }}>
        {selectedIds.length ? `${selectedIds.length} tag${selectedIds.length>1?"s":""}` : "Tags"} ▾
      </button>
      {show && (
        <div style={{ position:"absolute",top:"110%",left:0,zIndex:50,background:"#fff",borderRadius:12,padding:8,minWidth:180,boxShadow:"0 8px 30px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)" }}>
          {tags.map((t) => (
            <div key={t.id} onClick={() => onChange(selectedIds.includes(t.id)?selectedIds.filter(x=>x!==t.id):[...selectedIds,t.id])}
              style={{ display:"flex",alignItems:"center",gap:8,padding:"5px 6px",borderRadius:6,cursor:"pointer",fontSize:13 }}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(0,0,0,0.03)"}} onMouseLeave={e=>{e.currentTarget.style.background="transparent"}}>
              <span style={{ width:16,height:16,borderRadius:4,flexShrink:0,border:selectedIds.includes(t.id)?"none":"2px solid #ddd",background:selectedIds.includes(t.id)?t.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:10 }}>{selectedIds.includes(t.id)?"✓":""}</span>
              <span style={{ width:8,height:8,borderRadius:"50%",background:t.color,flexShrink:0 }} />
              <span>{t.name}</span>
            </div>
          ))}
          <div style={{ borderTop:"1px solid #eee",marginTop:4,paddingTop:4 }}>
            <button onClick={()=>setShow(false)} style={{ width:"100%",padding:"4px 0",border:"none",background:"none",fontSize:12,color:"#8b5cf6",fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── SUBTASK ITEM (with time badge) ─────── */
function SubtaskItem({ subtask, onToggle, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(subtask.title);
  return (
    <div style={{ display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid rgba(0,0,0,0.04)" }}>
      <button onClick={onToggle} style={{
        width:18,height:18,borderRadius:5,border:subtask.done?"none":"2px solid #ccc",
        background:subtask.done?"#10b981":"transparent",cursor:"pointer",
        display:"flex",alignItems:"center",justifyContent:"center",
        color:"#fff",fontSize:12,flexShrink:0,transition:"all 0.2s",
      }}>{subtask.done?"✓":""}</button>
      {editing ? (
        <input value={val} autoFocus onChange={e=>setVal(e.target.value)}
          onBlur={()=>{onRename(val);setEditing(false)}}
          onKeyDown={e=>{if(e.key==="Enter"){onRename(val);setEditing(false)}}}
          style={{ flex:1,border:"none",borderBottom:"1.5px solid #8b5cf6",outline:"none",fontSize:13,fontFamily:"inherit",padding:"2px 0",background:"transparent" }} />
      ) : (
        <span onDoubleClick={()=>setEditing(true)} style={{
          flex:1,fontSize:13,color:subtask.done?"#aaa":"#333",
          textDecoration:subtask.done?"line-through":"none",cursor:"pointer",transition:"color 0.2s",
        }}>{subtask.title}</span>
      )}
      {(subtask.timeSpent || 0) > 0 && (
        <span style={{
          fontSize:10,fontWeight:700,color:"#8b5cf6",background:"rgba(139,92,246,0.08)",
          padding:"1px 6px",borderRadius:5,whiteSpace:"nowrap",flexShrink:0,
        }}>🕐 {fmtShort(subtask.timeSpent)}</span>
      )}
      <button onClick={onDelete} style={{ background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:14,padding:0,lineHeight:1 }} title="Remove">×</button>
    </div>
  );
}

function AddSubtask({ onAdd }) {
  const [val, setVal] = useState("");
  const submit = () => { if (val.trim()) { onAdd(val.trim()); setVal(""); } };
  return (
    <div style={{ display:"flex",gap:6,marginTop:6 }}>
      <input value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}
        placeholder="+ Add subtask…" style={{ flex:1,border:"1.5px solid #e5e7eb",borderRadius:8,padding:"6px 10px",fontSize:13,fontFamily:"inherit",outline:"none",background:"#fafafa" }} />
      {val.trim() && <button onClick={submit} style={{ background:"#8b5cf6",color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer" }}>Add</button>}
    </div>
  );
}

/* ─── TASK CARD ──────────────────────────── */
function TaskCard({ task, onUpdate, onDelete, expanded, onToggleExpand, compact, tags }) {
  const progress = getProgress(task.subtasks);
  const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";
  const taskTags = (task.tagIds||[]).map(id=>tags.find(t=>t.id===id)).filter(Boolean);
  const { timerIcon, panel, running, totalTime } = PomodoroTimer({ task, onUpdate });

  const toggleSubtask = (sid) => {
    const subs = task.subtasks.map(s=>s.id===sid?{...s,done:!s.done}:s);
    const allDone = subs.length>0 && subs.every(s=>s.done);
    onUpdate({...task,subtasks:subs,status:allDone?"done":task.status==="done"?"in_progress":task.status});
  };
  const addSubtask = (title) => onUpdate({...task,subtasks:[...task.subtasks,{id:uid(),title,done:false,timeSpent:0}]});
  const deleteSubtask = (sid) => onUpdate({...task,subtasks:task.subtasks.filter(s=>s.id!==sid)});
  const renameSubtask = (sid,title) => onUpdate({...task,subtasks:task.subtasks.map(s=>s.id===sid?{...s,title}:s)});

  return (
    <div style={{
      background:"#fff",borderRadius:14,padding:compact?14:18,
      boxShadow: running ? "0 4px 20px rgba(139,92,246,0.2), 0 0 0 2px rgba(139,92,246,0.25)" : "0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)",
      transition:"box-shadow 0.3s",cursor:"default",
    }}
      onMouseEnter={e=>{if(!running)e.currentTarget.style.boxShadow="0 4px 16px rgba(139,92,246,0.13), 0 0 0 1px rgba(139,92,246,0.18)"}}
      onMouseLeave={e=>{if(!running)e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)"}}
    >
      <div style={{ display:"flex",alignItems:"flex-start",gap:10,marginBottom:8 }}>
        {timerIcon}
        <button onClick={onToggleExpand} style={{
          background:"none",border:"none",cursor:"pointer",fontSize:14,
          color:"#aaa",padding:0,marginTop:2,transition:"transform 0.2s",
          transform:expanded?"rotate(90deg)":"rotate(0deg)",
        }}>▶</button>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
            <span style={{ fontWeight:700,fontSize:compact?14:15,color:"#1a1a2e",lineHeight:1.3 }}>{task.title}</span>
            {totalTime > 0 && (
              <span style={{ fontSize:11,fontWeight:700,color:"#8b5cf6",background:"rgba(139,92,246,0.08)",padding:"1px 7px",borderRadius:6,whiteSpace:"nowrap" }}>
                🕐 {fmtShort(totalTime)}
              </span>
            )}
          </div>
          <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginTop:6,alignItems:"center" }}>
            <PriorityBadge priority={task.priority} />
            {taskTags.map(t=><TagBadge key={t.id} tag={t} />)}
            {task.dueDate && (
              <span style={{ fontSize:11,color:overdue?"#dc2626":"#888",fontWeight:overdue?700:500 }}>
                {overdue?"⚠ ":""}Due {new Date(task.dueDate).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}
              </span>
            )}
          </div>
        </div>
        <button onClick={onDelete} style={{ background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:18,padding:0,lineHeight:1 }} title="Delete task">×</button>
      </div>

      {panel}

      <div style={{ marginTop:8,marginBottom:expanded?8:0 }}>
        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4 }}>
          <ProgressBar value={progress} />
          <span style={{ fontSize:12,fontWeight:700,color:progress===100?"#10b981":"#8b5cf6",minWidth:36,textAlign:"right" }}>{progress}%</span>
        </div>
        <span style={{ fontSize:11,color:"#aaa" }}>{task.subtasks.filter(s=>s.done).length}/{task.subtasks.length} subtasks</span>
      </div>

      {expanded && (
        <div style={{ marginTop:6 }}>
          {task.subtasks.map(s=>(
            <SubtaskItem key={s.id} subtask={s}
              onToggle={()=>toggleSubtask(s.id)}
              onDelete={()=>deleteSubtask(s.id)}
              onRename={t=>renameSubtask(s.id,t)} />
          ))}
          <AddSubtask onAdd={addSubtask} />
        </div>
      )}
    </div>
  );
}

/* ─── ADD TASK FORM ──────────────────────── */
function AddTaskForm({ onAdd, defaultStatus, tags }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [tagIds, setTagIds] = useState([]);
  const [dueDate, setDueDate] = useState("");

  const submit = () => {
    if (!title.trim()) return;
    onAdd({ id:uid(),title:title.trim(),status:defaultStatus||"todo",priority,tagIds,dueDate,subtasks:[],timeSpent:0,sessions:[] });
    setTitle(""); setPriority("medium"); setTagIds([]); setDueDate(""); setOpen(false);
  };

  if (!open) return (
    <button onClick={()=>setOpen(true)} style={{
      width:"100%",padding:"10px 14px",background:"rgba(139,92,246,0.06)",
      border:"2px dashed rgba(139,92,246,0.25)",borderRadius:12,cursor:"pointer",
      color:"#8b5cf6",fontWeight:700,fontSize:13,fontFamily:"inherit",transition:"all 0.2s",
    }}
      onMouseEnter={e=>{e.currentTarget.style.background="rgba(139,92,246,0.12)"}}
      onMouseLeave={e=>{e.currentTarget.style.background="rgba(139,92,246,0.06)"}}
    >+ New Task</button>
  );

  return (
    <div style={{ background:"#fff",borderRadius:14,padding:16,boxShadow:"0 1px 4px rgba(0,0,0,0.06), 0 0 0 2px rgba(139,92,246,0.2)" }}>
      <input value={title} onChange={e=>setTitle(e.target.value)} autoFocus onKeyDown={e=>e.key==="Enter"&&submit()}
        placeholder="Task title…" style={{ width:"100%",border:"none",borderBottom:"2px solid #e5e7eb",fontSize:15,fontWeight:600,padding:"6px 0",outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:"transparent" }} />
      <div style={{ display:"flex",gap:8,marginTop:10,flexWrap:"wrap",alignItems:"center" }}>
        <select value={priority} onChange={e=>setPriority(e.target.value)} style={{ fontSize:12,padding:"4px 8px",borderRadius:8,border:"1.5px solid #e5e7eb",fontFamily:"inherit" }}>
          {PRIORITIES.map(p=><option key={p.value} value={p.value}>{p.label} Priority</option>)}
        </select>
        <TagPicker tags={tags} selectedIds={tagIds} onChange={setTagIds} />
        <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} style={{ fontSize:12,padding:"4px 8px",borderRadius:8,border:"1.5px solid #e5e7eb",fontFamily:"inherit" }} />
        <div style={{ flex:1 }} />
        <button onClick={()=>setOpen(false)} style={{ background:"none",border:"none",color:"#aaa",cursor:"pointer",fontSize:13,fontFamily:"inherit" }}>Cancel</button>
        <button onClick={submit} style={{ background:"#8b5cf6",color:"#fff",border:"none",borderRadius:8,padding:"6px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>Create</button>
      </div>
    </div>
  );
}

/* ─── KANBAN VIEW ──────────────────────────── */
function KanbanView({ tasks, setTasks, tags }) {
  const [expanded, setExpanded] = useState({});
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const updateTask = (t) => setTasks(prev=>prev.map(x=>x.id===t.id?t:x));
  const deleteTask = (id) => setTasks(prev=>prev.filter(x=>x.id!==id));
  const addTask = (t) => setTasks(prev=>[...prev,t]);

  const handleDrop = (colId) => {
    if (dragId) setTasks(prev=>prev.map(t=>t.id===dragId?{...t,status:colId}:t));
    setDragId(null); setDragOver(null);
  };

  return (
    <div style={{ display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:16,minHeight:400 }}>
      {KANBAN_COLS.map(col=>{
        const colTasks = tasks.filter(t=>t.status===col.id);
        return (
          <div key={col.id}
            onDragOver={e=>{e.preventDefault();setDragOver(col.id)}}
            onDragLeave={()=>setDragOver(null)}
            onDrop={()=>handleDrop(col.id)}
            style={{
              background:dragOver===col.id?"rgba(139,92,246,0.06)":"rgba(0,0,0,0.02)",
              borderRadius:16,padding:14,transition:"background 0.2s",
              border:dragOver===col.id?"2px dashed rgba(139,92,246,0.3)":"2px dashed transparent",
            }}>
            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:14,padding:"0 4px" }}>
              <span style={{ fontSize:16 }}>{col.icon}</span>
              <span style={{ fontWeight:800,fontSize:13,color:col.accent,letterSpacing:.5,textTransform:"uppercase" }}>{col.label}</span>
              <span style={{ marginLeft:"auto",fontSize:12,fontWeight:700,background:col.accent+"18",color:col.accent,width:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center" }}>{colTasks.length}</span>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              {colTasks.map(task=>(
                <div key={task.id} draggable onDragStart={()=>setDragId(task.id)} onDragEnd={()=>{setDragId(null);setDragOver(null)}}
                  style={{ opacity:dragId===task.id?0.5:1,cursor:"grab" }}>
                  <TaskCard task={task} onUpdate={updateTask} onDelete={()=>deleteTask(task.id)}
                    expanded={!!expanded[task.id]} onToggleExpand={()=>setExpanded(p=>({...p,[task.id]:!p[task.id]}))}
                    compact={true} tags={tags} />
                </div>
              ))}
              <AddTaskForm onAdd={addTask} defaultStatus={col.id} tags={tags} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── LIST VIEW ──────────────────────────── */
function ListView({ tasks, setTasks, tags }) {
  const [expanded, setExpanded] = useState({});
  const updateTask = (t) => setTasks(prev=>prev.map(x=>x.id===t.id?t:x));
  const deleteTask = (id) => setTasks(prev=>prev.filter(x=>x.id!==id));
  const addTask = (t) => setTasks(prev=>[...prev,t]);
  const sorted = [...tasks].sort((a,b)=>{const o={urgent:0,high:1,medium:2,low:3};return(o[a.priority]||3)-(o[b.priority]||3)});

  return (
    <div>
      <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
        {sorted.map(task=>(
          <TaskCard key={task.id} task={task} onUpdate={updateTask} onDelete={()=>deleteTask(task.id)}
            expanded={!!expanded[task.id]} onToggleExpand={()=>setExpanded(p=>({...p,[task.id]:!p[task.id]}))} tags={tags} />
        ))}
        <AddTaskForm onAdd={addTask} tags={tags} />
      </div>
      {sorted.length===0 && <div style={{ textAlign:"center",padding:40,color:"#aaa",fontSize:14 }}>No tasks yet. Create one above!</div>}
    </div>
  );
}

/* ─── TAG MANAGER ──────────────────────────── */
function TagManager({ tags, setTags }) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const addTag = () => { if(!newName.trim())return; setTags(prev=>[...prev,{id:uid(),name:newName.trim(),color:TAG_COLORS[tags.length%TAG_COLORS.length]}]); setNewName(""); };
  const removeTag = (id) => setTags(prev=>prev.filter(t=>t.id!==id));

  return (
    <div style={{ position:"relative",display:"inline-block" }}>
      <button onClick={()=>setOpen(!open)} style={{
        padding:"5px 12px",borderRadius:8,border:"1.5px solid #e5e7eb",
        background:open?"#8b5cf6":"#fff",color:open?"#fff":"#666",
        fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s",
      }}>⚙ Tags ({tags.length})</button>
      {open && (
        <div style={{ position:"absolute",top:"110%",right:0,zIndex:50,background:"#fff",borderRadius:14,padding:14,minWidth:230,boxShadow:"0 8px 30px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize:12,fontWeight:800,color:"#1a1a2e",marginBottom:8,textTransform:"uppercase",letterSpacing:.5 }}>Manage Tags</div>
          {tags.map(t=>(
            <div key={t.id} style={{ display:"flex",alignItems:"center",gap:8,padding:"5px 4px",borderRadius:6 }}>
              <span style={{ width:10,height:10,borderRadius:"50%",background:t.color,flexShrink:0 }} />
              <span style={{ flex:1,fontSize:13 }}>{t.name}</span>
              <button onClick={()=>removeTag(t.id)} style={{ background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:14,padding:0 }}>×</button>
            </div>
          ))}
          <div style={{ display:"flex",gap:6,marginTop:8,borderTop:"1px solid #eee",paddingTop:8 }}>
            <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTag()}
              placeholder="New tag name…" style={{ flex:1,border:"1.5px solid #e5e7eb",borderRadius:8,padding:"5px 8px",fontSize:12,fontFamily:"inherit",outline:"none" }} />
            {newName.trim() && <button onClick={addTag} style={{ background:"#8b5cf6",color:"#fff",border:"none",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer" }}>+</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── MAIN APP ──────────────────────────── */
export default function TaskDistributor() {
  const [view, setView] = useState("kanban");
  const [tasks, setTasks] = useState(initTasks);
  const [tags, setTags] = useState(DEFAULT_TAGS);

  const totalProgress = tasks.length > 0 ? Math.round(tasks.reduce((sum,t) => sum + getProgress(t.subtasks), 0) / tasks.length) : 0;
  const totalTimeAll = tasks.reduce((sum,t) => sum + (t.timeSpent||0), 0);

  return (
    <div style={{ fontFamily:"'DM Sans', 'Segoe UI', system-ui, sans-serif",minHeight:"100vh",background:"linear-gradient(145deg, #f8f7ff 0%, #f0f4ff 50%, #faf5ff 100%)",padding:"24px 16px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,700;0,9..40,800;1,9..40,400&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.2); border-radius: 3px; }
        select { background: #fff; }
        @keyframes pomoPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.3)} }
      `}</style>

      <div style={{ maxWidth:960,margin:"0 auto" }}>
        <div style={{ marginBottom:24 }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12 }}>
            <div>
              <h1 style={{ fontSize:26,fontWeight:800,color:"#1a1a2e",margin:0,letterSpacing:-.5 }}>
                <span style={{ color:"#8b5cf6" }}>⚡</span> Task Distributor
              </h1>
              <p style={{ fontSize:13,color:"#888",margin:"4px 0 0" }}>
                {tasks.length} tasks · {totalProgress}% progress · 🕐 {fmtShort(totalTimeAll)} tracked
              </p>
            </div>
            <div style={{ display:"flex",gap:8,alignItems:"center" }}>
              <TagManager tags={tags} setTags={setTags} />
              <div style={{ display:"flex",background:"#fff",borderRadius:12,padding:3,boxShadow:"0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)" }}>
                {[{id:"list",icon:"☰",label:"List"},{id:"kanban",icon:"▤",label:"Board"}].map(v=>(
                  <button key={v.id} onClick={()=>setView(v.id)} style={{
                    padding:"7px 16px",borderRadius:10,border:"none",cursor:"pointer",
                    fontSize:13,fontWeight:700,fontFamily:"inherit",
                    background:view===v.id?"#8b5cf6":"transparent",color:view===v.id?"#fff":"#888",transition:"all 0.2s",
                  }}>{v.icon} {v.label}</button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ marginTop:14 }}><ProgressBar value={totalProgress} height={8} accent="#8b5cf6" /></div>
        </div>

        {view === "kanban"
          ? <KanbanView tasks={tasks} setTasks={setTasks} tags={tags} />
          : <ListView tasks={tasks} setTasks={setTasks} tags={tags} />
        }
      </div>
    </div>
  );
}
