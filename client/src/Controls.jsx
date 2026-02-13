import React, { useState } from 'react';

const API = '/api';

export default function Controls({
  fields,
  mappings,
  onGenerate,
  onDeleteOutputs,
  disabled,
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const handleGenerate = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch(`${API}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields, mappings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generate failed');
      setMessage(`Generated ${data.count} PDF(s) in /output.`);
      onGenerate?.();
    } catch (err) {
      setMessage('Error: ' + (err.message || 'Unknown'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch(`${API}/output`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setMessage('Generated PDFs deleted.');
      onDeleteOutputs?.();
    } catch (err) {
      setMessage('Error: ' + (err.message || 'Unknown'));
    } finally {
      setBusy(false);
    }
  };

  const canGenerate = fields.length > 0 && mappings.length > 0 && !disabled;

  return (
    <div className="controls">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={!canGenerate || busy}
      >
        {busy ? '…' : 'Generate PDFs'}
      </button>
      <button type="button" onClick={handleDelete} disabled={busy}>
        Delete Generated PDFs
      </button>
      {message && <p className="controls-message">{message}</p>}
    </div>
  );
}
