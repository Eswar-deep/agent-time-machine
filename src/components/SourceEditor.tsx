import { useLayoutEffect, useRef } from 'react';
import { basicSetup, EditorView } from 'codemirror';
import { Annotation, Compartment, EditorSelection, EditorState, Prec, Transaction } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import './SourceEditor.css';

export type SourceEditorProps = {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  theme?: 'light' | 'dark';
};

// Prop synchronization is distinct from editing so it cannot trigger an
// onChange loop or add a synthetic step to the user's undo history.
const externalChange = Annotation.define<boolean>();
const normalizeLines = (value: string) => value.replace(/\r\n?/g, '\n');

const editorLayout = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': {
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    fontSize: '13px',
    lineHeight: '1.7',
    overflow: 'auto',
  },
  '.cm-content': { padding: '14px 0', minHeight: '100%' },
  '.cm-line': { padding: '0 16px' },
  '.cm-gutters': { borderRight: '1px solid transparent' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 14px', minWidth: '38px' },
});

const lightTheme = EditorView.theme({
  '&': { color: '#293242', backgroundColor: '#ffffff' },
  '.cm-content': { caretColor: '#6250d5' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#6250d5' },
  '.cm-gutters': { backgroundColor: '#fbfbfe', color: '#9298a7', borderRightColor: '#edf0f5' },
  '.cm-activeLineGutter': { backgroundColor: '#efedf9', color: '#6653be' },
  '.cm-activeLine': { backgroundColor: '#f7f6fd' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: '#ddd7fa' },
  '.cm-selectionMatch': { backgroundColor: '#eee9ff' },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: '#e4ddff', outline: '1px solid #b5a6ee' },
  '.cm-searchMatch': { backgroundColor: '#fbedb7', outline: '1px solid #e0c66a' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#f4d979' },
  '.cm-panels': { backgroundColor: '#f7f7fc', color: '#45475c' },
  '.cm-tooltip': { backgroundColor: '#ffffff', borderColor: '#dedfeb', color: '#343447' },
}, { dark: false });

const accessExtensions = (readOnly: boolean) => [
  EditorState.readOnly.of(readOnly),
  EditorView.editable.of(!readOnly),
  EditorView.contentAttributes.of({
    role: 'textbox',
    'aria-label': 'Source content',
    'aria-multiline': 'true',
    'aria-readonly': String(readOnly),
    spellcheck: 'false',
    autocorrect: 'off',
    autocapitalize: 'off',
    tabindex: '0',
  }),
];

export default function SourceEditor({ value, onChange, readOnly = false, theme = 'light' }: SourceEditorProps) {
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const callback = useRef(onChange);
  const initial = useRef({ value, readOnly, theme });
  const access = useRef(new Compartment());
  const appearance = useRef(new Compartment());

  useLayoutEffect(() => { callback.current = onChange; }, [onChange]);

  useLayoutEffect(() => {
    if (!container.current) return;
    const view = new EditorView({
      parent: container.current,
      state: EditorState.create({
        doc: normalizeLines(initial.current.value),
        extensions: [
          basicSetup,
          javascript(),
          EditorState.tabSize.of(2),
          editorLayout,
          appearance.current.of(initial.current.theme === 'dark' ? oneDark : lightTheme),
          access.current.of(accessExtensions(initial.current.readOnly)),
          Prec.highest(EditorView.domEventHandlers({
            keydown(event) {
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                return true;
              }
              return false;
            },
          })),
          EditorView.updateListener.of(update => {
            if (update.docChanged && !update.transactions.some(transaction => transaction.annotation(externalChange))) {
              callback.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    editor.current = view;
    return () => {
      editor.current = null;
      view.destroy();
    };
  }, []);

  useLayoutEffect(() => {
    const view = editor.current;
    if (!view) return;
    const next = normalizeLines(value);
    const current = view.state.doc.toString();
    if (next === current) return;

    // Replace only the changed span. Keep all selections, their direction, and
    // their position within a replacement instead of resetting the editor.
    let from = 0;
    while (from < current.length && from < next.length && current[from] === next[from]) from++;
    let oldEnd = current.length;
    let newEnd = next.length;
    while (oldEnd > from && newEnd > from && current[oldEnd - 1] === next[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
    const insert = next.slice(from, newEnd);
    const delta = insert.length - (oldEnd - from);
    const mapPosition = (position: number) => position <= from ? position : position >= oldEnd ? position + delta :
      from + Math.min(position - from, insert.length);
    const selection = EditorSelection.create(view.state.selection.ranges.map(range =>
      EditorSelection.range(mapPosition(range.anchor), mapPosition(range.head))), view.state.selection.mainIndex);
    const { scrollTop, scrollLeft } = view.scrollDOM;
    view.dispatch({
      changes: { from, to: oldEnd, insert },
      selection,
      annotations: [externalChange.of(true), Transaction.addToHistory.of(false)],
    });
    view.scrollDOM.scrollTop = scrollTop;
    view.scrollDOM.scrollLeft = scrollLeft;
  }, [value]);

  useLayoutEffect(() => {
    editor.current?.dispatch({ effects: access.current.reconfigure(accessExtensions(readOnly)) });
  }, [readOnly]);

  useLayoutEffect(() => {
    editor.current?.dispatch({ effects: appearance.current.reconfigure(theme === 'dark' ? oneDark : lightTheme) });
  }, [theme]);

  return <div className="atm-source-editor" data-theme={theme} data-readonly={readOnly ? 'true' : 'false'} ref={container} />;
}
