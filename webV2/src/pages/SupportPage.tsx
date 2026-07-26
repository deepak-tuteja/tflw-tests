import { useRef, useState, type DragEvent } from 'react';
import { ApiError, uploadFile } from '../api/client';
import type { UploadMetadata } from '../types';

const ACCEPTED = ['text/csv', 'text/plain', 'application/pdf'];

export function SupportPage() {
  const [uploads, setUploads] = useState<UploadMetadata[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [subject, setSubject] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    try {
      const upload = await uploadFile<UploadMetadata>('/uploads', file);
      setUploads((prev) => [upload, ...prev]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'upload failed');
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  // Tier C corner (webV2-3): a per-render dynamic id. This id is recomputed on every render (not
  // memoized, not tied to mount), so a selector cached against a specific `#subject-xyz123` id
  // string breaks the moment the user types another character and this component re-renders —
  // yet the <label>'s `htmlFor` is recomputed to match on the very same render, so label-based
  // accessible-name resolution keeps working throughout.
  const subjectId = `subject-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <section aria-labelledby="support-heading">
      <h1 id="support-heading">Support</h1>

      <div className="field">
        <label htmlFor={subjectId}>Subject</label>
        <input
          id={subjectId}
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      {/*
        Tier C corner (webV2-3): a real drag-and-drop drop zone, distinct from a plain
        `<input type="file">`. Dropping a file fires the same upload path as the fallback file
        picker below — both exercise apiV2's /uploads endpoint (csv/txt/pdf only).
      */}
      <div
        className={dragging ? 'drop-zone drop-zone-active' : 'drop-zone'}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <p>Drag a file here (.csv, .txt, .pdf), or</p>
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          Choose a file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          className="visually-hidden"
          aria-label="Choose a file to upload"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {error && <p role="alert">{error}</p>}

      <ul>
        {uploads.map((upload) => (
          <li key={upload.id}>
            <a href={`/v1/uploads/${upload.id}`}>{upload.filename}</a> ({upload.contentType})
          </li>
        ))}
      </ul>
    </section>
  );
}
