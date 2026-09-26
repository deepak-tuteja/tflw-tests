import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ApiError, apiFetch, uploadFile } from '../api/client';
import { useAuth } from '../auth/AuthContext';

// `S-3a` (decision 16): the account page. Its avatar dropzone is the storefront's `drop file`
// surface with a server that answers: the stored filename and byte count come back and are shown,
// and a file of the wrong type is refused by the server (415) and shown as the refusal it is.
interface Avatar {
  filename: string;
  size: number;
  contentType: string;
}

export function AccountPage() {
  const { user } = useAuth();
  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch<{ avatar: Avatar | null }>('/profile/avatar')
      .then((r) => setAvatar(r.avatar))
      .catch(() => setAvatar(null));
  }, []);

  async function handleFile(file: File) {
    setError(null);
    try {
      setAvatar(await uploadFile<Avatar>('/profile/avatar', file));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'upload failed');
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  return (
    <section aria-labelledby="account-heading">
      <h1 id="account-heading">Your account</h1>
      <p>
        Signed in as <strong>{user?.email}</strong>
      </p>

      <h2>Avatar</h2>
      <div
        className={dragging ? 'drop-zone drop-zone-active avatar-drop' : 'drop-zone avatar-drop'}
        data-avatar-drop
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        Drop a PNG or JPEG here (1 MiB at most)
      </div>
      <div className="field">
        <label htmlFor="avatar-file">Choose an avatar</label>
        <input
          id="avatar-file"
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>

      {avatar ? (
        <p data-avatar>
          Current avatar: <strong data-avatar-name>{avatar.filename}</strong> ·{' '}
          <span data-avatar-size>{avatar.size} bytes</span>
        </p>
      ) : (
        <p data-avatar-none>No avatar yet.</p>
      )}
      {error && (
        <p role="alert" className="error" data-avatar-error>
          {error}
        </p>
      )}
    </section>
  );
}
