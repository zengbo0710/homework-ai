import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../lib/api';

interface Preview {
  id: string;
  url: string;
  file: File;
}

export function ScanPage() {
  const { childId } = useParams<{ childId: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [hasCamera, setHasCamera] = useState(false);

  useEffect(() => {
    // Show camera button only if the device has a camera
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        setHasCamera(devices.some((d) => d.kind === 'videoinput'));
      }).catch(() => setHasCamera(false));
    }
  }, []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const newPreviews: Preview[] = [];
    for (let i = 0; i < files.length; i++) {
      if (previews.length + newPreviews.length >= 10) break;
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      newPreviews.push({
        id: Math.random().toString(36).slice(2),
        url: URL.createObjectURL(file),
        file,
      });
    }
    setPreviews((prev) => [...prev, ...newPreviews].slice(0, 10));
  }

  function removeImage(id: string) {
    setPreviews((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleSubmit() {
    if (previews.length === 0) return;
    setError('');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('childId', childId!);
      previews.forEach((p) => form.append('images', p.file));
      const res = await apiClient.post('/submissions', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      navigate(`/submissions/${res.data.id}`);
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="text-indigo-600 text-sm">← Back</button>
        <h1 className="text-xl font-bold">Scan Homework</h1>
      </div>

      {/* Photo grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {previews.map((p) => (
          <div key={p.id} className="relative aspect-square">
            <img src={p.url} alt="preview" className="w-full h-full object-cover rounded-lg" />
            <button
              onClick={() => removeImage(p.id)}
              className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
            >
              ×
            </button>
          </div>
        ))}
        {previews.length < 10 && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square border-2 border-dashed border-indigo-300 rounded-lg flex flex-col items-center justify-center text-indigo-600 hover:bg-indigo-50"
          >
            <span className="text-2xl">+</span>
            <span className="text-xs mt-1">Add photo</span>
          </button>
        )}
      </div>

      {/* Hidden file picker — gallery / files */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />

      {/* Hidden camera input — opens camera directly */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />

      {/* Camera button — shown when a camera is detected */}
      {hasCamera && (
        <button
          onClick={() => cameraInputRef.current?.click()}
          className="w-full mb-3 py-3 border-2 border-indigo-300 text-indigo-600 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-indigo-50"
        >
          📷 Take photo
        </button>
      )}

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <p className="text-xs text-gray-500 mb-4 text-center">
        {previews.length}/10 photos selected
      </p>

      <button
        onClick={handleSubmit}
        disabled={previews.length === 0 || uploading}
        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-lg disabled:opacity-50"
      >
        {uploading ? 'Uploading…' : `Check Homework (${previews.length} photo${previews.length !== 1 ? 's' : ''})`}
      </button>
    </div>
  );
}
