import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Braces, Check, CheckCircle2,
  ChevronDown, ChevronRight, Circle, CircleHelp, Clock3, Copy, Database, Download,
  FileCode2, Fingerprint, FlaskConical, GitBranch, History, Layers3, LoaderCircle,
  MessageSquare, Play, Radio, RotateCcw, Settings2, ShieldCheck, Sparkles,
  Terminal, Upload, Workflow, X, XCircle, Moon, Sun,
} from 'lucide-react';
import SourceEditor from './components/SourceEditor';
import RepairReview from './components/RepairReview';
import type { Action, Change, Checkpoint, CommandResult, Comparison, FileDiff, Health, Outcome, Proposal, Run, RunEvent, RunSummary, Scenario, Usage, Verification } from './types';

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
const measuredUsage = (usage: Usage) => (usage.total_tokens == null ? 'tokens unknown' : usage.total_tokens.toLocaleString() + ' tokens') +
  ' · cost ' + (usage.cost_usd == null ? 'unknown' : '$' + usage.cost_usd.toFixed(5));
const asCommand = (value: unknown): CommandResult | null => value && typeof value === 'object' &&
  'command' in value && Array.isArray(value.command) && 'exit_code' in value ? value as CommandResult : null;

function navigateTabs(event: ReactKeyboardEvent<HTMLDivElement>) {
  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
    (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next]?.focus(); tabs[next]?.click();
}

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

function CheckList({ outcome, collapsePassedRegressions = false }: { outcome: Outcome; collapsePassedRegressions?: boolean }) {
  const collapsed = collapsePassedRegressions ? outcome.checks.filter(check => check.group === 'regression' && check.status === 'passed') : [];
  const visible = outcome.checks.filter(check => !collapsed.includes(check));
  const renderCheck = (check: Outcome['checks'][number]) => <details key={check.id} className="check-row">
    <summary>
      {check.status === 'passed' ? <CheckCircle2 size={15} className="text-green" /> :
        check.status === 'failed' ? <XCircle size={15} className="text-red" /> : <Circle size={14} className="muted" />}
      <span>{check.label}</span>
      <span className={'check-status ' + check.status}>{check.status === 'not_evaluated' ? 'Not evaluated' : check.status}</span>
      <ChevronDown size={12} className="muted" />
    </summary>
    <p>{check.detail}</p>
  </details>;
  return <div className="check-list">{visible.map(renderCheck)}
    {!!collapsed.length && <details className="passed-regression-checks"><summary><CheckCircle2 size={15} className="text-green" />
      <span>{collapsed.length} passed regression {collapsed.length === 1 ? 'check' : 'checks'}</span><ChevronDown size={13} /></summary>
      <div>{collapsed.map(renderCheck)}</div></details>}
  </div>;
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

function ConsoleOutput({ result, title = 'Command output' }: { result: CommandResult; title?: string }) {
  const failed = result.timed_out || result.exit_code !== 0;
  return <div className="command-console">
    <div className="console-heading"><span><Terminal size={14} />{title}</span><span className={'badge ' + (failed ? 'red' : 'green')}>
      {result.timed_out ? 'Timed out' : result.exit_code == null ? 'Not completed' : 'Exit ' + result.exit_code}</span></div>
    <code className="console-command">$ {result.command.join(' ') || 'Command unavailable'}</code>
    {result.stdout && <pre aria-label={title + ' stdout'}>{result.stdout}</pre>}
    {result.stderr && <><div className="console-stream">stderr</div><pre className="console-stderr" aria-label={title + ' stderr'}>{result.stderr}</pre></>}
    {result.error && <p className="console-error">{result.error}</p>}
    {!result.stdout && !result.stderr && <p className="console-empty">{failed ? 'The runner did not produce output. Inspect the execution error for details.' : 'The command produced no output.'}</p>}
  </div>;
}

function VerificationEvidence({ verification, title = 'Protected verification' }: { verification: Verification; title?: string }) {
  return <div className="verification-evidence">
    <div className="verification-heading"><h3><ShieldCheck size={15} />{title}</h3>
      {verification.tamper_detected && <span className="badge red">Tampering detected</span>}</div>
    {verification.command ? <ConsoleOutput result={verification.command} title={title + ' output'} /> :
      <p className="inspector-description">{verification.error || 'Verification runner output is unavailable. Check the recorded execution error.'}</p>}
    <details className="verification-provenance"><summary>Verification provenance<ChevronDown size={12} /></summary>
      <dl><dt>Suite</dt><dd>{verification.suite_version}</dd><dt>Requirements SHA-256</dt><dd>{verification.requirements_hash}</dd>
        <dt>Protected evaluator SHA-256</dt><dd>{verification.protected_evaluator_hash}</dd></dl>
      <p>The recorded checks and command output are evidence for this fixture and suite.</p></details>
  </div>;
}

function FileChanges({ changes, empty = 'No file changes.' }: { changes: FileDiff[]; empty?: string }) {
  if (!changes.length) return <div className="empty-inline"><CheckCircle2 size={17} />{empty}</div>;
  return <div className="file-changes">{changes.map(change => <details className="file-change" key={change.path} open>
    <summary><FileCode2 size={15} /><code>{change.path}</code><span className="file-change-kind">{change.before === null ? 'Added' : change.after === null ? 'Deleted' : 'Modified'}</span><ChevronDown size={13} /></summary>
    <pre className="source-diff" aria-label={'Patch for ' + change.path}>{change.unified_diff ? change.unified_diff.split('\n').map((line, index) =>
      <span key={index} className={line.startsWith('@@') ? 'diff-hunk' : line.startsWith('+') && !line.startsWith('+++') ? 'diff-addition' : line.startsWith('-') && !line.startsWith('---') ? 'diff-deletion' : ''}>{line || ' '}</span>) : change.after ?? '(file deleted)'}</pre>
  </details>)}</div>;
}

function SnapshotState({ checkpoint }: { checkpoint: Checkpoint }) {
  const environment = checkpoint.payload.environment;
  if ('files' in environment) return <div className="state-content">
    <div className="snapshot-summary"><FileCode2 size={20} /><div><strong>{environment.fixture_id}</strong><span>{Object.keys(environment.files).length} files at this checkpoint</span></div></div>
    <p className="inspector-description">Exact file contents before this action. Each branch restores its own copy.</p>
    {Object.entries(environment.files).map(([path, content]) => <details className="state-section source-file" key={path}>
      <summary><FileCode2 size={14} /><code>{path}</code>{!environment.tracked_files.includes(path) && <span className="badge neutral">Untracked</span>}<ChevronDown size={12} /></summary><pre>{content}</pre></details>)}
    <details className="state-section"><summary><Settings2 size={14} />Execution configuration<ChevronDown size={12} /></summary><pre>{pretty(environment.execution_config)}</pre></details>
  </div>;
  return <div className="state-content"><div className="state-stats"><span><strong>{Object.keys(environment.orders).length}</strong>orders</span><span><strong>{Object.keys(environment.users).length}</strong>customer</span><span><strong>{Object.keys(environment.products).length}</strong>products</span></div>
    <p className="inspector-description">Environment state immediately before this tool call.</p>
    {Object.entries(environment).map(([key, value]) => <details className="state-section" key={key} open={key === 'orders'}><summary><Database size={13} />{key}<ChevronDown size={12} /></summary><pre>{pretty(value)}</pre></details>)}
  </div>;
}

function EventCard({ event, selected, onSelect, coding = false, disabled = false }: { event: RunEvent; selected: boolean; onSelect: () => void; coding?: boolean; disabled?: boolean }) {
  const tool = event.kind === 'tool';
  const user = event.kind === 'user_message';
  const error = event.kind === 'execution_error';
  const model = event.kind === 'model_call';
  const command = asCommand(event.observation?.value);
  const toolFailed = !event.observation?.ok || !!command && (command.exit_code !== 0 || command.timed_out);
  const label = tool ? event.tool : user ? coding ? 'Developer task' : 'Customer request' : error ? 'Execution stopped' : model ? 'Meta model call' : 'Agent response';
  const summary = tool ? Object.entries(event.arguments || {}).map(([key, value]) => key === 'content' && coding && typeof value === 'string' ? value.split('\n').length + ' lines of source' : key + ': ' + displayValue(value)).join('  ·  ') : event.content;
  const canSelect = tool && !!event.checkpoint_id && !event.inherited;
  const Icon = tool ? Terminal : user ? MessageSquare : error ? XCircle : model ? Sparkles : Workflow;
  const contents = <>
    <span className="event-top"><span className={tool ? 'tool-name' : 'event-name'}>{label}</span>
      <span className="event-step">{String(event.seq + 1).padStart(2, '0')}</span></span>
    {model ? <span className="event-summary">{event.model} · {event.usage ? event.usage.total_tokens + ' tokens' : 'usage unknown'}</span> :
      <span className={'event-summary ' + (tool ? 'mono truncate' : '')}>{summary}</span>}
    <span className="event-bottom">
      {tool ? <><span className={'tiny-dot ' + (toolFailed ? 'red-dot' : 'green-dot')} />
        <span>{command ? command.timed_out ? 'Command timed out' : command.exit_code == null ? 'Command incomplete' : 'Command exited ' + command.exit_code : event.observation?.ok ? 'Tool succeeded' : 'Tool error'}</span><span className="dot-separator">·</span>
        <span>{duration(event.latency_ms || 0)}</span>
        {selected && <span className="checkpoint-tag"><Fingerprint size={12} /> Selected checkpoint</span>}
        {!selected && canSelect && <ChevronRight size={14} className="event-arrow" />}</> :
        <span>{event.inherited ? 'Inherited context' : event.source === 'recorded_playback' ? 'Recorded message · no fresh generation' : user ? 'Scenario input' : modeName(event.source)}</span>}
      {event.inherited && tool && <span className="inherited-label">Inherited</span>}
    </span>
  </>;
  if (!tool) return <details className={'message-event ' + (error ? 'error-event' : '')} open={error}>
    <summary><Icon size={14} /><span>{label}</span><ChevronDown size={12} /></summary>
    <p>{model ? event.model + ' · ' + (event.usage?.total_tokens ?? 'unknown') + ' tokens' : event.content}</p>
    <small>{event.source === 'recorded_playback' ? 'Recorded playback' : modeName(event.source)}</small>
  </details>;
  return <div className={'timeline-entry ' + (user ? 'customer-entry ' : '') + (selected ? 'selected ' : '') + (event.inherited ? 'inherited ' : '')}>
    <span className={'timeline-node ' + (selected ? 'node-selected' : error || (tool && toolFailed) ? 'node-error' : '')}>
      <Icon size={14} />
    </span>
    {canSelect ? <button type="button" className="event-card selectable" onClick={onSelect} disabled={disabled}
      aria-pressed={selected} aria-label={'Inspect checkpoint before ' + event.tool}>{contents}</button> :
      <article className={'event-card message-card ' + (error ? 'error-event' : '')}>{contents}</article>}
  </div>;
}

export default function App() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [selectedScenario, setSelectedScenario] = useState('coding-date-parser');
  const [runMode, setRunMode] = useState(() => localStorage.getItem('atm-run-mode') === 'live_meta' ? 'live_meta' : 'deterministic_demo');
  const [checkpointId, setCheckpointId] = useState<string | null>(null);
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [tool, setTool] = useState('');
  const [argumentsText, setArgumentsText] = useState('{}');
  const [continuation, setContinuation] = useState('deterministic_demo');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [proposalHistory, setProposalHistory] = useState<Proposal[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [proposalHistoryError, setProposalHistoryError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [inspectorTab, setInspectorTab] = useState('intervene');
  const [view, setView] = useState('workspace');
  const [workspaceMode, setWorkspaceMode] = useState('inspect');
  const [traceExpanded, setTraceExpanded] = useState(false);
  const [evidenceTab, setEvidenceTab] = useState('checks');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('atm-theme') === 'light' ? 'light' : 'dark');
  const [guide, setGuide] = useState(false);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const guideTrigger = useRef<HTMLElement | null>(null);
  const guideDialog = useRef<HTMLElement | null>(null);
  const timeline = useRef<HTMLDivElement | null>(null);
  const runRequest = useRef(0);
  const drafts = useRef(new Map<string, { tool: string; argumentsText: string; continuation: string; proposal: Proposal | null }>());

  function openGuide() {
    guideTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setGuide(true);
  }

  async function loadRun(id: string) {
    const request = ++runRequest.current;
    const next = await api<Run>('/runs/' + id);
    if (request !== runRequest.current) return;
    setRun(next);
    setProposal(null); setSelectedProposal(null); setProposalHistory([]); setProposalHistoryError(null);
    setSelectedScenario(next.scenario_id);
    const editCheckpoint = next.domain === 'coding' ? [...next.checkpoints].reverse().find(item => item.tool === 'write_file') : null;
    setCheckpointId(editCheckpoint?.id || next.checkpoints.at(-1)?.id || null);
    setInspectorTab('intervene');
    setComparison(null);
    setView('workspace');
    setWorkspaceMode(next.parent_id || next.replay ? 'results' : 'inspect');
    setEvidenceTab(next.parent_id && next.domain === 'coding' && !next.replay ? 'patch' : 'checks');
    localStorage.setItem('atm-active-run', id);
    localStorage.setItem('atm-primary-domain', 'coding-v1');
  }

  async function refresh() {
    const [list, status] = await Promise.all([api<RunSummary[]>('/runs'), api<Health>('/health')]);
    setRuns(list); setHealth(status);
  }

  useEffect(() => {
    localStorage.setItem('atm-theme', theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => { localStorage.setItem('atm-run-mode', runMode); }, [runMode]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api<Scenario[]>('/scenarios'), api<RunSummary[]>('/runs'), api<Health>('/health')])
      .then(async ([tasks, list, status]) => {
        if (cancelled) return;
        setScenarios(tasks); setRuns(list); setHealth(status);
        const stored = localStorage.getItem('atm-active-run');
        const codingOriginal = list.find(r => r.domain === 'coding' && !r.parent_id && r.scenario_id === 'coding-date-parser') || list.find(r => r.domain === 'coding' && !r.parent_id);
        const firstCodingLoad = localStorage.getItem('atm-primary-domain') !== 'coding-v1';
        const id = firstCodingLoad ? codingOriginal?.id : list.find(r => r.id === stored)?.id || codingOriginal?.id || list.find(r => !r.parent_id)?.id || list[0]?.id;
        if (id) await loadRun(id);
        else setSelectedScenario(tasks.find(item => item.id === 'coding-date-parser')?.id || tasks[0]?.id || 'coding-date-parser');
      }).catch(e => !cancelled && setError(e.message)).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCheckpoint(null); setCheckpointError(null); setProposal(null);
    if (checkpointId) api<Checkpoint>('/checkpoints/' + checkpointId).then(next => {
      if (cancelled) return;
      const draft = drafts.current.get(next.id);
      setCheckpoint(next); setTool(draft?.tool ?? next.payload.pending_action.tool);
      setArgumentsText(draft?.argumentsText ?? pretty(next.payload.pending_action.arguments));
      setContinuation(draft?.continuation ?? next.payload.agent_config.kind);
      setProposal(draft?.proposal ?? null);
    }).catch(e => !cancelled && setCheckpointError(e.message));
    return () => { cancelled = true; };
  }, [checkpointId]);

  useEffect(() => {
    if (checkpoint?.id === checkpointId && checkpoint) drafts.current.set(checkpoint.id, { tool, argumentsText, continuation, proposal });
  }, [checkpoint, checkpointId, tool, argumentsText, continuation, proposal]);

  useEffect(() => {
    const container = timeline.current;
    const selected = container?.querySelector<HTMLElement>('.timeline-entry.selected');
    if (!container || !selected) return;
    const bounds = container.getBoundingClientRect(), target = selected.getBoundingClientRect();
    if (matchMedia('(max-width: 700px)').matches) {
      container.scrollLeft += target.left - bounds.left - (bounds.width - target.width) / 2;
    } else if (target.top < bounds.top || target.bottom > bounds.bottom) {
      container.scrollTop += target.top - bounds.top - (bounds.height - target.height) / 2;
    }
  }, [checkpointId, traceExpanded, run?.id]);

  useEffect(() => {
    let cancelled = false;
    if (run?.parent_id && !run.replay) api<Comparison>('/runs/' + run.id + '/compare').then(next => {
      if (!cancelled) setComparison(next);
    }).catch(e => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [run?.id]);

  useEffect(() => {
    let cancelled = false;
    if (run?.domain === 'coding') api<Proposal[]>('/runs/' + run.id + '/proposals').then(next => {
      if (!cancelled) { setProposalHistory(current => [...current, ...next.filter(item => !current.some(existing => existing.id === item.id))]); setProposalHistoryError(null); }
    }).catch(e => !cancelled && setProposalHistoryError(e.message));
    return () => { cancelled = true; };
  }, [run?.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!guide) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGuide(false);
      if (event.key !== 'Tab') return;
      const targets = guideDialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, textarea, [tabindex="0"]');
      if (!targets?.length) return;
      const first = targets[0], last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('keydown', close); guideTrigger.current?.focus(); };
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
    if (!run || !checkpoint || checkpoint.id !== checkpointId) return;
    await perform('Executing branch', async () => {
      const args = JSON.parse(argumentsText);
      const reviewed = proposal?.status === 'ready' && (!proposal.checkpoint_id || proposal.checkpoint_id === checkpoint.id) &&
        stable(proposal.action) === stable({ tool, arguments: args });
      const next = await api<Run>('/runs/' + run.id + '/branches', { checkpoint_id: checkpoint.id,
        tool, arguments: args, continuation: reviewed ? 'live_meta' : continuation, proposal_id: reviewed ? proposal.id : null });
      await refresh(); await loadRun(next.id);
      setToast(next.execution === 'completed' ? 'Branch saved. Compare its patch and verified results.' : 'Branch saved with an execution error.');
    });
  }

  async function reviewProposal(next: Proposal) {
    if (!run) return;
    setSelectedProposal(next);
    if (next.status !== 'ready' || !next.action) { setProposal(null); return; }
    const target = next.checkpoint_id || checkpointId;
    if (!target || !run.checkpoints.some(boundary => boundary.id === target)) throw new Error('The proposal does not select an available checkpoint in this run.');
    // Cache first: the checkpoint-loading effect restores this exact reviewed action.
    // It must not replace the proposal with the checkpoint's original pending edit.
    drafts.current.set(target, { tool: next.action.tool, argumentsText: pretty(next.action.arguments), continuation: 'live_meta', proposal: next });
    setCheckpointId(target);
    setProposal(next); setTool(next.action.tool); setArgumentsText(pretty(next.action.arguments));
    setContinuation('live_meta'); setInspectorTab('intervene'); setWorkspaceMode('inspect');
  }

  async function askMeta() {
    if (!run || run.domain !== 'coding' && !checkpoint) return;
    const sourceRunId = run.id;
    await perform('Meta is analyzing the failed execution', async () => {
      const next = await api<Proposal>('/runs/' + sourceRunId + '/proposals', run.domain === 'coding' ? {} : { checkpoint_id: checkpoint!.id });
      setProposalHistory(history => [next, ...history.filter(item => item.id !== next.id)]);
      setProposalHistoryError(null);
      await reviewProposal(next);
      if (run.domain === 'coding') setWorkspaceMode('repair');
      await refresh();
      setToast(next.status === 'ready' ? 'Meta selected a checkpoint and proposed a correction. Review it before executing.' :
        next.status === 'insufficient_evidence' ? 'Meta reported insufficient evidence. The attempt is saved.' : 'Meta proposal failed. Inspect the saved error and usage.');
    });
  }

  async function replay() {
    if (!run) return;
    await perform('Replaying tools', async () => {
      const next = await api<Run>('/runs/' + run.id + '/replay', {});
      await refresh(); await loadRun(next.id); setToast('Tool replay saved. Agent messages are recorded playback.');
    });
  }

  async function restartWithoutAdvice() {
    if (!run || !selectedProposal?.checkpoint_id) return;
    await perform('Restarting from checkpoint without advice', async () => {
      const next = await api<Run>('/runs/' + run.id + '/restarts', { checkpoint_id: selectedProposal.checkpoint_id });
      await refresh(); await loadRun(next.id);
      setToast('Fresh restart saved. Compare its verified outcome and usage; no repair proposal was supplied.');
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
  const proposalDraftMatches = !!selectedProposal && proposal?.id === selectedProposal.id && stable(parsedAction) === stable(selectedProposal.action);
  const task = scenarios.find(s => s.id === (run?.scenario_id || selectedScenario));
  const selectedTask = scenarios.find(s => s.id === selectedScenario);
  const selectedCoding = (selectedTask?.domain || (selectedScenario.startsWith('coding-') ? 'coding' : 'retail')) === 'coding';
  const coding = (run?.domain || task?.domain || (run ? 'retail' : 'coding')) === 'coding';
  const sourceEditor = coding && tool === 'write_file';
  const sourcePath = typeof parsedAction?.arguments.path === 'string' ? parsedAction.arguments.path : '';
  const sourceContent = typeof parsedAction?.arguments.content === 'string' ? parsedAction.arguments.content : '';
  const updateArgument = (key: string, value: string) => {
    setArgumentsText(pretty({ ...parsedAction?.arguments, [key]: value })); setProposal(null);
  };
  const selectedEvent = run?.events.find(e => e.checkpoint_id === checkpointId);
  const selectedCommand = asCommand(selectedEvent?.observation?.value);
  const observation = selectedEvent?.observation?.value;
  const observedSource = coding && selectedEvent?.tool === 'read_file' && observation && typeof observation === 'object' &&
    'content' in observation && typeof observation.content === 'string' ? observation.content : null;
  const toolEvents = run?.events.filter(e => e.kind === 'tool') || [];
  const ownBoundary = run?.checkpoints.find(c => c.id === checkpointId);
  const argumentsEditor = <>
    <div className="editor-label"><label className="field-label" htmlFor="arguments">Arguments</label><span className="mono">JSON</span>
      <button className="text-button" onClick={() => { if (!checkpoint) return; setTool(checkpoint.payload.pending_action.tool); setArgumentsText(pretty(checkpoint.payload.pending_action.arguments)); setProposal(null); }} disabled={!!busy}>Reset</button></div>
    <div className="editor-filebar"><span><Braces size={13} /> arguments.json</span><span>Editable</span></div>
    <div className={'code-editor ' + (editorError ? 'invalid' : '')}><div className="line-numbers" aria-hidden="true">{argumentsText.split('\n').map((_, i) => <span key={i}>{i + 1}</span>)}</div>
      <textarea id="arguments" aria-label="Tool arguments JSON" value={argumentsText} onChange={e => { setArgumentsText(e.target.value); setProposal(null); }} spellCheck={false} disabled={!!busy} /></div>
  </>;

  return <div className="app-shell" data-theme={theme}>
    <aside inert={guide} className="activity-rail" aria-label="Workspace navigation">
      <a className="rail-brand" href="#" aria-label="Agent Time Machine workspace" onClick={e => { e.preventDefault(); setView('workspace'); }}><Mark /></a>
      <nav className="main-nav" aria-label="Main navigation">
        <button title="Debugger" aria-label="Debugger" className={view === 'workspace' ? 'active' : ''} onClick={() => setView('workspace')}><Workflow size={20} /></button>
        <button title="Run history" aria-label="Run history" className={view === 'runs' ? 'active' : ''} onClick={() => setView('runs')}><History size={20} /></button>
      </nav>
      <div className="rail-bottom">
        <button className="icon-button" title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button>
        <button className="icon-button" title="Environment and models" aria-label="Environment and models" onClick={openGuide}><Settings2 size={19} /></button>
        <button className="icon-button" title="How it works" aria-label="How it works" onClick={openGuide}><CircleHelp size={19} /></button>
      </div>
    </aside>
    <div inert={guide} className="main-shell">
      <header className="topbar"><div className="app-title"><strong>Time Machine</strong><span>/</span><span>{view === 'runs' ? 'Run history' : 'Agent debugger'}</span></div>
        <div className="topbar-right"><span className="connection"><span className={'tiny-dot ' + (health ? 'green-dot' : '')} />{health ? 'Local workspace' : 'Connecting…'}</span><span className="topbar-divider" /><button className="text-button" onClick={openGuide}>Quick guide<ArrowUpRight size={13} /></button></div>
      </header>
      <main>
        {error && <div className="alert error-alert" role="alert"><XCircle size={18} /><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError(null)}><X size={16} /></button></div>}
        {busy && <div className="busy-bar" role="status"><LoaderCircle size={14} className="spin" />{busy}…</div>}
        {view === 'runs' ? <section className="panel history-panel"><div className="panel-header"><div><h1>Saved runs</h1><p>Every original, alternative, and failed attempt.</p></div><span className="muted">{runs.length} total</span></div>
          <div className="history-table"><div className="history-table-head"><span>Run</span><span>Execution mode</span><span>Outcome</span><span>Created</span><span /></div>
            {runs.map(item => <button className="history-table-row" key={item.id} disabled={!!busy} onClick={() => void perform('Opening saved run', () => loadRun(item.id))}>
              <span className="history-title">{item.replay ? <RotateCcw size={16} /> : item.parent_id ? <GitBranch size={16} /> : <Workflow size={16} />}<span>{item.title}<small>{shortId(item.id)} · {item.replay ? 'Replay' : item.parent_id ? 'Branch' : 'Original'}</small></span></span>
              <span>{modeName(item.mode)}</span><span><OutcomeBadge run={item} /></span><span>{timeOf(item.created_at)}</span><ArrowRight size={15} />
            </button>)}
          </div>
        </section> : <>
          <section className="run-toolbar" aria-label="Scenario controls">
            <div className="scenario-select"><span className="scenario-icon">{selectedCoding ? <FileCode2 size={18} /> : <FlaskConical size={18} />}</span><div><label htmlFor="scenario">SCENARIO FOR NEXT RUN</label>
              <div className="select-line"><select id="scenario" value={selectedScenario} onChange={e => setSelectedScenario(e.target.value)} disabled={!!busy}>
                {(['coding', 'retail'] as const).map(domain => <optgroup key={domain} label={domain === 'coding' ? 'Coding agent' : 'Retail agent'}>{scenarios.filter(item => (item.domain || 'retail') === domain).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</optgroup>)}</select><ChevronDown size={14} /></div></div></div>
            <div className="toolbar-actions"><div className="mode-select"><Radio size={14} /><select aria-label="Execution mode" value={runMode} onChange={e => setRunMode(e.target.value)} disabled={!!busy}>
              <option value="deterministic_demo">Deterministic demo</option><option value="live_meta" disabled={!health?.meta.available}>Live Meta{!health?.meta.available ? ' · unavailable' : ''}</option></select><ChevronDown size={12} /></div>
              <button className="button primary" onClick={() => void newRun()} disabled={!!busy || !scenarios.length}><Play size={14} fill="currentColor" /> Run scenario</button></div>
          </section>
          {loading ? <div className="loading-state"><LoaderCircle size={25} className="spin" /><h2>Opening the workspace</h2><p>Loading saved events and verified checkpoints.</p></div> : run ? <>
            <div className="run-context"><span className="run-context-left"><span className="mono">{shortId(run.id)}</span><ChevronRight size={12} />
              <strong className="current-run-title">{task?.title}</strong><span className="run-kind">{run.replay ? 'Tool replay' : run.restart ? 'Checkpoint restart' : run.parent_id ? 'Intervention branch' : 'Original run'}</span><span className="saved-tag"><Check size={12} /> Saved</span></span>
              <div className="run-context-actions">{run.parent_id && <button className="text-button" disabled={!!busy} onClick={() => void perform('Opening original', () => loadRun(run.parent_id!))}><ArrowLeft size={13} /> Parent run</button>}
                <button className="text-button" onClick={() => void replay()} disabled={!!busy}><RotateCcw size={13} /> Replay unchanged</button><a className="text-button" href={'/api/runs/' + run.id + '/export'} download><Download size={13} /> Export</a></div></div>
            <div className="metrics"><div className="outcome-metric"><OutcomeBadge run={run} /><span>{run.replay ? 'Recorded state + observations' : run.outcome.passed + '/' + run.outcome.total + ' checks passed'}</span></div>
              <span><Terminal size={13} />{toolEvents.length} tool calls</span><span><Fingerprint size={13} />{run.checkpoints.length} checkpoints</span><span><Clock3 size={13} />{duration(run.elapsed_ms)}</span><span className="model-count">{run.usage.calls} model calls</span></div>
            <div className="mode-notice"><FlaskConical size={13} /><strong>{run.replay ? 'Recorded playback' : run.restart ? 'Restart without advice' : run.patch ? run.patch.provenance.kind === 'meta_proposal' ? 'Meta proposal' : 'Manual intervention' : run.injected_failure ? 'Injected failure' : modeName(run.mode)}</strong><span>·</span><span>{run.replay ? 'Tools re-executed; agent messages are saved.' : run.restart ? 'Fresh Meta decisions from the checkpoint · no repair advice · original future excluded' : run.mode === 'live_meta' ? 'Fresh Meta continuation · actual model calls recorded' : coding ? 'Scripted actions · real commands · no live model' : 'Deterministic policy · real simulator execution · no live model'}</span></div>
            {!!run.model_calls.length && <details className="run-model-roles"><summary><Sparkles size={13} />Recorded model roles and usage<ChevronDown size={12} /></summary><div>{run.model_calls.map((call, index) => <p key={call.id || index}><strong>{call.role || (coding ? 'coding_agent' : 'retail_agent')}</strong><span>{call.provider || 'Meta'} · {call.model} · {call.status}</span><span>{duration(call.latency_ms)} · {call.usage?.total_tokens == null ? 'tokens unknown' : call.usage.total_tokens + ' tokens'} · cost {call.cost_usd == null ? 'unknown' : '$' + call.cost_usd.toFixed(5)}</span></p>)}</div></details>}
            {coding && !run.replay && <div className="meta-repair-banner"><div><strong><Sparkles size={15} />Meta-assisted recovery</strong><p>Analyze the recorded execution, select a checkpoint, and review a proposed correction before testing it.</p></div><div className="meta-repair-banner-actions"><button className="text-button" disabled={!!busy} onClick={() => setWorkspaceMode('repair')}>Saved proposals ({proposalHistory.length})</button><button className="button primary" onClick={() => void askMeta()} disabled={!!busy || !health?.meta.available || !run.checkpoints.length}><Sparkles size={14} />Analyze with Meta<span className="small-tag">LIVE</span></button></div></div>}
            {run.error && <div className="alert error-alert run-error"><XCircle size={18} /><div><strong>Execution could not complete</strong><p>{run.error}</p></div></div>}
            <div className="workspace-grid">
              <section className="panel timeline-panel" data-expanded={traceExpanded}><div className="panel-header"><h2><Workflow size={16} />Execution</h2><span className="panel-count">{toolEvents.length} actions</span><button className="mobile-trace-toggle" aria-label="Execution actions" aria-expanded={traceExpanded} aria-controls="timeline-actions" onClick={() => setTraceExpanded(!traceExpanded)}><Workflow size={16} /><strong>{selectedEvent?.tool || 'Execution'}</strong><span>{toolEvents.length} actions</span><ChevronDown size={14} /></button></div>
                <div className="timeline-caption">Select an action to rewind</div>
                <div className="timeline" id="timeline-actions" ref={timeline}>{run.events.map(event => <EventCard key={event.id} event={event} coding={coding} disabled={!!busy} selected={event.checkpoint_id === checkpointId && !!checkpointId}
                  onSelect={() => { setCheckpointId(event.checkpoint_id || null); setInspectorTab(event.tool === 'run_tests' || event.tool === 'read_file' ? 'result' : 'intervene'); setWorkspaceMode('inspect'); setTraceExpanded(false); }} />)}</div>
                <div className="timeline-footer"><ShieldCheck size={13} /><span>{coding ? 'Isolated coding fixture' : 'Pinned retail simulator'}</span></div>
              </section>
              <div className="workbench-main">
                <div className="workspace-tabs" role="tablist" onKeyDown={navigateTabs} aria-label="Workspace views"><button role="tab" id="workspace-inspect" aria-controls="workspace-panel" tabIndex={workspaceMode === 'inspect' ? 0 : -1} aria-selected={workspaceMode === 'inspect'} onClick={() => setWorkspaceMode('inspect')}><FileCode2 size={15} />Inspect</button><button role="tab" id="workspace-results" aria-controls="workspace-panel" tabIndex={workspaceMode === 'results' ? 0 : -1} aria-selected={workspaceMode === 'results'} onClick={() => setWorkspaceMode('results')}>{run.parent_id && !run.replay ? <GitBranch size={15} /> : <ShieldCheck size={15} />}{run.parent_id && !run.replay ? 'Compare' : 'Results'}<span className={'tab-counter ' + (run.outcome.status === 'passed_checks' ? 'passed' : '')}>{run.replay ? 'Replay' : run.outcome.passed + '/' + run.outcome.total}</span></button>{coding && !run.replay && <button role="tab" id="workspace-repair" aria-controls="workspace-panel" tabIndex={workspaceMode === 'repair' ? 0 : -1} aria-selected={workspaceMode === 'repair'} onClick={() => setWorkspaceMode('repair')}><Sparkles size={15} />Meta repair{proposalHistory.length > 0 && <span className="tab-counter neutral">{proposalHistory.length}</span>}</button>}<span className="workbench-caption">{coding ? 'date-parser / JavaScript' : 'retail / tau2'}</span></div>
                {workspaceMode === 'repair' && coding ? <RepairReview run={run} proposal={selectedProposal} checkpoint={checkpoint} history={proposalHistory} busy={!!busy} historyError={proposalHistoryError} draftMatches={proposalDraftMatches} liveBudget={health?.meta.max_calls || 0}
                  onSelect={next => void perform('Opening Meta proposal', async () => { await reviewProposal(next); setWorkspaceMode('repair'); })}
                  onEdit={next => void perform('Restoring proposal draft', () => reviewProposal(next))} onExecute={() => void fork()} onRestart={() => void restartWithoutAdvice()}
                  onEvidence={id => { const event = run.events.find(item => item.id === id); if (event?.checkpoint_id) { setCheckpointId(event.checkpoint_id); setInspectorTab('result'); setWorkspaceMode('inspect'); } }} /> : workspaceMode === 'inspect' ? <>
              <section className="panel inspector-panel" id="workspace-panel" role="tabpanel" aria-labelledby="workspace-inspect"><div className="panel-header"><h2><Fingerprint size={17} />{checkpoint ? <>Checkpoint {String(ownBoundary?.step || 1).padStart(2, '0')}<span className="badge green verified" title="Snapshot integrity verified before tool execution"><ShieldCheck size={11} />Verified</span></> : 'Inspector'}</h2>
                <div className="inspector-header-actions"><button className="button primary fork-button" onClick={() => void fork()} disabled={!checkpoint || checkpoint.id !== checkpointId || !!busy || !!editorError}><GitBranch size={14} /> Fork & execute</button>
                <button className="icon-button hash-copy" aria-label="Copy snapshot hash" title={checkpoint ? 'Snapshot SHA-256: ' + checkpoint.sha256 : 'Snapshot unavailable'} disabled={!checkpoint} onClick={() => checkpoint && void navigator.clipboard.writeText(checkpoint.sha256).then(() => setToast('Snapshot hash copied.')).catch(() => setError('Clipboard unavailable; export the checkpoint to inspect its hash.'))}><Copy size={14} /></button>
                <button className="icon-button" aria-label="Export selected checkpoint" disabled={!checkpoint} onClick={() => checkpoint && download(checkpoint.id + '.json', checkpoint)}><Download size={16} /></button></div></div>
                {checkpointError ? <div className="inspector-empty"><XCircle size={26} className="text-red" /><h3>Checkpoint unavailable</h3><p role="alert">{checkpointError}</p><button className="button primary" onClick={() => void newRun()} disabled={!!busy}>Record a fresh run</button></div> :
                  !checkpoint ? <div className="inspector-empty">{checkpointId ? <LoaderCircle size={25} className="spin" /> : <Fingerprint size={28} />}
                    <h3>{checkpointId ? 'Restoring checkpoint' : 'Pick a point in time'}</h3><p>{run.replay ? 'This is a tool replay. Open its parent run to fork a decision.' : 'Select a tool call in the timeline to inspect its state and create an intervention.'}</p></div> : <>
                    <div className="inspector-tabs" role="tablist" onKeyDown={navigateTabs} aria-label="Checkpoint details">{[['intervene', 'Intervene', GitBranch], ['result', 'Result', Terminal], ['state', 'State', Database], ['context', 'Context', MessageSquare]].map(([id, label, Icon]) =>
                      <button key={String(id)} role="tab" tabIndex={inspectorTab === id ? 0 : -1} aria-selected={inspectorTab === id} className={inspectorTab === id ? 'active' : ''} onClick={() => setInspectorTab(String(id))}>
                        {typeof Icon !== 'string' && <Icon size={13} />}{String(label)}</button>)}</div>
                    {inspectorTab === 'intervene' ? <div className="intervention-content">
                      <div className="section-title"><span>BEFORE EXECUTION · EDIT THE PENDING ACTION</span><span className={'badge ' + (proposal ? 'purple' : 'neutral')}>{proposal ? <Sparkles size={10} /> : <Braces size={10} />}{proposal ? 'Meta proposal' : changed ? 'Manual draft' : 'Recorded action'}</span></div>
                      <div className="edit-toolbar"><label className="field-label" htmlFor="tool">Tool</label><div className="tool-select"><Terminal size={13} /><select id="tool" value={tool} onChange={e => {
                        setTool(e.target.value); setProposal(null);
                        if (e.target.value === checkpoint.payload.pending_action.tool) setArgumentsText(pretty(checkpoint.payload.pending_action.arguments));
                        else setArgumentsText('{}');
                      }} disabled={!!busy}>{checkpoint.payload.tools.map(t => <option key={t.function.name}>{t.function.name}</option>)}</select><ChevronDown size={12} /></div>
                      {sourceEditor && <><label className="sr-only" htmlFor="source-path">File path</label><input id="source-path" className="source-path" aria-label="File path" value={sourcePath} onChange={e => updateArgument('path', e.target.value)} disabled={!!busy || !!editorError} spellCheck={false} /><button className="text-button source-reset" onClick={() => { setTool(checkpoint.payload.pending_action.tool); setArgumentsText(pretty(checkpoint.payload.pending_action.arguments)); setProposal(null); }} disabled={!!busy}>Reset patch</button></>}
                      </div>
                      {sourceEditor ? <>
                        <div className="editor-filebar"><span><FileCode2 size={13} />{sourcePath || 'Choose a file path'}</span><span>Replacement source · {sourceContent.split('\n').length} lines</span></div>
                        <div className="source-editor-height"><SourceEditor key={checkpoint.id + ':' + sourcePath} value={sourceContent} onChange={value => updateArgument('content', value)} theme={theme} readOnly={!!busy || !!editorError} /></div>
                        <details className="raw-arguments" open={!!editorError}><summary><Braces size={13} />Tool arguments JSON<ChevronDown size={12} /></summary>{argumentsEditor}</details>
                        {'files' in checkpoint.payload.environment && sourcePath in checkpoint.payload.environment.files && <details className="state-section source-before"><summary><FileCode2 size={13} />Source before this action<ChevronDown size={12} /></summary><pre>{checkpoint.payload.environment.files[sourcePath]}</pre></details>}
                      </> : argumentsEditor}
                      {editorError ? <p className="editor-error">{editorError}</p> : <div className="editor-status"><span className={'tiny-dot ' + (changed ? 'green-dot' : '')} />{changed ? 'Intervention ready · action changed' : 'Edit an argument to explore an alternative'}</div>}
                      <details className="intervention-options"><summary><Settings2 size={14} />Continuation & guidance<ChevronDown size={12} /></summary><div className="options-content"><details className="hint"><summary><CircleHelp size={13} /> Need a starting point?<ChevronDown size={12} /></summary><p>{task?.hint}</p><p className="muted">Injected fault: {task?.injected_failure}</p></details>
                      {proposal && <div className="proposal-note"><Sparkles size={14} /><div><strong>Review Meta’s proposal</strong><p>{proposal.explanation}</p><small>The separate proposer saw the full failed trace. The continuing agent receives only checkpoint context.</small></div></div>}
                      <div className="continuation-field"><label className="field-label" htmlFor="continuation">Continue with</label><select id="continuation" value={continuation} onChange={e => setContinuation(e.target.value)} disabled={!!busy || !!proposal}>
                        <option value="deterministic_demo" disabled={checkpoint.payload.agent_config.kind === 'live_meta'}>Deterministic demo policy</option>
                        <option value="live_meta" disabled={!health?.meta.available}>Fresh Meta calls{!health?.meta.available ? ' · unavailable' : ''}</option></select></div>
                      <button className="button secondary meta-button" onClick={() => void askMeta()} disabled={!!busy || !health?.meta.available}><Sparkles size={14} /> Ask Meta for a patch<span className="small-tag">{health?.meta.available ? 'LIVE' : 'UNAVAILABLE'}</span></button>
                      {!health?.meta.available && <button className="text-button configure-link" onClick={openGuide}>Configure Meta access<ArrowUpRight size={11} /></button>}
                      <div className="fork-contract"><Layers3 size={15} /><div><strong>One change. An isolated branch.</strong><p>{checkpoint.payload.conversation.length} prior messages restored. Original future excluded. Parent run preserved.</p></div></div></div></details>
                    </div> : inspectorTab === 'result' ? <div className="result-content">
                      <div className="observation-heading"><Terminal size={18} /><div><h3>Recorded tool result</h3><p>{selectedCommand ? 'Actual output from the recorded command.' : selectedEvent?.observation?.ok ? 'The tool completed successfully.' : 'Inspect the original tool response.'}</p></div></div>
                      {selectedCommand ? <ConsoleOutput result={selectedCommand} /> : observedSource !== null ? <div className="source-editor-height"><SourceEditor value={observedSource} onChange={() => {}} theme={theme} readOnly /></div> : <pre className="observation-json">{pretty(selectedEvent?.observation || {})}</pre>}
                      <p className="inspector-description">This result happened after the checkpoint. It is visible here for inspection and excluded from restored context.</p>
                    </div> : inspectorTab === 'state' ? <SnapshotState checkpoint={checkpoint} /> : <div className="context-content"><p className="inspector-description">Exactly the conversation restored at this boundary. Later events are excluded.</p>
                      {checkpoint.payload.conversation.map((message, index) => <details className="context-message" key={index}><summary><span className="mono">{String(index + 1).padStart(2, '0')}</span><strong>{message.role}</strong><ChevronDown size={12} /></summary>
                        <pre>{message.content || pretty(message.tool_calls)}</pre></details>)}
                    </div>}
                  </>}
              </section>
                </> : <section className="panel results-panel" id="workspace-panel" role="tabpanel" aria-labelledby="workspace-results">
                  <div className="panel-header"><h2>{comparison ? <GitBranch size={16} /> : <ShieldCheck size={16} />}{comparison ? 'Compare the timelines' : run.replay ? 'Replay verification' : 'Outcome checks'}</h2>
                    {comparison?.original_unchanged && <span className="preserved"><ShieldCheck size={13} />Parent verified unchanged</span>}</div>
                  {run.replay ? <div className="replay-result"><RotateCcw size={24} /><div><h3>{run.replay.status === 'matched' ? 'The recorded tool sequence reproduced its observations and state.' : 'The recorded tool sequence did not reproduce the original.'}</h3>
                    <p>Observation match: {String(run.replay.observations_match)} · Final state match: {String(run.replay.state_match)} · Recorded tool errors: {run.replay.tool_errors}</p><p>Task success is not evaluated by this replay. Displayed agent messages are saved playback.</p><p>This is a tool replay. Open its parent run to fork a decision.</p></div></div> : <>
                    {comparison && <div className="comparison-summary"><div className="comparison-card"><span className="eyebrow">ORIGINAL · {shortId(comparison.parent_id)}</span><OutcomeBadge run={{ outcome: comparison.parent_outcome, replay: null, execution: 'completed' }} /><span>{comparison.parent_outcome.passed}/{comparison.parent_outcome.total} checks · {duration(comparison.parent_elapsed_ms)} · {comparison.parent_usage.calls} model calls</span><small>{measuredUsage(comparison.parent_usage)}</small></div>
                      <span className="comparison-arrow"><ArrowRight size={20} /></span><div className="comparison-card branch-card"><span className="eyebrow">ALTERNATIVE · {shortId(run.id)}</span><OutcomeBadge run={run} /><span>{run.outcome.passed}/{run.outcome.total} checks · {duration(comparison.branch_elapsed_ms)} · {comparison.branch_usage.calls} model calls</span><small>{measuredUsage(comparison.branch_usage)}</small></div></div>}
                    {run.restart && <div className="patch-summary"><RotateCcw size={14} /><span>Checkpoint restart without advice · fresh Meta decisions · no proposed patch supplied</span></div>}
                    {run.patch && <div className="patch-summary"><GitBranch size={14} /><span>{run.patch.provenance.kind === 'meta_proposal' ? 'Reviewed Meta proposal' : 'Manual intervention'} · {modeName(run.patch.continuation)}</span><code>{run.patch.after.tool}</code></div>}
                    {coding && <div className="evidence-tabs" role="tablist" onKeyDown={navigateTabs} aria-label="Evaluation evidence">{[['patch', 'Code changes', FileCode2], ['checks', 'Test results', ShieldCheck], ['output', 'Command output', Terminal]].map(([id, label, Icon]) => <button key={String(id)} role="tab" tabIndex={evidenceTab === id ? 0 : -1} aria-selected={evidenceTab === id} onClick={() => setEvidenceTab(String(id))}>{typeof Icon !== 'string' && <Icon size={14} />}{String(label)}</button>)}</div>}
                    <div className="evidence-content">
                    {coding ? evidenceTab === 'patch' ? comparison ? <>
                      <div className="code-comparison"><section><h3>Original patch<span>Against the initial fixture</span></h3><FileChanges changes={comparison.parent_file_diffs || []} empty="The original run made no file changes." /></section><section><h3>Alternative patch<span>Against the initial fixture</span></h3><FileChanges changes={comparison.branch_file_diffs || run.file_diffs || []} empty="This branch made no file changes." /></section></div>
                      {!!comparison.file_diffs?.length && <details className="branch-difference"><summary><GitBranch size={15} />Changes from original to alternative<ChevronDown size={13} /></summary><FileChanges changes={comparison.file_diffs} /></details>}
                    </> : <div className="run-file-changes"><h3>Recorded file changes</h3><FileChanges changes={run.file_diffs || []} /></div> : evidenceTab === 'checks' ? <>
                      {run.verification?.tamper_detected && <div className="alert error-alert"><ShieldCheck size={18} /><strong>Tampering detected</strong><span>The candidate changed the frozen visible tests.</span></div>}
                      {comparison ? <div className="comparison-checks"><div><h3>Parent checks</h3><CheckList outcome={comparison.parent_outcome} collapsePassedRegressions /></div><div><h3>Branch checks</h3><CheckList outcome={run.outcome} collapsePassedRegressions /></div></div> : <CheckList outcome={run.outcome} collapsePassedRegressions />}
                    </> : comparison ? <div className="verification-comparison">{comparison.parent_verification && <VerificationEvidence verification={comparison.parent_verification} title="Original verification" />}{(comparison.branch_verification || run.verification) && <VerificationEvidence verification={(comparison.branch_verification || run.verification)!} title="Alternative verification" />}</div> : run.verification && <VerificationEvidence verification={run.verification} /> : comparison ? <>
                      <div className="comparison-checks"><div><h3>Parent checks</h3><CheckList outcome={comparison.parent_outcome} /></div><div><h3>Branch checks</h3><CheckList outcome={run.outcome} /></div></div><div className="result-section-heading"><h3><Database size={14} />Final state differences</h3><span>{comparison.state_diff.length} changed paths</span></div><DiffTable changes={comparison.state_diff} />
                    </> : <CheckList outcome={run.outcome} />}
                    </div>
                  </>}
                  <div className="results-footer"><ShieldCheck size={13} /><span>{comparison ? comparison.scope : run.outcome.scope}</span><button className="text-button" onClick={openGuide}>About the checks<ArrowUpRight size={11} /></button></div>
                </section>}
              </div>
            </div>
          </> : <div className="loading-state"><Workflow size={32} /><h2>Your first timeline starts here.</h2><p>Choose a scenario and run the deterministic demo.</p><button className="button primary" onClick={() => void newRun()}>Run scenario<Play size={14} /></button></div>}
        </>}
      </main>
    </div>
    {toast && <div className="toast" role="status"><CheckCircle2 size={17} /><span>{toast}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={14} /></button></div>}
    <input className="sr-only" type="file" accept=".json,application/json" ref={importInput} aria-label="Import checkpoint for validation" onChange={e => { const file = e.target.files?.[0]; if (file) void importCheckpoint(file); e.target.value = ''; }} />
    {guide && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setGuide(false); }}><section ref={guideDialog} className="guide-modal" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <div className="modal-header"><Mark /><span className="eyebrow">A SMALL GUIDE TO OTHER POSSIBILITIES</span><button className="icon-button" onClick={() => setGuide(false)} aria-label="Close guide" autoFocus><X size={20} /></button></div>
      <h2 id="guide-title">What if the agent<br />chose differently?</h2><p className="guide-intro">Choose a checkpoint, change the pending action, and execute a separate timeline. The original stays inspectable.</p>
      <ol className="guide-steps"><li><span>01</span><div><strong>Record a run</strong><p>{coding ? 'The deterministic coding demo executes a scripted patch and real test commands in a local fixture.' : 'The deterministic demo injects a known error into real simulator tool calls.'}</p></div></li>
        <li><span>02</span><div><strong>Rewind a decision</strong><p>{coding ? 'Select a write_file action. Inspect the source and the recorded command output before changing the patch.' : 'Select the last tool call. Compare its arguments with the customer’s request.'}</p></div></li>
        <li><span>03</span><div><strong>Change one thing</strong><p>{coding ? 'Edit the replacement source and select Fork & execute. Compare the original and alternative patches, tests, and protected checks.' : 'Edit the argument and select Fork & execute. Inspect the state differences and task checks.'}</p></div></li></ol>
      <div className="guide-section"><h3><Radio size={15} /> Execution modes</h3><p><strong>Saved playback</strong> displays recorded events. <strong>Unchanged replay</strong> executes every recorded tool again and compares outputs. <strong>Intervention</strong> restores a checkpoint and computes a new continuation.</p></div>
      <div className="guide-section model-config"><h3><Sparkles size={15} /> Meta connection<span className={'badge ' + (health?.meta.available ? 'green' : 'neutral')}>{health?.meta.available ? 'Configured' : 'Offline'}</span></h3>
        <p>{health?.meta.available ? 'Live requests are enabled for the configured model. Inspect a live run for its actual model calls and verified results. Each action is bounded by the configured allowance.' : 'The full manual demo works offline. To use Meta, configure these server environment values and restart:'}</p>
        <code>MODEL_API_KEY · META_MODEL · ATM_LIVE_MAX_CALLS</code>
        {health?.meta.blockers.map(blocker => <p className="config-blocker" key={blocker}><Circle size={8} />{blocker}</p>)}
        <p className="muted">Current ledger: {health?.model_ledger.calls || 0} attempted calls. Monetary cost: {health?.model_ledger.cost_usd == null ? 'unknown / not applicable' : '$' + health.model_ledger.cost_usd.toFixed(5)}. Keys stay on the server.</p>
        <a className="text-button" href="https://dev.meta.ai/docs/cookbook/quickstart-chat-completions" target="_blank" rel="noreferrer">Official Meta API setup<ArrowUpRight size={12} /></a></div>
      <div className="guide-section"><h3><ShieldCheck size={15} /> What the checks establish</h3><p>{coding ? 'Protected verification checks the reported bug, regression behavior, and changes to protected files. The evidence includes actual command output and the requirements and evaluator hashes. Passing visible tests alone does not establish success. These fixture results are not a general coding benchmark or evidence of live model recovery gains.' : 'Implemented checks cover task state, required communication, authentication, and the custom upfront-consent contract. The complete retail dialogue policy is not evaluated. These synthetic tasks are not an official tau2 score or evidence of live model recovery gains.'}</p></div>
      <div className="modal-footer"><button className="button secondary" onClick={() => { setGuide(false); importInput.current?.click(); }}><Upload size={14} /> Validate checkpoint file</button><button className="button primary" onClick={() => setGuide(false)}>Explore a timeline<ArrowRight size={14} /></button></div>
    </section></div>}
  </div>;
}

