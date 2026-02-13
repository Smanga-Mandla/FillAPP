import React from 'react';

/**
 * Mapping: { fieldId, excelColumn } (single) or { fieldId, excelColumns: string[], separator?: string }
 */
export default function MappingPanel({
  fields,
  excelHeaders = [],
  mappings,
  onMappingChange,
  onRefreshColumns,
}) {
  const getMappingForField = (fieldId) => {
    const m = mappings.find((x) => x.fieldId === fieldId);
    if (!m) return { columns: [], separator: ' ' };
    const columns = m.excelColumns?.length ? m.excelColumns : m.excelColumn ? [m.excelColumn] : [];
    return { columns, separator: m.separator != null ? String(m.separator) : ' ' };
  };

  const setMappingForField = (fieldId, columns, separator = ' ') => {
    const rest = mappings.filter((x) => x.fieldId !== fieldId);
    if (columns.length === 0) {
      onMappingChange(rest);
      return;
    }
    const mapping = { fieldId, excelColumns: columns };
    if (columns.length > 1 && separator !== '') mapping.separator = separator;
    onMappingChange([...rest, mapping]);
  };

  const addColumnToField = (fieldId) => {
    const { columns, separator } = getMappingForField(fieldId);
    setMappingForField(fieldId, [...columns, ''], separator);
  };

  const setColumnAt = (fieldId, index, value) => {
    const { columns, separator } = getMappingForField(fieldId);
    const next = [...columns];
    while (next.length <= index) next.push('');
    next[index] = value;
    setMappingForField(fieldId, next.filter(Boolean), separator);
  };

  const setSeparator = (fieldId, value) => {
    const { columns } = getMappingForField(fieldId);
    setMappingForField(fieldId, columns, value);
  };

  const removeColumnAt = (fieldId, index) => {
    const { columns, separator } = getMappingForField(fieldId);
    const next = columns.filter((_, i) => i !== index);
    setMappingForField(fieldId, next.length ? next : [], separator);
  };

  if (fields.length === 0) {
    return (
      <div className="mapping-panel">
        <h3>Field mapping</h3>
        <p>Define fields on the PDF first, then map them to Excel columns.</p>
      </div>
    );
  }

  const headerOptions = excelHeaders
    .map((h, i) => ({ label: String(h || '').trim(), value: h, index: i }))
    .filter(({ label }) => label !== '');

  return (
    <div className="mapping-panel">
      <h3>Field mapping</h3>
      <p>Pick one or more Excel columns per field. Combine with a separator (e.g. Name + " " + Surname).</p>
      {onRefreshColumns && (
        <button type="button" className="refresh-columns-btn" onClick={onRefreshColumns}>
          Refresh Excel columns
        </button>
      )}
      <ul className="mapping-list mapping-list-multi">
        {fields.map((f) => {
          const { columns, separator } = getMappingForField(f.id);
          const displayColumns = columns.length ? columns : [''];
          return (
            <li key={f.id} className="mapping-row-block">
              <span className="mapping-label" title={f.type}>
                {f.label}
              </span>
              <div className="mapping-columns">
                {displayColumns.map((colVal, idx) => (
                  <div key={idx} className="mapping-column-row">
                    <select
                      value={colVal}
                      onChange={(e) => setColumnAt(f.id, idx, e.target.value)}
                    >
                      <option value="">— Select column —</option>
                      {headerOptions.map(({ label, value, index }) => (
                        <option key={`${index}-${value}`} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {displayColumns.length > 1 && (
                      <button
                        type="button"
                        className="mapping-remove-col"
                        onClick={() => removeColumnAt(f.id, idx)}
                        title="Remove column"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="mapping-add-col"
                  onClick={() => addColumnToField(f.id)}
                >
                  + Add column to combine
                </button>
                {displayColumns.length > 1 && (
                  <label className="mapping-separator">
                    Separator
                    <input
                      type="text"
                      value={separator}
                      onChange={(e) => setSeparator(f.id, e.target.value)}
                      placeholder=" "
                      title={'e.g. space, comma, " - "'}
                    />
                  </label>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
