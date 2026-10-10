import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Annotation, Compartment, EditorState, Transaction, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import { bracketMatching, defaultHighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { sql } from '@codemirror/lang-sql';
import { Redo2, Undo2 } from 'lucide-react';
import { type CodeDraft, codeLanguages, maxCodeLength } from '../code-drafts';
import './code-editor.css';

const externalChange = Annotation.define<boolean>();

function languageExtensions(language: CodeDraft['language']): Extension {
  const spaces = language === 'python' ? 4 : 2;
  const support = language === 'python' ? python()
    : language === 'javascript' ? javascript()
      : language === 'typescript' ? javascript({ typescript: true })
        : language === 'sql' ? sql() : [];
  return [support, indentUnit.of(' '.repeat(spaces)), EditorState.tabSize.of(spaces)];
}

const editorTheme = EditorView.theme({
  '&': { backgroundColor: '#fff', color: '#202126', fontSize: '13px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: "'Cascadia Code', Consolas, 'SFMono-Regular', monospace", lineHeight: '1.75', overflow: 'auto' },
  '.cm-content': { minHeight: '220px', padding: '12px 0', caretColor: '#006ce8' },
  '.cm-line': { padding: '0 14px' },
  '.cm-gutters': { backgroundColor: '#f8f9fb', color: '#747986', borderRight: '1px solid #e7e8ed' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '36px', padding: '0 9px 0 7px' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#f5f8fc' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#006ce8' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: '#dceafe' },
  '.cm-matchingBracket': { backgroundColor: '#e6effc', outline: '1px solid #c4d7f3' },
  '.cm-placeholder': { color: '#777d89' },
});

export default function CodeEditor({ value, onChange, disabled = false, graded = false }: {
  value: CodeDraft;
  onChange: (value: CodeDraft) => void;
  disabled?: boolean;
  graded?: boolean;
}) {
  const id = useId();
  const helpId = id + '-help';
  const errorId = id + '-error';
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const current = useRef({ value, onChange, disabled });
  current.current = { value, onChange, disabled };
  const compartments = useMemo(() => ({ language: new Compartment(), editing: new Compartment() }), []);
  const applied = useRef({ language: value.language, disabled });
  const [limitReached, setLimitReached] = useState(false);
  const [historyAvailable, setHistoryAvailable] = useState({ undo: false, redo: false });

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const initial = current.current;
    applied.current = { language: initial.value.language, disabled: initial.disabled };
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initial.value.source.slice(0, maxCodeLength),
        extensions: [
          lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), drawSelection(),
          history(), indentOnInput(), bracketMatching(), syntaxHighlighting(defaultHighlightStyle),
          keymap.of([
            indentWithTab,
            { key: 'Escape', run: editor => { editor.setTabFocusMode(2000); return false; } },
            { key: 'Mod-Shift-z', run: redo, preventDefault: true },
            ...defaultKeymap, ...historyKeymap,
          ]), editorTheme,
          placeholder('Напишите код или псевдокод…'),
          compartments.language.of(languageExtensions(initial.value.language)),
          compartments.editing.of([EditorState.readOnly.of(initial.disabled), EditorView.editable.of(!initial.disabled)]),
          EditorView.contentAttributes.of(editor => ({
            role: 'textbox', 'aria-label': 'Черновик кода', 'aria-multiline': 'true',
            'aria-describedby': helpId + ' ' + errorId, 'aria-readonly': String(editor.state.readOnly),
            tabindex: '0', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off',
          })),
          EditorState.transactionFilter.of(transaction => {
            if (transaction.docChanged && transaction.newDoc.length > maxCodeLength) {
              setLimitReached(true);
              return [];
            }
            return transaction;
          }),
          EditorView.updateListener.of(update => {
            const available = { undo: undoDepth(update.state) > 0, redo: redoDepth(update.state) > 0 };
            setHistoryAvailable(previous => previous.undo === available.undo && previous.redo === available.redo ? previous : available);
            if (!update.docChanged) return;
            setLimitReached(false);
            if (update.transactions.some(transaction => transaction.annotation(externalChange))) return;
            const latest = current.current;
            latest.onChange({ language: latest.value.language, source: update.state.doc.toString() });
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      if (viewRef.current === view) viewRef.current = null;
      view.destroy();
    };
  }, [compartments, helpId, errorId]);

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const effects = [];
    if (applied.current.language !== value.language) effects.push(compartments.language.reconfigure(languageExtensions(value.language)));
    if (applied.current.disabled !== disabled) effects.push(compartments.editing.reconfigure([
      EditorState.readOnly.of(disabled), EditorView.editable.of(!disabled),
    ]));
    const source = value.source.slice(0, maxCodeLength);
    const changed = source !== view.state.doc.toString();
    if (changed || effects.length) view.dispatch({
      ...(changed ? { changes: { from: 0, to: view.state.doc.length, insert: source } } : {}),
      effects, annotations: [externalChange.of(true), Transaction.addToHistory.of(false)],
    });
    applied.current = { language: value.language, disabled };
  }, [value.language, value.source, disabled, compartments]);

  function changeLanguage(language: string) {
    const selected = codeLanguages.find(item => item.value === language);
    if (!selected || disabled) return;
    onChange({ language: selected.value, source: viewRef.current?.state.doc.toString() ?? value.source });
  }

  function changeHistory(command: typeof undo) {
    const view = viewRef.current;
    if (!view || disabled) return;
    command(view);
    view.focus();
  }

  return <div className={'code-editor' + (disabled ? ' code-editor-readonly' : '')}>
    <div className="code-editor-toolbar">
      <span className="code-editor-note">{graded ? 'Входит в ответ' : 'Не оценивается'}</span>
      <div className="code-editor-controls">
        <label className="code-editor-language" htmlFor={id + '-language'}><span>Язык</span>
          <select id={id + '-language'} aria-label="Язык кода" value={value.language} disabled={disabled} onChange={event => changeLanguage(event.target.value)}>
            {codeLanguages.map(language => <option key={language.value} value={language.value}>{language.label}</option>)}
          </select>
        </label>
        <div className="code-editor-history">
          <button type="button" aria-label="Отменить изменение кода" title="Отменить (Ctrl+Z)" disabled={disabled || !historyAvailable.undo} onClick={() => changeHistory(undo)}><Undo2 size={16} aria-hidden="true" /></button>
          <button type="button" aria-label="Повторить изменение кода" title="Повторить (Ctrl+Shift+Z)" disabled={disabled || !historyAvailable.redo} onClick={() => changeHistory(redo)}><Redo2 size={16} aria-hidden="true" /></button>
        </div>
      </div>
    </div>
    <div className="code-editor-surface" ref={hostRef} />
    <div className="code-editor-footer">
      <p className="code-editor-help" id={helpId}>Tab — отступ, Shift+Tab — убрать отступ. Для выхода из редактора нажмите Escape, затем Tab.</p>
      <span className="code-editor-count">{value.source.length}/{maxCodeLength}</span>
    </div>
    <p className="code-editor-error" id={errorId} role="alert" hidden={!limitReached}>Не удалось вставить код: максимум {maxCodeLength} символов.</p>
  </div>;
}
