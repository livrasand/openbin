import { useState, useEffect, useRef } from "react";
import { renderField } from "./fields.jsx";

export default function FormPreview() {
  return <FormPreviewInner />;
}

function FormPreviewInner() {
  const [rawJson, setRawJson] = useState("");
  const [schema, setSchema] = useState(null);
  const [parseError, setParseError] = useState("");
  const [state, setState] = useState("idle"); // idle | form | success | error
  const debounceRef = useRef(null);

  function applyTheme(theme) {
    if (!theme) return;
    const r = document.documentElement;
    if (theme.colors) {
      r.style.setProperty(
        "--bg",
        theme.page_background || theme.colors.background_hex || "#fffafa",
      );
      r.style.setProperty(
        "--text",
        theme.colors.text_hex || theme.colors.text_hsl || "#1c1414",
      );
      r.style.setProperty("--accent", theme.colors.primary_hex || "#4a7cf7");
      r.style.setProperty(
        "--surface",
        theme.form_background || theme.colors.card_bg_hex || "#ffffff",
      );
      // Agregar variables faltantes para descripciones y bordes en modo oscuro
      const textColor =
        theme.colors.text_hex || theme.colors.text_hsl || "#1c1414";
      r.style.setProperty("--text-2", "rgba(240, 246, 252, 0.7)");
      r.style.setProperty("--text-3", "rgba(240, 246, 252, 0.5)");
      r.style.setProperty("--border", "rgba(255,255,255,0.1)");
      r.style.setProperty("--surface-2", "rgba(255,255,255,0.05)");
    } else {
      r.style.setProperty(
        "--bg",
        theme.page_background || theme.background || "#fffafa",
      );
      r.style.setProperty("--text", theme.text || "#1c1414");
      r.style.setProperty("--accent", theme.accent || "#4a7cf7");
      r.style.setProperty(
        "--surface",
        theme.form_background || theme.card_bg || "#ffffff",
      );
    }
  }

  function resetTheme() {
    const r = document.documentElement;
    r.style.removeProperty("--bg");
    r.style.removeProperty("--text");
    r.style.removeProperty("--accent");
    r.style.removeProperty("--surface");
  }

  function parseJson(value) {
    if (!value.trim()) {
      setSchema(null);
      setParseError("");
      setState("idle");
      resetTheme();
      return;
    }
    try {
      const s = JSON.parse(value);
      const fields = s.elements || s.fields;
      if ((!s.title && !s.header?.title) || !fields || !Array.isArray(fields)) {
        setParseError("JSON inválido: debe tener title y elements/fields[]");
        setSchema(null);
        setState("idle");
        return;
      }
      applyTheme(s.theme);
      setSchema(s);
      setParseError("");
      setState("form");
    } catch (e) {
      setParseError("Error de sintaxis JSON: " + e.message);
      setSchema(null);
      setState("idle");
    }
  }

  function handleChange(e) {
    const value = e.target.value;
    setRawJson(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => parseJson(value), 400);
  }

  function handleFocus() {
    console.log("Textarea focused");
  }

  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current);
      resetTheme();
    };
  }, []);

  const formBg = schema?.theme?.form_background || "var(--surface, #ffffff)";
  const formBorder = schema?.theme?.colors?.border_cmyk
    ? undefined
    : "1px solid var(--border)";

  return (
    <>
      <Nav solid />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 0,
          minHeight: "calc(100vh - 60px)",
          alignItems: "stretch",
          overflow: "hidden",
          paddingTop: "0px",
          zIndex: 0,
        }}
      >
        {/* Panel izquierdo: editor */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid rgba(255,255,255,0.06)",
            background: "#13131f",
            height: "100%",
            zIndex: 1,
            overflow: "auto",
          }}
        >
          <div
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#0f0f1a",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#ff5f57",
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#febc2e",
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#28c840",
                  display: "inline-block",
                }}
              />
            </span>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 600,
                color: "rgba(255,255,255,0.3)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginLeft: 8,
              }}
            >
              formulario.jform
            </span>
            {parseError && (
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "#ff6b6b",
                  marginLeft: "auto",
                }}
              >
                {parseError}
              </span>
            )}
            {!parseError && schema && (
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "#6bffb8",
                  marginLeft: "auto",
                }}
              >
                ✓ válido
              </span>
            )}
          </div>
          <textarea
            defaultValue={rawJson}
            onChange={handleChange}
            onFocus={handleFocus}
            placeholder={`{\n  "title": "Mi formulario",\n  "elements": [\n    {\n      "id": "name",\n      "type": "text",\n      "label": "Nombre",\n      "required": true\n    }\n  ]\n}`}
            style={{
              resize: "none",
              border: "none",
              outline: "none",
              padding: "20px 20px",
              fontFamily:
                "'Fira Code', 'Cascadia Code', 'Courier New', monospace",
              fontSize: "0.8rem",
              lineHeight: 1.75,
              color: "#c9d1d9",
              background: "transparent",
              caretColor: "#12a0e8",
              height: "calc(100vh - 120px)",
              width: "100%",
            }}
          />
        </div>

        {/* Panel derecho: preview */}
        <div
          style={{
            background: schema?.theme ? "var(--bg, #fffafa)" : "#f5f5f7",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "32px 16px",
          }}
        >
          {state === "idle" && (
            <div
              style={{
                textAlign: "center",
                color: "rgba(0,0,0,0.3)",
                marginTop: "18vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
              }}
            >
              <img
                src="/jform-logo.svg"
                alt="JFORM"
                style={{
                  width: "80px",
                  height: "80px",
                  opacity: 0.45,
                  filter: "invert(1) grayscale(1)",
                }}
              />
              <p
                style={{ fontSize: "0.85rem", lineHeight: 1.6, maxWidth: 260 }}
              >
                Escribe o pega tu JSON{" "}
                <code
                  style={{
                    background: "rgba(0,0,0,0.06)",
                    border: "1px solid rgba(0,0,0,0.1)",
                    borderRadius: 4,
                    padding: "1px 6px",
                    fontSize: "0.8rem",
                  }}
                >
                  .jform
                </code>{" "}
                a la izquierda para ver el preview
              </p>
            </div>
          )}

          {state === "form" && schema && (
            <>
              <div
                className="form-wrap"
                style={{
                  background: formBg,
                  border: formBorder,
                  width: "100%",
                  maxWidth: 560,
                }}
              >
                {schema.header && schema.header.title ? (
                  <h2>{schema.header.title}</h2>
                ) : (
                  <h2>{schema.title}</h2>
                )}
                {(schema.header && schema.header.subtitle) ||
                schema.description ? (
                  <p>{schema.header?.subtitle || schema.description}</p>
                ) : null}
                <form
                  id="f-preview"
                  encType="multipart/form-data"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setState("success");
                  }}
                >
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
                      return (
                        <div key={f.id} style={{ height: f.height || 24 }} />
                      );
                    }

                    if (f.type === "section") {
                      return (
                        <div
                          key={f.id}
                          style={{
                            marginBottom: 8,
                            marginTop: f.margin_top || 8,
                          }}
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

                    const borderStyle =
                      f.border_top ||
                      f.border_bottom ||
                      f.border_left ||
                      f.border_right
                        ? {
                            borderTop: f.border_top || "none",
                            borderBottom: f.border_bottom || "none",
                            borderLeft: f.border_left || "none",
                            borderRight: f.border_right || "none",
                            paddingLeft: f.border_left ? 12 : undefined,
                          }
                        : {};

                    return (
                      <div
                        className="field-group"
                        key={f.id}
                        style={borderStyle}
                      >
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
                  <button type="submit">
                    {schema.settings?.submit_button_text || "Enviar"}
                  </button>
                </form>
              </div>
              <div
                style={{
                  textAlign: "center",
                  padding: "24px 16px 32px",
                  fontSize: "0.78rem",
                  color: "var(--text-2)",
                  lineHeight: 2,
                  width: "100%",
                  maxWidth: 560,
                }}
              >
                <p style={{ margin: "0 0 6px" }}>
                  Datos cifrados y protegidos
                  {" · "}
                  <a
                    href="/forms/terms"
                    style={{
                      color: "var(--text)",
                      textDecoration: "underline",
                    }}
                  >
                    Términos
                  </a>
                  {" · "}
                  <a
                    href="/forms/privacy"
                    style={{
                      color: "var(--text)",
                      textDecoration: "underline",
                    }}
                  >
                    Privacidad
                  </a>
                </p>
                <img
                  src="/jform-logo.svg"
                  alt="JFORM"
                  style={{
                    height: 32,
                    opacity: 0.5,
                    filter: "invert(1)",
                    display: "block",
                    margin: "0 auto",
                  }}
                />
              </div>
            </>
          )}

          {state === "success" && (
            <div
              className="form-wrap"
              style={{
                textAlign: "center",
                padding: "48px 32px",
                background: formBg,
                border: formBorder,
                width: "100%",
                maxWidth: 560,
              }}
            >
              <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>✓</div>
              <h3
                style={{
                  color: "var(--accent)",
                  fontSize: "1.2rem",
                  marginBottom: 8,
                }}
              >
                {schema?.settings?.confirmation_message
                  ? schema.settings.confirmation_message
                  : "¡Gracias!"}
              </h3>
              <p style={{ color: "var(--text-2)", lineHeight: 1.6 }}>
                Tu respuesta fue enviada.
              </p>
              <button
                type="button"
                onClick={() => setState("form")}
                style={{ marginTop: 16, fontSize: "0.82rem" }}
              >
                ← Volver al preview
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
