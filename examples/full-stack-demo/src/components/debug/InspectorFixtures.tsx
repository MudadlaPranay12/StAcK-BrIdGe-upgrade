import { useState } from 'react';
import { Modal } from '../ui/Overlay';

const LIST_ITEMS = ['Alpha line item', 'Beta line item', 'Gamma line item'];

const RUNTIME_HTML =
  '<strong>Runtime-injected markup</strong><p>This node is produced by dangerouslySetInnerHTML, so it has no JSX source and the inspector should report it as unmapped.</p>';

/**
 * Curated inspection targets for the StackBridge DOM inspector.
 *
 * Each fixture deliberately exercises one identification path in the Vite
 * plugin: static className, static text child, static string props, dynamic
 * expressions (which should fall back cleanly), repeated nodes, overlays, and a
 * node that genuinely has no source location.
 */
export function InspectorFixtures() {
  const [count, setCount] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [choice, setChoice] = useState('standard');
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <section className="stack stack--gap" aria-labelledby="fixtures-title" data-fixture-section>
      <div className="page-header">
        <div className="page-header-main">
          <span className="page-eyebrow">Manual test fixtures</span>
          <h2 className="page-title" id="fixtures-title">
            Inspector test fixtures
          </h2>
          <p className="page-subtitle">
            Every node below exists to exercise one identification path in the inspector: static classes, static
            text, static string props, dynamic expressions, repeated markup, overlays, and one element that has no
            source mapping at all.
          </p>
        </div>
      </div>

      <div className="fixture-grid">
        {/* 1 — static button */}
        <div className="fixture">
          <span className="fixture-label">1 · Static button</span>
          <div className="fixture-stage">
            <button className="btn btn--primary" onClick={() => setCount((value) => value + 1)}>
              Increment counter
            </button>
          </div>
          <span className="fixture-note">Literal className and a single static text child.</span>
        </div>

        {/* 2 — secondary button */}
        <div className="fixture">
          <span className="fixture-label">2 · Secondary button</span>
          <div className="fixture-stage">
            <button className="btn btn--secondary" onClick={() => setCount(0)}>
              Reset counter
            </button>
          </div>
          <span className="fixture-note">Second button variant with its own literal classes.</span>
        </div>

        {/* 3 — icon button */}
        <div className="fixture">
          <span className="fixture-label">3 · Icon-only button</span>
          <div className="fixture-stage">
            <button
              className="icon-button"
              aria-label="Refresh fixture status"
              title="Refresh fixture status"
              onClick={() => setCount((value) => value + 10)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
          </div>
          <span className="fixture-note">Icon child instead of text; aria-label and title are static string props.</span>
        </div>

        {/* 4 — static text */}
        <div className="fixture">
          <span className="fixture-label">4 · Static text</span>
          <div className="fixture-stage">
            <p className="muted">This sentence never changes at runtime.</p>
          </div>
          <span className="fixture-note">Static paragraph: text range and class range are both resolvable.</span>
        </div>

        {/* 5 — dynamic text */}
        <div className="fixture">
          <span className="fixture-label">5 · Dynamic text</span>
          <div className="fixture-stage">
            <p className="muted">Score: {count} · counter is {enabled ? 'enabled' : 'disabled'}</p>
            <button className="btn btn--ghost btn--sm" onClick={() => setEnabled((value) => !value)}>
              Toggle
            </button>
          </div>
          <span className="fixture-note">Interpolated values: class range resolves, text range must not.</span>
        </div>

        {/* 6 — conditional classes */}
        <div className="fixture">
          <span className="fixture-label">6 · Conditional classes</span>
          <div className="fixture-stage">
            <div className={`fixture-note ${enabled ? 'pos' : 'neg'}`} style={{ padding: '6px 10px', border: '1px dashed var(--border-strong)', borderRadius: 8 }}>
              Conditional class binding is currently {enabled ? 'active' : 'inactive'}.
            </div>
          </div>
          <span className="fixture-note">className is an expression: the inspector should fall back rather than map a literal.</span>
        </div>

        {/* 7 — disabled button */}
        <div className="fixture">
          <span className="fixture-label">7 · Disabled button</span>
          <div className="fixture-stage">
            <button className="btn btn--primary" disabled title="Disabled while the fixture is editing">
              Unavailable action
            </button>
            <button className="btn btn--danger" disabled>
              Destructive
            </button>
          </div>
          <span className="fixture-note">Disabled state and a static title prop on two literals.</span>
        </div>

        {/* 8 — labelled input */}
        <div className="fixture">
          <span className="fixture-label">8 · Labelled input</span>
          <div className="fixture-stage" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <label className="field-label" htmlFor="fixture-input">
              Fixture input
            </label>
            <input className="input" id="fixture-input" placeholder="Type to inspect the input element" />
          </div>
          <span className="fixture-note">Label holds static text; the input exposes className and placeholder props.</span>
        </div>

        {/* 9 — select */}
        <div className="fixture">
          <span className="fixture-label">9 · Select control</span>
          <div className="fixture-stage" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <select className="select" value={choice} onChange={(event) => setChoice(event.target.value)} aria-label="Fixture shipping speed">
              <option value="standard">Standard shipping</option>
              <option value="express">Express shipping</option>
              <option value="overnight">Overnight</option>
            </select>
          </div>
          <span className="fixture-note">Multiple children: no text range, but className and aria-label resolve.</span>
        </div>

        {/* 10 — nested card */}
        <div className="fixture">
          <span className="fixture-label">10 · Nested card</span>
          <div className="fixture-stage" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="card">
              <div className="card-header">
                <span className="card-title">Nested header</span>
              </div>
              <div className="card-body">
                <p className="card-subtitle">Body copy inside a nested structure for depth inspection.</p>
              </div>
            </div>
          </div>
          <span className="fixture-note">Three levels of nesting: select any ancestor or descendant.</span>
        </div>

        {/* 11 — repeated list item */}
        <div className="fixture">
          <span className="fixture-label">11 · Repeated list item</span>
          <div className="fixture-stage" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <ul className="nav-list">
              {LIST_ITEMS.map((item) => (
                <li className="nav-item" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <span className="fixture-note">Three siblings generated from one source line: each must map independently.</span>
        </div>

        {/* 12 — modal trigger */}
        <div className="fixture">
          <span className="fixture-label">12 · Overlay trigger</span>
          <div className="fixture-stage">
            <button className="btn btn--secondary" onClick={() => setModalOpen(true)}>
              Open fixture modal
            </button>
          </div>
          <span className="fixture-note">Opens a real modal so the inspector can resolve overlay content.</span>
        </div>

        {/* 13 — runtime-injected markup */}
        <div className="fixture">
          <span className="fixture-label">13 · No source mapping</span>
          <div className="fixture-stage" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="fixture-note" style={{ padding: '10px', background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 8 }} dangerouslySetInnerHTML={{ __html: RUNTIME_HTML }} />
          </div>
          <span className="fixture-note">Injected via dangerouslySetInnerHTML — expected to report no source identity.</span>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Fixture modal"
        subtitle="Overlay content is rendered in place, so its source should still resolve."
        size="sm"
      >
        <div className="stack stack--gap-sm">
          <p className="muted">Inspect any node inside this dialog: it carries the same source identity as its definition.</p>
          <button className="btn btn--primary" onClick={() => setModalOpen(false)}>
            Close from inside
          </button>
        </div>
      </Modal>
    </section>
  );
}
