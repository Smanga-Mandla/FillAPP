import React, { useEffect, useRef, useState } from 'react';
// Use legacy build: includes worker file on disk for Vite
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const SCALE = 2; // display scale for sharpness

/**
 * Loads and renders the form PDF page-by-page.
 * Each page is drawn to a canvas; parent overlays fields on top.
 */
export default function PdfViewer({ onPagesLoaded, pdfUrl = '/api/form/pdf' }) {
  const containerRef = useRef(null);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    pdfjsLib
      .getDocument(pdfUrl)
      .promise.then((pdf) => {
        if (cancelled) return;
        const numPages = pdf.numPages;
        const pagePromises = [];
        for (let i = 1; i <= numPages; i++) {
          pagePromises.push(
            pdf.getPage(i).then((page) => {
              const viewport = page.getViewport({ scale: SCALE });
              return {
                pageIndex: i,
                page,
                viewport,
                width: viewport.width,
                height: viewport.height,
              };
            })
          );
        }
        return Promise.all(pagePromises);
      })
      .then((pageInfos) => {
        if (cancelled) return;
        setPages(pageInfos);
        onPagesLoaded?.(pageInfos);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load PDF');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [pdfUrl, onPagesLoaded]);

  useEffect(() => {
    if (pages.length === 0) return;
    const canvases = containerRef.current?.querySelectorAll('canvas');
    if (!canvases) return;
    pages.forEach((p, i) => {
      const canvas = canvases[i];
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      canvas.width = p.viewport.width;
      canvas.height = p.viewport.height;
      p.page.render({ canvasContext: ctx, viewport: p.viewport });
    });
  }, [pages]);

  if (loading) return <div className="pdf-loading">Loading PDF…</div>;
  if (error) return <div className="pdf-error">Error: {error}</div>;

  return (
    <div ref={containerRef} className="pdf-viewer">
      {pages.map((p) => (
        <div key={p.pageIndex} className="pdf-page-wrap" data-page={p.pageIndex}>
          <canvas
            className="pdf-page-canvas"
            width={p.width}
            height={p.height}
            data-page={p.pageIndex}
          />
        </div>
      ))}
    </div>
  );
}

export { SCALE };
