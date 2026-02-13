import React, { useRef, useState, useCallback } from 'react';

/**
 * Field shape: { id, page, x, y, width, height, label, type, gridBlocks?, gridDirection? }
 * gridBlocks: when type is 'grid', number of cells (horizontal = columns, vertical = rows).
 * gridDirection: 'horizontal' (one char per box) | 'vertical' (one line per row).
 */
const FIELD_TYPES = ['text', 'number', 'date', 'checkbox', 'radio', 'grid'];

/**
 * Converts pixel rect (from overlay) to PDF points using scale.
 * scale = pdfPointsPerPixel (viewport.width / canvasWidth, typically 1:1 if canvas is viewport size).
 */
function pixelRectToPoints(px, py, pw, ph, scaleX, scaleY) {
  return {
    x: px * scaleX,
    y: py * scaleY,
    width: pw * scaleX,
    height: ph * scaleY,
  };
}

export default function FieldOverlay({
  pages,
  fields,
  selectedId,
  onSelect,
  onAddField,
  onDeleteField,
  scale = 2,
}) {
  const containerRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [start, setStart] = useState(null);
  const [current, setCurrent] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [pendingRect, setPendingRect] = useState(null);
  const [pendingPage, setPendingPage] = useState(1);

  // Viewport scale: canvas size = (PDF page size in points) * scale. So 1 canvas pixel = 1/scale PDF points.
  const scaleX = 1 / scale;
  const scaleY = 1 / scale;

  const handleMouseDown = useCallback(
    (e) => {
      const wrap = e.target.closest('[data-page]');
      if (!wrap) return;
      const pageNum = Number(wrap.dataset.page);
      const rect = wrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setStart({ x, y, page: pageNum });
      setCurrent({ x, y, page: pageNum });
      setDragging(true);
    },
    []
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (!dragging || !start) return;
      const wrap = e.target.closest('[data-page]');
      if (!wrap || Number(wrap.dataset.page) !== start.page) return;
      const rect = wrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setCurrent({ x, y, page: start.page });
    },
    [dragging, start]
  );

  const handleMouseUp = useCallback(() => {
    if (!dragging || !start || !current) {
      setDragging(false);
      setStart(null);
      setCurrent(null);
      return;
    }
    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    const w = Math.abs(current.x - start.x);
    const h = Math.abs(current.y - start.y);
    setDragging(false);
    setStart(null);
    setCurrent(null);
    if (w < 5 || h < 5) return;
    const pt = pixelRectToPoints(x, y, w, h, scaleX, scaleY);
    setPendingRect(pt);
    setPendingPage(start.page);
    setShowPrompt(true);
  }, [dragging, start, current]);

  const handlePromptSubmit = useCallback(
    (label, type, gridBlocks, gridDirection) => {
      if (!pendingRect) return;
      const id = 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      const field = {
        id,
        page: pendingPage,
        ...pendingRect,
        label: label || 'Unnamed',
        type: type || 'text',
      };
      if (type === 'grid' && gridBlocks > 0) {
        field.gridBlocks = Math.floor(Number(gridBlocks)) || 11;
        field.gridDirection = gridDirection || 'horizontal';
      }
      onAddField(field);
      setPendingRect(null);
      setShowPrompt(false);
    },
    [pendingRect, pendingPage, onAddField]
  );

  const handlePromptCancel = useCallback(() => {
    setPendingRect(null);
    setShowPrompt(false);
  }, []);

  React.useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const onUp = () => handleMouseUp();
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [handleMouseUp]);

  if (!pages?.length) return null;

  return (
    <div
      ref={containerRef}
      className="field-overlay"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      style={{ pointerEvents: 'auto' }}
    >
      {pages.map((p) => (
        <div
          key={p.pageIndex}
          className="field-overlay-page"
          data-page={p.pageIndex}
          style={{ width: p.width, height: p.height }}
        >
          {fields
            .filter((f) => f.page === p.pageIndex)
            .map((f) => (
              <div
                key={f.id}
                className={`field-box ${selectedId === f.id ? 'selected' : ''}`}
                style={{
                  left: f.x * scale,
                  top: f.y * scale,
                  width: f.width * scale,
                  height: f.height * scale,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(f.id);
                }}
              >
                <span className="field-label">{f.label}</span>
              </div>
            ))}
          {dragging && start && current && start.page === p.pageIndex && (
            <div
              className="field-box draft"
              style={{
                left: Math.min(start.x, current.x),
                top: Math.min(start.y, current.y),
                width: Math.abs(current.x - start.x),
                height: Math.abs(current.y - start.y),
              }}
            />
          )}
        </div>
      ))}

      {showPrompt && pendingRect && (
        <FieldPrompt
          onSubmit={handlePromptSubmit}
          onCancel={handlePromptCancel}
          suggestedGridBlocks={Math.max(1, Math.min(99, Math.round(pendingRect.width / pendingRect.height)))}
        />
      )}
    </div>
  );
}

function FieldPrompt({ onSubmit, onCancel, suggestedGridBlocks = 11 }) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState('text');
  const [gridBlocks, setGridBlocks] = useState(suggestedGridBlocks);
  const [gridDirection, setGridDirection] = useState('horizontal');
  const inputRef = React.useRef(null);
  // When user switches to grid, pre-fill block count (horizontal: width÷height; vertical: height÷rowHeight guess)
  React.useEffect(() => {
    if (type === 'grid') setGridBlocks(suggestedGridBlocks);
  }, [type, suggestedGridBlocks]);
  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="field-prompt-overlay" onClick={onCancel}>
      <div className="field-prompt" onClick={(e) => e.stopPropagation()}>
        <h4>New field</h4>
        <label>
          Label
          <input
            ref={inputRef}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Full Names"
          />
        </label>
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {type === 'grid' && (
          <>
            <label>
              Direction
              <select value={gridDirection} onChange={(e) => setGridDirection(e.target.value)}>
                <option value="horizontal">Horizontal (one char per box, e.g. ID)</option>
                <option value="vertical">Vertical (one line per row, e.g. address)</option>
              </select>
            </label>
            <label>
              {gridDirection === 'horizontal' ? 'Number of boxes' : 'Number of rows'}
              <input
                type="number"
                min={1}
                max={99}
                value={gridBlocks}
                onChange={(e) => setGridBlocks(Number(e.target.value) || 11)}
                placeholder={gridDirection === 'horizontal' ? '11' : '3'}
                title={gridDirection === 'horizontal' ? 'Match the form (e.g. 15 for ID).' : 'Match the form (e.g. 3 for address lines).'}
              />
            </label>
          </>
        )}
        <p className="field-prompt-hint">
          {type === 'text' && `Highlight one or multiple rows: content fills left-to-right, wraps at the right edge, then continues on the next row.`}
          {type === 'grid' && gridDirection === 'horizontal' && `Set blocks to the number of boxes on the form (e.g. 15 for ID).`}
          {type === 'grid' && gridDirection === 'vertical' && `Set rows to the number of lines (e.g. 3). Excel value: use newlines or map to one column with line breaks.`}
        </p>
        <div className="field-prompt-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(label.trim() || 'Unnamed', type, type === 'grid' ? gridBlocks : undefined, type === 'grid' ? gridDirection : undefined)}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

export { FIELD_TYPES };
