import { useRef, useState, useCallback } from "react";
import { useProject, newWidgetId, type ImageAsset } from "../store/projectStore";

const ACCEPTED = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB per image

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function loadImageFile(file: File): Promise<ImageAsset> {
  return new Promise((resolve, reject) => {
    if (!ACCEPTED.includes(file.type)) {
      reject(new Error(`Unsupported type: ${file.type}`));
      return;
    }
    if (file.size > MAX_BYTES) {
      reject(new Error(`File too large (max 4 MB): ${formatSize(file.size)}`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // For SVGs we don't need natural dimensions — default to 200×200
      if (file.type === "image/svg+xml") {
        resolve({
          id: `img-${Math.random().toString(36).slice(2, 9)}`,
          name: file.name.replace(/\.[^.]+$/, ""),
          dataUrl,
          mimeType: file.type,
          width: 200,
          height: 200,
          size: file.size,
        });
        return;
      }
      const img = new Image();
      img.onload = () => resolve({
        id: `img-${Math.random().toString(36).slice(2, 9)}`,
        name: file.name.replace(/\.[^.]+$/, ""),
        dataUrl,
        mimeType: file.type,
        width: img.naturalWidth,
        height: img.naturalHeight,
        size: file.size,
      });
      img.onerror = () => reject(new Error("Failed to decode image"));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// ── Thumbnail card ─────────────────────────────────────────────────────────

function ImageCard({
  asset,
  onDelete,
  onRename,
}: {
  asset: ImageAsset;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(asset.name);
  const { activePageId, addWidget } = useProject();

  const commitRename = () => {
    if (draft.trim()) onRename(draft.trim());
    else setDraft(asset.name);
    setEditing(false);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/x-image-id", asset.id);
    e.dataTransfer.effectAllowed = "copy";
  };

  const addToCanvas = () => {
    addWidget(activePageId, {
      id: newWidgetId(),
      type: "image",
      x: 0, y: 0, w: 4, h: 3,
      config: { src: `lib:${asset.id}`, label: asset.name, objectFit: "contain" },
    });
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="group relative rounded-lg border border-zinc-700/50 bg-zinc-800/40 overflow-hidden cursor-grab active:cursor-grabbing hover:border-zinc-500 transition-colors"
      title={`${asset.name} · ${asset.width}×${asset.height} · ${formatSize(asset.size)}`}
    >
      {/* Thumbnail */}
      <div
        className="w-full bg-zinc-950 flex items-center justify-center"
        style={{ height: 72 }}
      >
        <img
          src={asset.dataUrl}
          alt={asset.name}
          className="max-w-full max-h-full object-contain"
          style={{ maxHeight: 68 }}
        />
      </div>

      {/* Hover overlay: add + delete */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); addToCanvas(); }}
          title="Add to canvas"
          className="text-[10px] px-2 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white font-medium"
        >
          + Add
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete image"
          className="text-[10px] px-1.5 py-1 rounded bg-zinc-700 hover:bg-red-800 text-zinc-300"
        >
          ×
        </button>
      </div>

      {/* Name */}
      <div className="px-1.5 py-1 border-t border-zinc-700/50">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") { setDraft(asset.name); setEditing(false); }
              e.stopPropagation();
            }}
            onClick={e => e.stopPropagation()}
            className="w-full bg-zinc-700 rounded px-1 text-[10px] text-zinc-100 outline-none"
          />
        ) : (
          <div
            className="text-[10px] text-zinc-400 truncate cursor-text"
            onDoubleClick={() => { setDraft(asset.name); setEditing(true); }}
            title="Double-click to rename"
          >
            {asset.name}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Drop zone ──────────────────────────────────────────────────────────────

function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => ACCEPTED.includes(f.type));
    if (files.length) onFiles(files);
  }, [onFiles]);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`mx-3 mt-3 mb-2 rounded-lg border-2 border-dashed flex flex-col items-center justify-center py-4 cursor-pointer transition-colors select-none ${
        over
          ? "border-blue-500 bg-blue-950/20 text-blue-400"
          : "border-zinc-700 hover:border-zinc-500 text-zinc-600 hover:text-zinc-400"
      }`}
    >
      <div className="text-lg mb-1">⬆</div>
      <div className="text-[11px] font-medium">Drop images here</div>
      <div className="text-[10px] mt-0.5">or click to browse</div>
      <div className="text-[9px] mt-1 opacity-60">PNG · JPG · SVG · GIF · WebP · max 4 MB</div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        multiple
        className="hidden"
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

export function ImageLibrary() {
  const { project, importImage, deleteImage, renameImage } = useProject();
  const images = project.images ?? [];
  const [filter, setFilter] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const handleFiles = async (files: File[]) => {
    const errs: string[] = [];
    for (const file of files) {
      try {
        const asset = await loadImageFile(file);
        importImage(asset);
      } catch (e) {
        errs.push((e as Error).message);
      }
    }
    if (errs.length) {
      setErrors(errs);
      setTimeout(() => setErrors([]), 4000);
    }
  };

  const filtered = filter.trim()
    ? images.filter(img => img.name.toLowerCase().includes(filter.toLowerCase()))
    : images;

  return (
    <div className="flex flex-col h-full">
      <DropZone onFiles={handleFiles} />

      {errors.length > 0 && (
        <div className="mx-3 mb-2 rounded border border-red-800 bg-red-950/30 px-3 py-2">
          {errors.map((e, i) => (
            <div key={i} className="text-[10px] text-red-400">{e}</div>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <div className="px-3 mb-2">
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="filter images…"
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-zinc-500 text-zinc-300"
          />
        </div>
      )}

      {images.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4 pb-6">
          <div className="text-2xl mb-2 opacity-30">🖼</div>
          <div className="text-[11px] text-zinc-600">No images yet.</div>
          <div className="text-[10px] text-zinc-700 mt-1">
            Import PNG, JPG, or SVG files to use them as widgets on the canvas.
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-3 text-[11px] text-zinc-600 italic">No matches.</div>
      ) : (
        <div className="flex-1 overflow-auto px-3 pb-3">
          <div className="text-[9px] uppercase tracking-wider text-zinc-600 mb-2">
            {filtered.length} image{filtered.length !== 1 ? "s" : ""}
            {" · "}drag to canvas or click + Add
          </div>
          <div className="grid grid-cols-2 gap-2">
            {filtered.map(img => (
              <ImageCard
                key={img.id}
                asset={img}
                onDelete={() => deleteImage(img.id)}
                onRename={name => renameImage(img.id, name)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
