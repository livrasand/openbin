// Editor de formularios JFORM: crea (JSON + preview), carga archivos .jform,
// descarga el archivo o lo publica en openbin (bin con renderizado en /forms/{slug}).
// Estilo visual: lenguaje de openbin (Tailwind, bg-surface, border-surface-light,
// text-main/text-muted, acento primary) — mismo look que UploadForm/discover.
import { useState, useRef, useEffect } from "react";
import { renderField } from "./fields.jsx";
import { useShikiHighlighter, createJavaScriptRegexEngine } from "react-shiki";
import {
  Upload,
  Eraser,
  Download,
  Send,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ExternalLink,
  AlertCircle,
} from "lucide-react";

const EXAMPLE = {
  form_id: "mi-formulario",
  settings: {
    language: "es",
    submit_button_text: "Enviar",
    confirmation_message: "¡Gracias! Tu respuesta fue enviada.",
  },
  transport: {
    type: "email",
    destination: "jf_tu-token-de-email-relay",
  },
  theme: {
    page_background: "#0d1117",
    form_background: "#161b22",
    colors: {
      primary_hex: "#4a7cf7",
      text_hex: "#f0f6fc",
    },
  },
  header: {
    title: "Mi formulario",
    subtitle: "Creado con el editor de JFORM",
  },
  elements: [
    {
      id: "nombre",
      type: "text",
      label: "Tu nombre",
      placeholder: "Ada Lovelace",
      required: true,
    },
    {
      id: "correo",
      type: "email",
      label: "Correo electrónico",
      placeholder: "tu@correo.com",
      required: true,
    },
    {
      id: "tema",
      type: "select",
      label: "¿De qué quieres hablar?",
      required: true,
      options: [
        { value: "1", label: "Opción 1" },
        { value: "2", label: "Opción 2" },
      ],
    },
    {
      id: "comentario",
      type: "textarea",
      label: "Comentario",
      rows: 4,
    },
  ],
};

// Overlay del editor: colores de indentación y escape de HTML (patrón de UploadForm).
const INDENT_COLORS = [
  "rgba(255,255,64,0.12)",
  "rgba(127,255,127,0.12)",
  "rgba(255,127,255,0.12)",
  "rgba(79,236,236,0.12)",
];
const INDENT_ERROR_COLOR = "rgba(128,32,32,0.6)";
const INDENT_TAB_MIX_COLOR = "rgba(128,32,96,0.6)";
const INDENT_TAB_SIZE = 2;

// Engine sin WASM: evita el chunk wasm de shiki en dev (504 Outdated Optimize Dep)
// y los fallos de import del motor Oniguruma. JSON se resalta igual.
const SHIKI_ENGINE = createJavaScriptRegexEngine();

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderIndentHtml(leading) {
  if (!leading) return "";
  const hasSpace = leading.includes(" ");
  const hasTab = leading.includes("\t");
  if (hasSpace && hasTab) {
    return `<span style="background-color:${INDENT_TAB_MIX_COLOR}">${escapeHtml(leading)}</span>`;
  }
  let html = "";
  if (hasTab) {
    for (let i = 0; i < leading.length; i += 1) {
      const color = INDENT_COLORS[i % INDENT_COLORS.length];
      html += `<span style="background-color:${color}">\t</span>`;
    }
  } else {
    const fullUnits = Math.floor(leading.length / INDENT_TAB_SIZE);
    const remainder = leading.length % INDENT_TAB_SIZE;
    for (let i = 0; i < fullUnits; i += 1) {
      const color = INDENT_COLORS[i % INDENT_COLORS.length];
      html += `<span style="background-color:${color}">${' '.repeat(INDENT_TAB_SIZE)}</span>`;
    }
    if (remainder > 0) {
      html += `<span style="background-color:${INDENT_ERROR_COLOR}">${escapeHtml(leading.slice(fullUnits * INDENT_TAB_SIZE))}</span>`;
    }
  }
  return html;
}

function renderEditorOverlay(code) {
  return code
    .split("\n")
    .map((line) => {
      const match = line.match(/^(\s*)(.*)$/);
      const leading = match ? match[1] : "";
      const rest = match ? match[2] : line;
      return renderIndentHtml(leading) + escapeHtml(rest);
    })
    .join("\n");
}

export default function CreateForm() {
  return <CreateFormInner />;
}

function CreateFormInner() {
  const [rawJson, setRawJson] = useState(JSON.stringify(EXAMPLE, null, 2));
  const [schema, setSchema] = useState(EXAMPLE);
  const [parseError, setParseError] = useState("");
  const [fileName, setFileName] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(null);
  const [publishError, setPublishError] = useState("");
  const [copiedValue, setCopiedValue] = useState(null);
  const [visibility, setVisibility] = useState("public");
  const [password, setPassword] = useState("");
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const [publishMenuPosition, setPublishMenuPosition] = useState(null);
  const fileInputRef = useRef(null);
  const gutterRef = useRef(null);
  const shikiRef = useRef(null);
  const overlayRef = useRef(null);
  const publishMenuRef = useRef(null);
  const menuRef = useRef(null);
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const readTheme = () =>
      document.documentElement.dataset.theme === "light" ? "light" : "dark";
    setTheme(readTheme());
    // El toggle de tema vive en la StatusBar (fuera del island): se observa
    // el atributo data-theme para recolorear el editor de Shiki en vivo.
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // Cierra el menú de publicación al hacer click fuera (patrón de UploadForm)
  useEffect(() => {
    if (!publishMenuOpen) return;
    const handleClick = (e) => {
      const target = e.target;
      if (publishMenuRef.current && publishMenuRef.current.contains(target)) return;
      if (menuRef.current && menuRef.current.contains(target)) return;
      setPublishMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [publishMenuOpen]);

  function tryParse(text) {
    try {
      const s = JSON.parse(text);
      const fields = s.elements || s.fields;
      if ((!s.title && !s.header?.title) || !fields || !Array.isArray(fields)) {
        setParseError("El JSON debe tener un título y elementos (elements o fields).");
        setSchema(null);
        return;
      }
      setParseError("");
      setSchema(s);
    } catch (e) {
      setParseError("JSON inválido: " + e.message);
      setSchema(null);
    }
  }

  function handleChange(value) {
    setRawJson(value);
    setPublished(null);
    setPublishError("");
    tryParse(value);
  }

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setFileName(file.name);
      handleChange(text);
    };
    reader.readAsText(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }

  function clearAll() {
    setRawJson("");
    setSchema(null);
    setParseError("");
    setFileName(null);
    setPublished(null);
    setPublishError("");
  }

  function download() {
    if (!schema) return;
    const blob = new Blob([JSON.stringify(schema, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (schema.form_id || "form") + ".jform";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function publish(forcedVisibility) {
    if (!schema) {
      tryParse(rawJson);
      if (!schema) return;
    }
    const vis = forcedVisibility || visibility;
    if (vis === "private" && !password) {
      setPublishError("A password is required for a private bin");
      return;
    }
    setPublishing(true);
    setPublishError("");
    try {
      const formData = new FormData();
      const fileName = (schema.form_id || "form") + ".jform";
      formData.append(
        "file",
        new File([JSON.stringify(schema, null, 2)], fileName, {
          type: "application/json",
        }),
      );
      formData.append("visibility", vis);
      formData.append("expires_in", "0");
      if (vis === "private") formData.append("password", password);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setPublished({
        slug: data.slug,
        url: location.origin + "/forms/" + data.slug,
        authorToken: data.authorToken || null,
      });
    } catch (err) {
      setPublishError("Error al publicar: " + err.message);
    } finally {
      setPublishing(false);
    }
  }

  async function copyUrl() {
    if (!published) return;
    try {
      await navigator.clipboard.writeText(published.url);
      setCopiedValue(published.url);
      setTimeout(() => setCopiedValue(null), 2000);
    } catch {
      // clipboard no disponible
    }
  }

  async function copyManageUrl() {
    if (!published?.authorToken) return;
    const manageUrl = published.url + "?token=" + published.authorToken;
    try {
      await navigator.clipboard.writeText(manageUrl);
      setCopiedValue(manageUrl);
      setTimeout(() => setCopiedValue(null), 2000);
    } catch {
      // clipboard no disponible
    }
  }

  // Mantiene gutter, overlay de indentación y resaltado Shiki sincronizados
  // con el scroll del editor
  function handleEditorScroll(e) {
    const el = e.currentTarget;
    if (gutterRef.current) gutterRef.current.scrollTop = el.scrollTop;
    if (shikiRef.current) {
      shikiRef.current.scrollTop = el.scrollTop;
      shikiRef.current.scrollLeft = el.scrollLeft;
    }
    if (overlayRef.current) {
      overlayRef.current.scrollTop = el.scrollTop;
      overlayRef.current.scrollLeft = el.scrollLeft;
    }
  }

  const formBg = schema?.theme?.form_background || "var(--surface, #ffffff)";
  const formBorder = "1px solid var(--border)";
  const lineCount = rawJson.split("\n").length;
  const lineDigits = String(lineCount).length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1).join(
    "\n",
  );
  const shikiTheme = theme === "dark" ? "github-dark" : "github-light";
  const shikiHtml = useShikiHighlighter(rawJson, "json", shikiTheme, {
    outputFormat: "html",
    rootStyle: false,
    tabindex: false,
    engine: SHIKI_ENGINE,
  });

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {/* Panel izquierdo: editor JSON */}
      <div className="flex shrink-0 flex-col gap-3 border-b border-surface-light p-4 lg:w-3/5 lg:max-w-[720px] lg:border-b-0 lg:border-r lg:p-6">
        <header>
          <h1 className="text-sm font-medium text-main">Crea o sube un formulario JFORM</h1>
          <p className="mt-0.5 text-xs text-muted">Pega un JSON, carga un archivo .jform, previsualiza y publica tu formulario en openbin.</p>
        </header>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-8 items-center gap-1.5 border border-surface-light bg-surface px-3 text-xs font-medium text-muted transition-colors hover:bg-surface-light hover:text-main"
          >
            <Upload className="h-3.5 w-3.5" />
            Cargar archivo .jform
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="flex h-8 items-center gap-1.5 border border-surface-light bg-surface px-3 text-xs font-medium text-muted transition-colors hover:bg-surface-light hover:text-main"
          >
            <Eraser className="h-3.5 w-3.5" />
            Vaciar
          </button>
          <button
            type="button"
            onClick={download}
            disabled={!schema}
            className="flex h-8 items-center gap-1.5 border border-surface-light bg-surface px-3 text-xs font-medium text-muted transition-colors hover:bg-surface-light hover:text-main disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Descargar .jform
          </button>
          <div className="relative flex items-stretch" ref={publishMenuRef}>
            <button
              type="button"
              onClick={() => publish()}
              disabled={publishing || !schema}
              className="flex h-8 items-center gap-1.5 bg-primary px-3 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {publishing ? "Publicando..." : "Publicar en openbin"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPublishMenuOpen((open) => {
                  if (!open && publishMenuRef.current) {
                    const rect = publishMenuRef.current.getBoundingClientRect();
                    setPublishMenuPosition({
                      right: window.innerWidth - rect.right,
                      top: rect.bottom + 4,
                    });
                  }
                  return !open;
                });
              }}
              disabled={publishing || !schema}
              className="flex h-8 shrink-0 items-center border-l border-white/20 bg-primary px-1.5 text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Publish options"
              aria-expanded={publishMenuOpen}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {publishMenuOpen && publishMenuPosition && (
              <div
                ref={menuRef}
                className="fixed z-50 w-[min(12rem,calc(100vw-1rem))] border border-surface-light bg-surface py-1 shadow-lg"
                style={{
                  right: publishMenuPosition.right,
                  top: publishMenuPosition.top,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setVisibility("public");
                    setPublishMenuOpen(false);
                    publish("public");
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-main hover:bg-surface-light"
                >
                  <span>Open public bin</span>
                  {visibility === "public" && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVisibility("secret");
                    setPublishMenuOpen(false);
                    publish("secret");
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-main hover:bg-surface-light"
                >
                  <span>Open secret bin</span>
                  {visibility === "secret" && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVisibility("private");
                    publish("private");
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-main hover:bg-surface-light"
                >
                  <span>Open private bin</span>
                  {visibility === "private" && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </button>
                {visibility === "private" && (
                  <div className="border-t border-surface-light px-3 py-2">
                    <input
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="password"
                      title="Password for private bin"
                      className="h-7 w-full border border-surface-light bg-background px-2 text-xs text-main placeholder:text-muted focus:border-secondary focus:outline-none"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".jform,.json,application/json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />

        <div
          className={[
            "relative min-h-[46vh] flex-1 overflow-hidden bg-background jform-editor",
            dragging
              ? "border border-primary bg-surface-light"
              : "border border-surface-light",
          ].join(" ")}
        >
          <pre
            ref={gutterRef}
            aria-hidden="true"
            className="absolute left-0 top-0 bottom-0 min-w-6 m-0 overflow-hidden py-4 pr-2 text-right font-mono text-sm leading-5 text-muted bg-transparent border-r border-surface no-scrollbar pointer-events-none select-none"
            style={{ width: `calc(${lineDigits}ch + 1.5rem)` }}
          >
            {lineNumbers}
          </pre>
          <div
            ref={shikiRef}
            className="absolute inset-0 overflow-y-auto whitespace-pre-wrap py-4 pr-4 font-mono text-sm leading-5 text-main"
            style={{ paddingLeft: `calc(${lineDigits}ch + 2.5rem)` }}
            dangerouslySetInnerHTML={{
              __html:
                shikiHtml ||
                `<pre class="shiki-fallback" style="margin:0;padding:0">${escapeHtml(rawJson)}</pre>`,
            }}
          />
          <pre
            ref={overlayRef}
            aria-hidden="true"
            className="absolute inset-0 m-0 overflow-y-auto whitespace-pre-wrap break-words py-4 pr-4 font-mono text-sm leading-5 text-transparent no-scrollbar pointer-events-none"
            style={{
              paddingLeft: `calc(${lineDigits}ch + 2.5rem)`,
              tabSize: INDENT_TAB_SIZE,
              MozTabSize: INDENT_TAB_SIZE,
            }}
            dangerouslySetInnerHTML={{ __html: renderEditorOverlay(rawJson) }}
          />
          <textarea
            value={rawJson}
            spellCheck={false}
            placeholder="Pega aquí el JSON de tu formulario..."
            className="absolute inset-0 h-full w-full resize-none overflow-y-auto whitespace-pre-wrap break-words bg-transparent py-4 pr-4 font-mono text-sm leading-5 text-transparent caret-[var(--color-main)] focus:outline-none"
            style={{
              paddingLeft: `calc(${lineDigits}ch + 2.5rem)`,
              tabSize: INDENT_TAB_SIZE,
              MozTabSize: INDENT_TAB_SIZE,
            }}
            onChange={(e) => handleChange(e.target.value)}
            onScroll={handleEditorScroll}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          />
        </div>

        {publishError && (
          <div className="flex shrink-0 items-start gap-2 border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{publishError}</p>
          </div>
        )}

        {published && (
          <div className="shrink-0 space-y-2 border border-surface-light bg-surface p-4">
            <URLBox
              label="Publicado"
              value={published.url}
              copied={copiedValue === published.url}
              onCopy={copyUrl}
            />
            {published.authorToken && (
              <URLBox
                label="Manage link"
                value={published.url + "?token=" + published.authorToken}
                copied={copiedValue === published.url + "?token=" + published.authorToken}
                onCopy={copyManageUrl}
              />
            )}
          </div>
        )}
      </div>

      {/* Panel derecho: vista previa */}
      <div className="min-w-0 flex-1 p-4 lg:p-6">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          Vista previa
        </p>
        {schema ? (
          <div
            className="form-wrap"
            style={{ background: formBg, border: formBorder, marginTop: 0 }}
          >
            {schema.header && schema.header.title ? (
              <h2>{schema.header.title}</h2>
            ) : (
              <h2>{schema.title}</h2>
            )}
            {(schema.header && schema.header.subtitle) || schema.description ? (
              <p>{schema.header?.subtitle || schema.description}</p>
            ) : null}
            <form encType="multipart/form-data">
              {(schema.elements || schema.fields).map((f) => {
                if (!f.id || !f.type) return null;

                if (f.type === "divider") {
                  return (
                    <hr
                      key={f.id}
                      style={{
                        border: "none",
                        borderTop: `${f.thickness || 1}px solid ${f.color || "var(--border)"}`,
                        margin: `${f.spacing || 16}px 0`,
                      }}
                    />
                  );
                }

                if (f.type === "spacer") {
                  return <div key={f.id} style={{ height: f.height || 24 }} />;
                }

                if (f.type === "section") {
                  return (
                    <div
                      key={f.id}
                      style={{ marginBottom: 8, marginTop: f.margin_top || 8 }}
                    >
                      {f.label && (
                        <h3
                          style={{
                            fontSize: "1rem",
                            fontWeight: 700,
                            margin: "0 0 4px",
                          }}
                        >
                          {f.label}
                        </h3>
                      )}
                      {f.description && (
                        <p
                          style={{
                            fontSize: "0.83rem",
                            color: "var(--text-2)",
                            margin: 0,
                          }}
                        >
                          {f.description}
                        </p>
                      )}
                    </div>
                  );
                }

                if (f.type === "image" || f.type === "video") {
                  return (
                    <div className="field-group" key={f.id}>
                      {f.type === "image" ? (
                        <img
                          src={f.url}
                          alt={f.alt_text || ""}
                          style={{ maxWidth: "100%", borderRadius: 8 }}
                        />
                      ) : (
                        <iframe
                          src={f.url}
                          style={{
                            width: "100%",
                            minHeight: 300,
                            borderRadius: 8,
                            border: "none",
                          }}
                          allowFullScreen
                        />
                      )}
                      {f.caption && (
                        <p
                          style={{
                            fontSize: "0.85rem",
                            color: "var(--text-2)",
                            marginTop: 8,
                          }}
                        >
                          {f.caption}
                        </p>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="field-group" key={f.id}>
                    <label htmlFor={f.id}>
                      {f.label}
                      {f.required ? (
                        <span className="required-mark">*</span>
                      ) : (
                        ""
                      )}
                    </label>
                    {f.description && (
                      <span className="description">{f.description}</span>
                    )}
                    {renderField(f)}
                  </div>
                );
              })}
            </form>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center border border-surface-light bg-surface text-muted">
              ∅
            </div>
            <p className="text-xs text-muted">No hay un formulario válido para previsualizar.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Caja de resultado publicado, mismo patrón visual que el URLBox de UploadForm.
function URLBox({ label, value, copied, onCopy }) {
  return (
    <div className="space-y-2">
      <label className="block text-xs uppercase tracking-wide text-muted">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={value}
          className="min-w-0 flex-1 border border-surface-light bg-surface px-3 py-2 text-sm text-main focus:border-secondary focus:outline-none"
        />
        <button
          type="button"
          onClick={onCopy}
          className="bg-secondary p-2 text-white transition-colors hover:bg-secondary/90"
          title={copied ? "¡Copiado!" : "Copiar"}
        >
          {copied ? (
            <Check className="h-5 w-5" />
          ) : (
            <Copy className="h-5 w-5" />
          )}
        </button>
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-secondary p-2 text-white transition-colors hover:bg-secondary/90"
          title="Abrir"
        >
          <ExternalLink className="h-5 w-5" />
        </a>
      </div>
    </div>
  );
}
