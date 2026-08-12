import { useRef, useState } from "react";
import { marked } from "marked";

function renderMarkdown(md) {
  try {
    return marked.parseSync(md);
  } catch {
    return "";
  }
}

export default function MarkdownPreview({ source = "" }) {
  const [showPreview, setShowPreview] = useState(false);
  const [markdown, setMarkdown] = useState(source);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  function insertAtCursor(text) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? markdown.length;
    const end = el.selectionEnd ?? markdown.length;
    const before = markdown.slice(0, start);
    const after = markdown.slice(end);
    const newValue = `${before}${text}${after}`;
    setMarkdown(newValue);
    setTimeout(() => {
      const pos = start + text.length;
      el.selectionStart = pos;
      el.selectionEnd = pos;
      el.focus();
    }, 0);
  }

  async function handleFileUpload(file) {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("visibility", "public");
      formData.append("expires_in", "0");

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      const isImage = (file.type || "").startsWith("image/");
      const url = isImage ? `/raw/${data.slug}` : `/f/${data.slug}`;
      const insertText = isImage
        ? `![${data.filename}](${url})`
        : `[${data.filename}](${url})`;

      insertAtCursor(insertText);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border border-surface-light bg-surface">
      <div className="flex border-b border-surface-light items-center justify-between">
        <div className="flex">
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            className={`h-7 px-3 text-[10px] font-medium transition ${
              !showPreview ? "bg-surface-light text-main" : "text-muted hover:text-main"
            }`}
          >
            Markdown
          </button>
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className={`h-7 px-3 text-[10px] font-medium transition ${
              showPreview ? "bg-surface-light text-main" : "text-muted hover:text-main"
            }`}
          >
            Preview
          </button>
        </div>
        <div className="flex items-center gap-2 pr-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-7 border border-surface-light bg-surface px-2 text-[10px] text-main transition hover:bg-surface-light disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload file"}
          </button>
        </div>
      </div>

      {uploadError && (
        <p className="px-3 py-1 text-[10px] text-red-400 bg-red-500/10">{uploadError}</p>
      )}

      {!showPreview ? (
        <textarea
          ref={textareaRef}
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          rows={6}
          placeholder="Write in Markdown..."
          required
          className="w-full border-0 bg-background px-3 py-2 text-xs text-main placeholder:text-muted focus:outline-none resize-none font-mono"
          name="content"
        />
      ) : (
        <div
          className="markdown h-40 overflow-y-auto px-3 py-2 text-xs text-main break-words"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
        />
      )}
    </div>
  );
}
