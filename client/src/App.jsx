import React, { useState, useCallback, useEffect } from 'react';
import PdfViewer, { SCALE } from './PdfViewer';
import FieldOverlay from './FieldOverlay';
import MappingPanel from './MappingPanel';
import Controls from './Controls';

const API = '/api';

export default function App() {
  const [pageInfos, setPageInfos] = useState([]);
  const [fields, setFields] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [excelPreview, setExcelPreview] = useState(null);

  const loadExcelPreview = useCallback(async () => {
    try {
      const [previewRes, headersRes] = await Promise.all([
        fetch(`${API}/excel/preview`),
        fetch(`${API}/excel/headers`),
      ]);
      const preview = await previewRes.json();
      const { headers } = await headersRes.json();
      setExcelPreview(preview);
      setExcelHeaders(headers || []);
    } catch (e) {
      console.error('Load Excel failed', e);
    }
  }, []);

  useEffect(() => {
    loadExcelPreview();
  }, [loadExcelPreview]);

  const handleAddField = useCallback((field) => {
    setFields((prev) => [...prev, field]);
    setSelectedId(field.id);
  }, []);

  const handleDeleteField = useCallback((id) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    setMappings((prev) => prev.filter((m) => m.fieldId !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>fillMeuP</h1>
        <p>Draw fields on the PDF, map to Excel columns, then generate PDFs.</p>
      </header>

      <div className="app-body">
        <aside className="app-sidebar">
          <div className="sidebar-section">
            <h3>Defined fields</h3>
            {fields.length === 0 ? (
              <p>Draw a rectangle on the PDF to add a field.</p>
            ) : (
              <ul className="field-list">
                {fields.map((f) => (
                  <li
                    key={f.id}
                    className={selectedId === f.id ? 'selected' : ''}
                    onClick={() => setSelectedId(f.id)}
                  >
                    <span>
                      {f.label}
                      {f.type === 'grid' && f.gridBlocks && (
                        f.gridDirection === 'vertical'
                          ? ` (${f.gridBlocks} rows)`
                          : ` (${f.gridBlocks} boxes)`
                      )}
                    </span>
                    <button
                      type="button"
                      className="delete-field"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteField(f.id);
                      }}
                      title="Delete field"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <MappingPanel
            fields={fields}
            excelHeaders={excelHeaders}
            mappings={mappings}
            onMappingChange={setMappings}
            onRefreshColumns={loadExcelPreview}
          />
          <Controls
            fields={fields}
            mappings={mappings}
            onGenerate={() => {}}
            onDeleteOutputs={() => {}}
          />
        </aside>

        <main className="app-main">
          <div className="pdf-container">
            <PdfViewer onPagesLoaded={setPageInfos} />
            <FieldOverlay
              pages={pageInfos}
              fields={fields}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAddField={handleAddField}
              onDeleteField={handleDeleteField}
              scale={SCALE}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
