import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Box, Braces, Check, CheckCircle2,
  ChevronDown, ChevronRight, Circle, CircleHelp, Clock3, Copy, Database, Download,
  Fingerprint, FlaskConical, GitBranch, History, Layers3, LoaderCircle,
  MessageSquare, Play, Plus, Radio, RotateCcw, Settings2, ShieldCheck, Sparkles,
  Terminal, Upload, Workflow, X, XCircle,
} from 'lucide-react';
import type { Action, Change, Checkpoint, Comparison, Health, Outcome, Proposal, Run, RunEvent, RunSummary, Scenario } from './types';

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch('/api' + path, body === undefined ? undefined :
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) {
    const detail = data.detail;
    throw new Error(typeof detail === 'string' ? detail :
      Array.isArray(detail) ? detail.map((d: { msg: string }) => d.msg).join('; ') : 'The request could not be completed.');
  }
  return data as T;
}

const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const stable = (value: unknown) => JSON.stringify(value, (_key, item: unknown) =>
  item && typeof item === 'object' && !Array.isArray(item) ?
    Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const shortId = (id: string) => id.slice(4, 12);
const duration = (ms: number) => ms < 1000 ? ms.toFixed(1) + ' ms' : (ms / 1000).toFixed(2) + ' s';
const modeName = (mode: string) => ({ deterministic_demo: 'Deterministic demo', live_meta: 'Live Meta', unchanged_replay: 'Unchanged tool replay' }[mode] || mode);
const displayValue = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value);
const timeOf = (date: string) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function download(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([pretty(data)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Mark() {
  return <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="m5 16 11-8v16zm11 0 11-8v16z" /></svg></span>;
}

function OutcomeBadge({ run }: { run: Pick<RunSummary, 'outcome' | 'replay' | 'execution'> }) {
  if (run.replay) return <span className={'badge ' + (run.replay.status === 'matched' ? 'blue' : 'red')}>
    <RotateCcw size={12} />{run.replay.status === 'matched' ? (run.replay.tool_errors ? 'Recorded error reproduced' : 'Replay matched') : 'Replay mismatch'}</span>;
  const passed = run.outcome.status === 'passed_checks';
  return <span className={'badge ' + (passed ? 'green' : run.outcome.status === 'failed' ? 'red' : 'neutral')}>
    {passed ? <Check size={12} /> : <X size={12} />}
    {passed ? 'Passed implemented checks' : run.outcome.status === 'failed' ? 'Failed checks' : 'Not evaluated'}</span>;
}

function CheckList({ outcome }: { outcome: Outcome }) {
  return <div className="check-list">{outcome.checks.map(check => <details key={check.id} className="check-row">
    <summary>
      {check.status === 'passed' ? <CheckCircle2 size={15} className="text-green" /> :
        check.status === 'failed' ? <XCircle size={15} className="text-red" /> : <Circle size={14} className="muted" />}
      <span>{check.label}</span>
      <span className={'check-status ' + check.status}>{check.status === 'not_evaluated' ? 'Not evaluated' : check.status}</span>
      <ChevronDown size={12} className="muted" />
    </summary>
    <p>{check.detail}</p>
  </details>)}</div>;
}

function DiffTable({ changes }: { changes: Change[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? changes : changes.slice(0, 8);
  if (!changes.length) return <div className="empty-inline"><CheckCircle2 size={17} /> No database differences.</div>;
  return <><div className="diff-table"><div className="diff-head"><span>State path</span><span>Original</span><span>Branch</span></div>
    {shown.map((change, i) => <div className="diff-row" key={change.path + i}>
      <code title={change.path}>{change.path}</code>
      <code className="removed">{change.before_exists ? displayValue(change.before) : '(absent)'}</code>
      <code className="added">{change.after_exists ? displayValue(change.after) : '(absent)'}</code>
    </div>)}</div>
    {changes.length > 8 && <button className="text-button diff-expand" onClick={() => setExpanded(!expanded)}>
      {expanded ? 'Show fewer changes' : 'Show all ' + changes.length + ' changes'}<ChevronDown size={13} /></button>}</>;
}

function EventCard({ event, selected, onSelect }: { event: RunEvent; selected: boolean; onSelect: () => void }) {
  const tool = event.kind === 'tool';
  const user = event.kind === 'user_message';
  const error = event.kind === 'execution_error';
  const model = event.kind === 'model_call';
  const label = tool ? event.tool : user ? 'Customer request' : error ? 'Execution stopped' : model ? 'Meta model call' : 'Agent response';
  const summary = tool ? Object.entries(event.arguments || {}).map(([key, value]) => key + ': ' + displayValue(value)).join('  ·  ') : event.content;
  const canSelect = tool && !!event.checkpoint_id && !event.inherited;
  const Icon = tool ? Terminal : user ? MessageSquare : error ? XCircle : model ? Sparkles : Workflow;
  return <div className={'timeline-entry ' + (user ? 'customer-entry ' : '') + (selected ? 'selected ' : '') + (event.inherited ? 'inherited ' : '')}>
    <span className={'timeline-node ' + (selected ? 'node-selected' : error || (tool && !event.observation?.ok) ? 'node-error' : '')}>
      <Icon size={14} />
    </span>
    <button type="button" className={'event-card ' + (canSelect ? 'selectable' : 'message-card')} onClick={canSelect ? onSelect : undefined}
      disabled={!canSelect} aria-pressed={canSelect ? selected : undefined}
      aria-label={canSelect ? 'Inspect checkpoint before ' + event.tool : undefined}>
      <span className="event-top"><span className={tool ? 'tool-name' : 'event-name'}>{label}</span>
        <span className="event-step">{String(event.seq + 1).padStart(2, '0')}</span></span>
      {model ? <span className="event-summary">{event.model} · {event.usage ? event.usage.total_tokens + ' tokens' : 'usage unknown'}</span> :
        <span className={'event-summary ' + (tool ? 'mono truncate' : '')}>{summary}</span>}
      <span className="event-bottom">
        {tool ? <><span className={'tiny-dot ' + (event.observation?.ok ? 'green-dot' : 'red-dot')} />
          <span>{event.observation?.ok ? 'Tool succeeded' : 'Tool error'}</span><span className="dot-separator">·</span>
          <span>{duration(event.latency_ms || 0)}</span>
          {selected && <span className="checkpoint-tag"><Fingerprint size={10} /> Selected checkpoint</span>}
          {!selected && canSelect && <ChevronRight size={12} className="event-arrow" />}</> :
          <span>{event.inherited ? 'Inherited context' : event.source === 'recorded_playback' ? 'Recorded message · no fresh generation' : modeName(event.source)}</span>}
        {event.inherited && tool && <span className="inherited-label">Inherited</span>}
      </span>
    </button>
  </div>;
}

export default function App() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [selectedScenario, setSelectedScenario] = useState('cancel-order');
  const [runMode, setRunMode] = useState('deterministic_demo');
  const [checkpointId, setCheckpointId] = useState<string | null>(null);
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [tool, setTool] = useState('');
  const [argumentsText, setArgumentsText] = useState('{}');
  const [continuation, setContinuation] = useState('deterministic_demo');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [inspectorTab, setInspectorTab] = useState('intervene');
  const [view, setView] = useState('workspace');
  const [guide, setGuide] = useState(false);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  async function loadRun(id: string) {
    const next = await api<Run>('/runs/' + id);
    setRun(next);
    setSelectedScenario(next.scenario_id);
    setCheckpointId(next.checkpoints.at(-1)?.id || null);
    setComparison(null);
    setView('workspace');
    localStorage.setItem('atm-active-run', id);
  }

  async function refresh() {
    const [list, status] = await Promise.all([api<RunSummary[]>('/runs'), api<Health>('/health')]);
    setRuns(list); setHealth(status);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([api<Scenario[]>('/scenarios'), api<RunSummary[]>('/runs'), api<Health>('/health')])
      .then(async ([tasks, list, status]) => {
        if (cancelled) return;
        setScenarios(tasks); setRuns(list); setHealth(status);
        const stored = localStorage.getItem('atm-active-run');
        const id = list.find(r => r.id === stored)?.id || list.find(r => !r.parent_id)?.id || list[0]?.id;
        if (id) await loadRun(id);
      }).catch(e => !cancelled && setError(e.message)).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCheckpoint(null); setCheckpointError(null); setProposal(null);
    if (checkpointId) api<Checkpoint>('/checkpoints/' + checkpointId).then(next => {
      if (cancelled) return;
      setCheckpoint(next); setTool(next.payload.pending_action.tool);
      setArgumentsText(pretty(next.payload.pending_action.arguments));
      setContinuation(next.payload.agent_config.kind);
    }).catch(e => !cancelled && setCheckpointError(e.message));
    return () => { cancelled = true; };
  }, [checkpointId]);

  useEffect(() => {
    let cancelled = false;
    if (run?.parent_id && !run.replay) api<Comparison>('/runs/' + run.id + '/compare').then(next => {
      if (!cancelled) setComparison(next);
    }).catch(e => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [run?.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!guide) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setGuide(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [guide]);

  async function perform(label: string, operation: () => Promise<void>) {
    setBusy(label); setError(null);
    try { await operation(); } catch (e) { setError(e instanceof Error ? e.message : 'Operation failed.'); }
    finally { setBusy(''); }
  }

  async function newRun() {
    await perform('Running scenario', async () => {
      const next = await api<Run>('/runs', { scenario_id: selectedScenario, mode: runMode });
      await refresh(); await loadRun(next.id); setToast('Run recorded and saved locally.');
    });
  }

  async function fork() {
    if (!run || !checkpoint) return;
    await perform('Executing branch', async () => {
      const args = JSON.parse(argumentsText);
      const next = await api<Run>('/runs/' + run.id + '/branches', { checkpoint_id: checkpoint.id,
        tool, arguments: args, continuation, proposal_id: proposal?.id || null });
      await refresh(); await loadRun(next.id);
      setToast(next.execution === 'completed' ? 'Branch executed. Compare the outcomes below.' : 'Branch saved with an execution error.');
    });
  }

  async function askMeta() {
    if (!run || !checkpoint) return;
    await perform('Requesting Meta patch', async () => {
      const next = await api<Proposal>('/runs/' + run.id + '/proposals', { checkpoint_id: checkpoint.id });
      await refresh();
      if (next.status !== 'ready' || !next.action) throw new Error(next.error || 'Meta did not return a valid proposal.');
      setProposal(next); setTool(next.action.tool); setArgumentsText(pretty(next.action.arguments));
      setContinuation('live_meta'); setToast('Meta proposed a patch. Review it before executing.');
    });
  }

  async function replay() {
    if (!run) return;
    await perform('Replaying tools', async () => {
      const next = await api<Run>('/runs/' + run.id + '/replay', {});
      await refresh(); await loadRun(next.id); setToast('Tool replay saved. Agent messages are recorded playback.');
    });
  }

  async function importCheckpoint(file: File) {
    await perform('Validating checkpoint', async () => {
      const contents = JSON.parse(await file.text());
      const imported = contents.format === 'agent-time-machine-export-v1' ? contents.checkpoints?.[0] : contents;
      if (!imported) throw new Error('No checkpoint found in this file. Export a checkpoint from the inspector.');
      const result = await api<{ detail: string }>('/checkpoints/validate', { checkpoint: imported });
      setToast(result.detail);
    });
  }

  let parsedAction: Action | null = null;
  let editorError = '';
  try {
    const args = JSON.parse(argumentsText);
    if (!args || typeof args !== 'object' || Array.isArray(args)) editorError = 'Arguments must be a JSON object.';
    else parsedAction = { tool, arguments: args };
  } catch { editorError = 'Enter valid JSON to execute this branch.'; }
  const changed = checkpoint && parsedAction && stable(parsedAction) !== stable(checkpoint.payload.pending_action);
  const task = scenarios.find(s => s.id === (run?.scenario_id || selectedScenario));
  const selectedEvent = run?.events.find(e => e.checkpoint_id === checkpointId);
  const toolEvents = run?.events.filter(e => e.kind === 'tool') || [];
  const ownBoundary = run?.checkpoints.find(c => c.id === checkpointId);

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" aria-label="Agent Time Machine workspace" onClick={e => { e.preventDefault(); setView('workspace'); }}><Mark /><span>time machine<span className="brand-sub">AGENT DEVELOPER TOOLS</span></span></a>
      <div className="project-switch"><span className="project-icon"><Box size={17} /></span><span>Retail sandbox<small>Local workspace</small></span><span className="project-dot" /></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="main-nav" aria-label="Main navigation">
        <button aria-label="Debugger" className={view === 'workspace' ? 'active' : ''} onClick={() => setView('workspace')}><Workflow size={17} /><span>Debugger</span><span className="nav-count">01</span></button>
        <button aria-label="Run history" className={view === 'runs' ? 'active' : ''} onClick={() => setView('runs')}><History size={17} /><span>Run history</span><span className="nav-count">{runs.length}</span></button>
        <button aria-label="How it works" onClick={() => setGuide(true)}><CircleHelp size={17} /><span>How it works</span><ArrowUpRight size={13} className="nav-end" /></button>
      </nav>
      <div className="nav-label recent-label">RECENT RUNS<button className="icon-button" onClick={() => void newRun()} disabled={!!busy} aria-label="Create another scenario run"><Plus size={13} /></button></div>
      <div className="recent-runs">
        {runs.slice(0, 6).map(item => <button key={item.id} className={'recent-run ' + (run?.id === item.id ? 'current' : '')}
          onClick={() => void perform('Opening saved run', () => loadRun(item.id))} disabled={!!busy}>
          {item.parent_id ? <GitBranch size={14} /> : <Circle size={12} />}
          <span>{item.title}<small>{item.replay ? 'Tool replay' : item.parent_id ? 'Intervention branch' : 'Original run'} · {shortId(item.id)}</small></span>
          <span className={'tiny-dot ' + (item.outcome.status === 'passed_checks' ? 'green-dot' : item.replay ? 'blue-dot' : 'red-dot')} />
        </button>)}
        {!runs.length && <span className="sidebar-empty">Your runs will appear here.</span>}
      </div>
      <div className="sidebar-bottom"><div className="sandbox-note"><ShieldCheck size={17} /><span>Room to experiment<small>Isolated state. Every branch.</small></span></div>
        <button className="settings-button" aria-label="Environment and models" onClick={() => setGuide(true)}><Settings2 size={16} /><span>Environment & models</span><span className={'tiny-dot ' + (health?.meta.available ? 'green-dot' : '')} /></button>
        <div className="workspace-owner"><span className="owner-avatar">L</span><span>Local workspace<small>Agent Time Machine · v0.1</small></span><span className="version-dot" /></div>
      </div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={13} /><strong>{view === 'runs' ? 'Run history' : 'Debugger'}</strong></div>
        <div className="topbar-right"><span className="connection"><span className="tiny-dot green-dot" />{health ? 'Local environment connected' : 'Connecting to environment'}</span>
          <span className="topbar-divider" /><button className="icon-button" onClick={() => setGuide(true)} aria-label="Open quick guide"><CircleHelp size={17} /></button></div>
      </header>
      <main>
        <div className="page-heading"><div><div className="eyebrow"><span className="tiny-dot green-dot" /> AGENT TIME MACHINE</div>
          <h1>{view === 'runs' ? 'A record of every possibility.' : 'A different decision. A new timeline.'}</h1>
          <p>{view === 'runs' ? 'Originals, replays, and interventions. Saved locally and ready to reopen.' : 'Record an agent run, rewind to a decision, and see what changes.'}</p>
        </div><button className="button subtle guide-trigger" onClick={() => setGuide(true)}><CircleHelp size={15} /> Quick guide<ArrowUpRight size={13} /></button></div>

        {error && <div className="alert error-alert" role="alert"><XCircle size={18} /><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError(null)}><X size={16} /></button></div>}
        {busy && <div className="busy-bar" role="status"><LoaderCircle size={14} className="spin" />{busy}…</div>}

        {view === 'runs' ? <section className="panel history-panel"><div className="panel-header"><h2><History size={16} /> Saved runs</h2><span className="muted">{runs.length} total</span></div>
          <div className="history-table"><div className="history-table-head"><span>Run</span><span>Execution mode</span><span>Outcome</span><span>Created</span><span /></div>
            {runs.map(item => <button className="history-table-row" key={item.id} onClick={() => void perform('Opening saved run', () => loadRun(item.id))}>
              <span className="history-title">{item.parent_id ? <GitBranch size={16} /> : <Workflow size={16} />}<span>{item.title}<small>{shortId(item.id)} · {item.parent_id ? 'Branch' : 'Original'}</small></span></span>
              <span>{modeName(item.mode)}</span><span><OutcomeBadge run={item} /></span><span>{timeOf(item.created_at)}</span><ArrowRight size={15} />
            </button>)}
          </div>
        </section> : <>
          <section className="run-toolbar" aria-label="Scenario controls">
            <div className="scenario-select"><span className="scenario-icon"><FlaskConical size={19} /></span><div><label htmlFor="scenario">CUSTOM RETAIL SCENARIO</label>
              <div className="select-line"><select id="scenario" value={selectedScenario} onChange={e => setSelectedScenario(e.target.value)} disabled={!!busy}>
                {scenarios.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select><ChevronDown size={14} /></div></div></div>
            <div className="toolbar-actions"><div className="mode-select"><Radio size={14} /><select aria-label="Execution mode" value={runMode} onChange={e => setRunMode(e.target.value)} disabled={!!busy}>
              <option value="deterministic_demo">Deterministic demo</option><option value="live_meta" disabled={!health?.meta.available}>Live Meta{!health?.meta.available ? ' · unavailable' : ''}</option></select><ChevronDown size={12} /></div>
              <button className="button primary" onClick={() => void newRun()} disabled={!!busy || !scenarios.length}><Play size={14} fill="currentColor" /> Run scenario</button></div>
          </section>

          {loading ? <div className="loading-state"><LoaderCircle size={25} className="spin" /><h2>Opening the workspace</h2><p>Loading saved events and verified checkpoints.</p></div> : run ? <>
            <div className="run-context"><span className="run-context-left"><span className="mono">RUN {shortId(run.id)}</span><span className="dot-separator">/</span>
              {run.parent_id ? <><GitBranch size={13} /><span>Intervention branch</span></> : <span>Original run</span>}
              <span className="saved-tag"><span className="tiny-dot" /> Saved</span></span>
              <div className="run-context-actions">{run.parent_id && <button className="text-button" onClick={() => void perform('Opening original', () => loadRun(run.parent_id!))}><ArrowLeft size={13} /> Parent run</button>}
                <button className="text-button" onClick={() => void replay()} disabled={!!busy}><RotateCcw size={13} /> Replay unchanged</button>
                <a className="text-button" href={'/api/runs/' + run.id + '/export'} download><Download size={13} /> Export</a></div></div>
            <div className="metrics">
              <div className="metric outcome-metric"><span className="metric-label">TASK OUTCOME</span><OutcomeBadge run={run} />
                <span className="metric-caption">{run.replay ? 'Observation + state comparison' : run.outcome.passed + ' of ' + run.outcome.total + ' implemented checks passed'}</span></div>
              <div className="metric"><span className="metric-label"><Terminal size={12} /> TOOL CALLS</span><strong>{toolEvents.length}<small>executed</small></strong><span className="metric-caption">Reads and writes recorded</span></div>
              <div className="metric"><span className="metric-label"><Fingerprint size={12} /> CHECKPOINTS</span><strong>{run.checkpoints.length}<small>available</small></strong><span className="metric-caption">State before each tool call</span></div>
              <div className="metric"><span className="metric-label"><Clock3 size={12} /> EXECUTION TIME</span><strong>{duration(run.elapsed_ms)}</strong><span className="metric-caption">{run.usage.calls ? run.usage.calls + ' model calls · ' + (run.usage.total_tokens ?? 'unknown') + ' tokens' : 'No model calls'}</span></div>
            </div>
            <div className={'mode-notice ' + (run.mode === 'live_meta' ? 'live-notice' : '')}><FlaskConical size={14} /><strong>{run.mode === 'unchanged_replay' ? 'Unchanged tool replay' : run.mode === 'live_meta' ? 'Live Meta execution' : 'Deterministic demo'}</strong>
              <span className="notice-divider" /><span>{run.mode === 'unchanged_replay' ? 'All tools executed again. Agent messages are saved playback.' : run.mode === 'live_meta' ? (run.injected_failure ? 'Fresh model calls after an injected failure.' : 'Fresh model calls.') : run.parent_id ? 'Manual intervention in an injected-failure scenario. No live model used.' : 'Injected failure. Real simulator execution. No live model used.'}</span>
            </div>
            <div className="workspace-grid">
              <section className="panel timeline-panel"><div className="panel-header"><h2><Workflow size={16} /> Execution timeline</h2><span className="panel-count">{run.events.length} events</span></div>
                <div className="timeline-caption"><span className="tiny-dot green-dot" /><span>Saved events · select a tool call to rewind</span><span className="timeline-legend"><span className="legend-square" />Checkpoint</span></div>
                <div className="timeline">{run.events.map(event => <EventCard key={event.id} event={event} selected={event.checkpoint_id === checkpointId && !!checkpointId}
                  onSelect={() => { setCheckpointId(event.checkpoint_id || null); setInspectorTab('intervene'); }} />)}</div>
                <div className="timeline-footer"><ShieldCheck size={14} /><span>Externally observable messages and tool events</span><span className="mono">tau2 · {run.compatibility.commit.slice(0, 7)}</span></div>
              </section>

              <section className="panel inspector-panel" aria-label="Checkpoint inspector"><div className="panel-header"><h2><Fingerprint size={16} /> Checkpoint inspector</h2>
                <button className="icon-button" aria-label="Export selected checkpoint" disabled={!checkpoint} onClick={() => checkpoint && download(checkpoint.id + '.json', checkpoint)}><Download size={15} /></button></div>
                {checkpointError ? <div className="inspector-empty"><XCircle size={26} className="text-red" /><h3>Checkpoint unavailable</h3><p role="alert">{checkpointError}</p><button className="button primary" onClick={() => void newRun()} disabled={!!busy}>Record a fresh run</button></div> :
                  !checkpoint ? <div className="inspector-empty">{checkpointId ? <LoaderCircle size={25} className="spin" /> : <Fingerprint size={28} />}
                    <h3>{checkpointId ? 'Restoring checkpoint' : 'Pick a point in time'}</h3><p>{run.replay ? 'This is a tool replay. Open its parent run to fork a decision.' : 'Select a tool call in the timeline to inspect its state and create an intervention.'}</p></div> : <>
                    <div className="checkpoint-overview"><div><span className="eyebrow">BEFORE TOOL EXECUTION</span><h3>Checkpoint {String(ownBoundary?.step || 1).padStart(2, '0')}<span className="badge green verified"><ShieldCheck size={11} />Verified</span></h3></div>
                      <p className="mono">{checkpoint.sha256.slice(0, 20)}<span>…</span><button className="icon-button" aria-label="Copy snapshot hash" onClick={() => void navigator.clipboard.writeText(checkpoint.sha256).then(() => setToast('Snapshot hash copied.')).catch(() => setError('Clipboard unavailable; export the checkpoint to inspect its hash.'))}><Copy size={12} /></button></p></div>
                    <div className="inspector-tabs" role="tablist" aria-label="Checkpoint details">{[['intervene', 'Intervene', GitBranch], ['state', 'State', Database], ['context', 'Context', MessageSquare]].map(([id, label, Icon]) =>
                      <button key={String(id)} role="tab" aria-selected={inspectorTab === id} className={inspectorTab === id ? 'active' : ''} onClick={() => setInspectorTab(String(id))}>
                        {typeof Icon !== 'string' && <Icon size={13} />}{String(label)}</button>)}</div>
                    {inspectorTab === 'intervene' ? <div className="intervention-content">
                      <div className="section-title"><span>CHANGE THE NEXT ACTION</span><span className={'badge ' + (proposal ? 'purple' : 'neutral')}>{proposal ? <Sparkles size={10} /> : <Braces size={10} />}{proposal ? 'Meta proposal' : 'Manual patch'}</span></div>
                      <label className="field-label" htmlFor="tool">Tool</label><div className="tool-select"><Terminal size={13} /><select id="tool" value={tool} onChange={e => {
                        setTool(e.target.value); setProposal(null);
                        if (e.target.value === checkpoint.payload.pending_action.tool) setArgumentsText(pretty(checkpoint.payload.pending_action.arguments));
                        else setArgumentsText('{}');
                      }} disabled={!!busy}>{checkpoint.payload.tools.map(t => <option key={t.function.name}>{t.function.name}</option>)}</select><ChevronDown size={12} /></div>
                      <div className="editor-label"><label className="field-label" htmlFor="arguments">Arguments</label><span className="mono">JSON</span>
                        <button className="text-button" onClick={() => { setTool(checkpoint.payload.pending_action.tool); setArgumentsText(pretty(checkpoint.payload.pending_action.arguments)); setProposal(null); }} disabled={!!busy}>Reset</button></div>
                      <div className={'code-editor ' + (editorError ? 'invalid' : '')}><div className="line-numbers" aria-hidden="true">{argumentsText.split('\n').map((_, i) => <span key={i}>{i + 1}</span>)}</div>
                        <textarea id="arguments" aria-label="Tool arguments JSON" value={argumentsText} onChange={e => { setArgumentsText(e.target.value); setProposal(null); }} spellCheck={false} disabled={!!busy} /></div>
                      {editorError ? <p className="editor-error">{editorError}</p> : <div className="editor-status"><span className={'tiny-dot ' + (changed ? 'green-dot' : '')} />{changed ? 'Intervention ready · action changed' : 'Edit an argument to explore an alternative'}</div>}
                      <details className="hint"><summary><CircleHelp size={13} /> Need a starting point?<ChevronDown size={12} /></summary><p>{task?.hint}</p><p className="muted">Injected fault: {task?.injected_failure}</p></details>
                      {proposal && <div className="proposal-note"><Sparkles size={14} /><div><strong>Review Meta’s proposal</strong><p>{proposal.explanation}</p><small>The separate proposer saw the full failed trace. The continuing agent receives only checkpoint context.</small></div></div>}
                      <div className="continuation-field"><label className="field-label" htmlFor="continuation">Continue with</label><select id="continuation" value={continuation} onChange={e => setContinuation(e.target.value)} disabled={!!busy || !!proposal}>
                        <option value="deterministic_demo" disabled={checkpoint.payload.agent_config.kind === 'live_meta'}>Deterministic demo policy</option>
                        <option value="live_meta" disabled={!health?.meta.available}>Fresh Meta calls{!health?.meta.available ? ' · unavailable' : ''}</option></select></div>
                      <button className="button primary fork-button" onClick={() => void fork()} disabled={!!busy || !!editorError}><GitBranch size={15} /> Fork & execute<ArrowRight size={15} /></button>
                      <button className="button secondary meta-button" onClick={() => void askMeta()} disabled={!!busy || !health?.meta.available}><Sparkles size={14} /> Ask Meta for a patch<span className="small-tag">{health?.meta.available ? 'LIVE' : 'UNAVAILABLE'}</span></button>
                      {!health?.meta.available && <button className="text-button configure-link" onClick={() => setGuide(true)}>Configure Meta access<ArrowUpRight size={11} /></button>}
                      <div className="fork-contract"><Layers3 size={15} /><div><strong>One change. An isolated branch.</strong><p>{checkpoint.payload.conversation.length} prior messages restored. Original future excluded. Parent run preserved.</p></div></div>
                    </div> : inspectorTab === 'state' ? <div className="state-content"><div className="state-stats"><span><strong>{Object.keys(checkpoint.payload.environment.orders).length}</strong>orders</span><span><strong>{Object.keys(checkpoint.payload.environment.users).length}</strong>customer</span><span><strong>{Object.keys(checkpoint.payload.environment.products).length}</strong>products</span></div>
                      <p className="inspector-description">Environment state immediately before this tool call.</p>
                      {Object.entries(checkpoint.payload.environment).map(([key, value]) => <details className="state-section" key={key} open={key === 'orders'}><summary><Database size={13} />{key}<ChevronDown size={12} /></summary><pre>{pretty(value)}</pre></details>)}
                    </div> : <div className="context-content"><p className="inspector-description">Exactly the conversation restored at this boundary. Later events are excluded.</p>
                      {checkpoint.payload.conversation.map((message, index) => <details className="context-message" key={index}><summary><span className="mono">{String(index + 1).padStart(2, '0')}</span><strong>{message.role}</strong><ChevronDown size={12} /></summary>
                        <pre>{message.content || pretty(message.tool_calls)}</pre></details>)}
                      {selectedEvent?.observation && <details className="state-section"><summary>Original observation (happens after checkpoint)<ChevronDown size={12} /></summary><pre>{pretty(selectedEvent.observation)}</pre><p className="inspector-description">Visible for inspection; excluded from restored context.</p></details>}
                    </div>}
                  </>}
              </section>
            </div>

            <section className="panel results-panel"><div className="panel-header"><h2>{comparison ? <GitBranch size={16} /> : <ShieldCheck size={16} />}{comparison ? 'Compare the timelines' : run.replay ? 'Replay verification' : 'Outcome checks'}</h2>
              {comparison?.original_unchanged ? <span className="preserved"><ShieldCheck size={13} /> Parent verified unchanged</span> : <span className="panel-count">Scoped task verification</span>}</div>
              {comparison ? <><div className="comparison-summary"><div className="comparison-card"><span className="eyebrow">PARENT · {shortId(comparison.parent_id)}</span><OutcomeBadge run={{ outcome: comparison.parent_outcome, replay: null, execution: 'completed' }} />
                  <span>{comparison.parent_outcome.passed}/{comparison.parent_outcome.total} checks · {duration(comparison.parent_elapsed_ms)} · {comparison.parent_usage.calls} model calls</span></div>
                <span className="comparison-arrow"><ArrowRight size={20} /></span><div className="comparison-card branch-card"><span className="eyebrow">THIS BRANCH · {shortId(run.id)}</span><OutcomeBadge run={run} />
                  <span>{run.outcome.passed}/{run.outcome.total} checks · {duration(comparison.branch_elapsed_ms)} · {comparison.branch_usage.calls} model calls</span></div></div>
                {run.patch && <div className="patch-summary"><span className="field-label">{run.patch.provenance.kind === 'meta_proposal' ? 'Reviewed Meta proposal · proposer saw the failed trace' : 'Manual intervention'} · {modeName(run.patch.continuation)}</span><div><code className="removed">− {run.patch.before.tool}({JSON.stringify(run.patch.before.arguments)})</code><code className="added">+ {run.patch.after.tool}({JSON.stringify(run.patch.after.arguments)})</code></div></div>}
                <div className="comparison-checks"><div><h3>Parent checks</h3><CheckList outcome={comparison.parent_outcome} /></div><div><h3>Branch checks</h3><CheckList outcome={run.outcome} /></div></div>
                <div className="result-section-heading"><h3><Database size={14} /> Final state differences</h3><span>{comparison.state_diff.length} changed paths</span></div><DiffTable changes={comparison.state_diff} />
              </> : run.replay ? <div className="replay-result"><RotateCcw size={24} /><div><h3>{run.replay.status === 'matched' ? 'The recorded tool sequence reproduced its observations and state.' : 'The recorded tool sequence did not reproduce the original.'}</h3>
                <p>Observation match: {String(run.replay.observations_match)} · Final state match: {String(run.replay.state_match)} · Recorded tool errors: {run.replay.tool_errors}</p><p>Task success is not evaluated by this replay. Displayed agent messages are saved playback.</p></div></div> : <CheckList outcome={run.outcome} />}
              <div className="results-footer"><CircleHelp size={13} /><span>{comparison ? comparison.scope : run.outcome.scope}</span><button className="text-button" onClick={() => setGuide(true)}>About the checks<ArrowUpRight size={11} /></button></div>
            </section>
          </> : <div className="loading-state"><Workflow size={32} /><h2>Your first timeline starts here.</h2><p>Choose a scenario and run the deterministic demo.</p><button className="button primary" onClick={() => void newRun()}>Run scenario<Play size={14} /></button></div>}
        </>}
        <footer className="page-footer"><span><Mark />Agent Time Machine</span><span>Custom scenarios · pinned tau2 retail tools · local SQLite persistence</span><span>BUILD. REWIND. EXPLORE.</span></footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><CheckCircle2 size={17} /><span>{toast}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={14} /></button></div>}
    <input className="sr-only" type="file" accept=".json,application/json" ref={importInput} aria-label="Import checkpoint for validation" onChange={e => { const file = e.target.files?.[0]; if (file) void importCheckpoint(file); e.target.value = ''; }} />
    {guide && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setGuide(false); }}><section className="guide-modal" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <div className="modal-header"><Mark /><span className="eyebrow">A SMALL GUIDE TO OTHER POSSIBILITIES</span><button className="icon-button" onClick={() => setGuide(false)} aria-label="Close guide" autoFocus><X size={20} /></button></div>
      <h2 id="guide-title">What if the agent<br />chose differently?</h2><p className="guide-intro">Choose a checkpoint, change the pending action, and execute a separate timeline. The original stays inspectable.</p>
      <ol className="guide-steps"><li><span>01</span><div><strong>Record a run</strong><p>The deterministic demo injects a known error into real simulator tool calls.</p></div></li>
        <li><span>02</span><div><strong>Rewind a decision</strong><p>Select the last tool call. Compare its arguments with the customer’s request.</p></div></li>
        <li><span>03</span><div><strong>Change one thing</strong><p>Edit the argument and select Fork & execute. Inspect the state differences and task checks.</p></div></li></ol>
      <div className="guide-section"><h3><Radio size={15} /> Execution modes</h3><p><strong>Saved playback</strong> displays recorded events. <strong>Unchanged replay</strong> executes every recorded tool again and compares outputs. <strong>Intervention</strong> restores a checkpoint and computes a new continuation.</p></div>
      <div className="guide-section model-config"><h3><Sparkles size={15} /> Meta connection<span className={'badge ' + (health?.meta.available ? 'green' : 'neutral')}>{health?.meta.available ? 'Configured' : 'Offline'}</span></h3>
        <p>{health?.meta.available ? 'Account access has not been verified by a live call. Each action is bounded by the configured allowance.' : 'The full manual demo works offline. To use Meta, configure these server environment values and restart:'}</p>
        <code>MODEL_API_KEY · META_MODEL · ATM_LIVE_MAX_CALLS</code>
        {health?.meta.blockers.map(blocker => <p className="config-blocker" key={blocker}><Circle size={8} />{blocker}</p>)}
        <p className="muted">Current ledger: {health?.model_ledger.calls || 0} attempted calls. Monetary cost: {health?.model_ledger.cost_usd == null ? 'unknown / not applicable' : '$' + health.model_ledger.cost_usd.toFixed(5)}. Keys stay on the server.</p>
        <a className="text-button" href="https://dev.meta.ai/docs/cookbook/quickstart-chat-completions" target="_blank" rel="noreferrer">Official Meta API setup<ArrowUpRight size={12} /></a></div>
      <div className="guide-section"><h3><ShieldCheck size={15} /> What the checks establish</h3><p>Implemented checks cover task state, required communication, authentication, and the custom upfront-consent contract. The complete retail dialogue policy is not evaluated. These synthetic tasks are not an official tau2 score or evidence of live model recovery gains.</p></div>
      <div className="modal-footer"><button className="button secondary" onClick={() => { setGuide(false); importInput.current?.click(); }}><Upload size={14} /> Validate checkpoint file</button><button className="button primary" onClick={() => setGuide(false)}>Explore a timeline<ArrowRight size={14} /></button></div>
    </section></div>}
  </div>;
}

