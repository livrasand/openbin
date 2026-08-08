import { useState, useEffect, useRef } from "react";

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

function isBgDark(r, g, b) {
  // Luminancia relativa WCAG 2.1
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

/**
 * @typedef {Object} FormViewProps
 * @property {string} [username]
 * @property {string} [formId]
 * @property {string} [sourceUrl]
 */

/**
 * Motor de renderizado de formularios JFORM.
 * @param {FormViewProps} props
 */
export default function FormView({ username, formId, sourceUrl }) {
  return (
    <FormViewInner username={username} formId={formId} sourceUrl={sourceUrl} />
  );
}

function FormViewInner({ username, formId, sourceUrl }) {
  const lang = "es";
  const [state, setState] = useState("loading"); // loading | form | success | error
  const [schema, setSchema] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [dynamicText, setDynamicText] = useState(null);
  const [dynamicLink, setDynamicLink] = useState(null);
  const [dynamicDark, setDynamicDark] = useState(null);
  // Consentimiento de privacidad: se muestra una vez por navegador.
  const [privacyAccepted, setPrivacyAccepted] = useState(() => {
    try {
      return localStorage.getItem("jform-privacy-consent") === "1";
    } catch {
      return false;
    }
  });
  const footerRef = useRef(null);
  const bgCanvasRef = useRef(null); // canvas offscreen con la imagen de fondo

  useEffect(() => {
    if (!sourceUrl && (!username || !formId)) return;
    loadForm();
  }, [username, formId, lang]);

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
      // Derivar colores secundarios del color de texto principal
      const textColor =
        theme.colors.text_hex || theme.colors.text_hsl || "#1c1414";
      const tc = textColor.replace("#", "");
      const tr = parseInt(tc.substring(0, 2), 16);
      const tg = parseInt(tc.substring(2, 4), 16);
      const tb = parseInt(tc.substring(4, 6), 16);
      r.style.setProperty("--text-2", `rgba(${tr}, ${tg}, ${tb}, 0.65)`);
      r.style.setProperty("--text-3", `rgba(${tr}, ${tg}, ${tb}, 0.4)`);
      r.style.setProperty("--border", `rgba(${tr}, ${tg}, ${tb}, 0.12)`);
      r.style.setProperty("--surface-2", `rgba(${tr}, ${tg}, ${tb}, 0.06)`);
    } else {
      r.style.setProperty(
        "--bg",
        theme.page_background || theme.background || "#fffafa",
      );
      const textColor = theme.text || "#1c1414";
      r.style.setProperty("--text", textColor);
      r.style.setProperty("--accent", theme.accent || "#4a7cf7");
      r.style.setProperty(
        "--surface",
        theme.form_background || theme.card_bg || "#ffffff",
      );
      // Derivar colores secundarios
      const tc = textColor.replace("#", "");
      const tr = parseInt(tc.substring(0, 2), 16);
      const tg = parseInt(tc.substring(2, 4), 16);
      const tb = parseInt(tc.substring(4, 6), 16);
      r.style.setProperty("--text-2", `rgba(${tr}, ${tg}, ${tb}, 0.65)`);
      r.style.setProperty("--text-3", `rgba(${tr}, ${tg}, ${tb}, 0.4)`);
      r.style.setProperty("--border", `rgba(${tr}, ${tg}, ${tb}, 0.12)`);
      r.style.setProperty("--surface-2", `rgba(${tr}, ${tg}, ${tb}, 0.06)`);
    }
  }

  async function loadForm() {
    setState("loading");

    // Modo bin de openbin: cargar el schema desde una URL directa (/raw/{slug})
    if (sourceUrl) {
      try {
        const res = await fetch(sourceUrl);
        if (!res.ok) throw new Error("No se encontró el archivo .jform para este usuario.");
        const s = await res.json();
        const fields = s.elements || s.fields;
        if ((!s.title && !s.header?.title) || !fields || !Array.isArray(fields))
          throw new Error("El archivo .jform tiene una estructura inválida.");

        applyTheme(s.theme);
        document.title = (s.header?.title || s.title) + " - JFORM";

        setSchema(s);
        const hasEndpoint =
          s.endpoint ||
          (s.transport &&
            (s.transport.type === "email" || s.transport.type === "webhook"));
        if (!hasEndpoint) {
          setErrorMsg("El archivo .jform no define un endpoint de envío.");
          setState("error");
        } else {
          setState("form");
        }
        return;
      } catch (err) {
        setErrorMsg(err.message);
        setState("error");
        return;
      }
    }

    const encUser = encodeURIComponent(username);
    const encForm = encodeURIComponent(formId);
    const userRepo = `https://raw.githubusercontent.com/${encUser}/jform/master/forms/${encUser}/${encForm}`;
    const centralRepo = `https://raw.githubusercontent.com/livrasand/jform/master/forms/${encUser}/${encForm}`;

    try {
      let res;
      // Intentar cargar localmente primero (misma origin): openbin despliega
      // public/forms/, así que la ruta local funciona también en producción.
      // GitHub queda como fallback para usuarios externos del protocolo JFORM.
      try {
        res = await fetch(`/forms/${username}/${formId}.jform`);
        if (res.ok) {
          const s = await res.json();
          const elems = s.elements || s.fields;
          if ((s.title || s.header?.title) && elems && Array.isArray(elems)) {
            applyTheme(s.theme);
            document.title = (s.header?.title || s.title) + " - JFORM";
            setSchema(s);
            setState("form");
            return;
          }
        }
      } catch (e) {
        // Fall through to GitHub
      }

      res = await fetch(userRepo + "." + lang + ".jform");
      if (!res.ok) res = await fetch(userRepo + ".jform");
      if (!res.ok) res = await fetch(centralRepo + "." + lang + ".jform");
      if (!res.ok) res = await fetch(centralRepo + ".jform");
      if (!res.ok) throw new Error("No se encontró el archivo .jform para este usuario.");

      const s = await res.json();
      const fields = s.elements || s.fields;
      if ((!s.title && !s.header?.title) || !fields || !Array.isArray(fields))
        throw new Error("El archivo .jform tiene una estructura inválida.");

      applyTheme(s.theme);
      document.title = (s.header?.title || s.title) + " - JFORM";

      setSchema(s);
      const hasEndpoint =
        s.endpoint ||
        (s.transport &&
          (s.transport.type === "email" || s.transport.type === "webhook"));
      if (!hasEndpoint) {
        setErrorMsg("El archivo .jform no define un endpoint de envío.");
        setState("error");
      } else {
        setState("form");
      }
    } catch (err) {
      setErrorMsg(err.message);
      setState("error");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    setSending(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      let r;
      if (schema.transport && schema.transport.type === "email") {
        // Email relay - enviar a /api/send
        fd.append("owner", schema.transport.destination);
        fd.append("form_title", schema.title || schema.header?.title || "Form");
        r = await fetch("/api/send", {
          method: "POST",
          body: fd,
          signal: controller.signal,
        });
      } else if (schema.transport && schema.transport.type === "webhook") {
        // Webhook directo
        r = await fetch(schema.transport.destination, {
          method: "POST",
          body: fd,
          signal: controller.signal,
        });
      } else if (schema.endpoint) {
        // Schema v1 - endpoint directo
        r = await fetch(schema.endpoint, {
          method: "POST",
          body: fd,
          signal: controller.signal,
        });
      } else {
        throw new Error("El archivo .jform no define un endpoint de envío.");
      }

      if (r.ok) {
        setState("success");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        const errText = await r.text();
        throw new Error(
          "El servidor rechazó la petición (HTTP " +
            r.status +
            ")." +
            (errText ? ": " + errText : ""),
        );
      }
    } catch (err) {
      if (err.name === "AbortError") {
        alert("Error: La solicitud tardó demasiado. Verifica tu conexión o intenta de nuevo.");
      } else {
        alert("Error: " + err.message);
      }
    } finally {
      clearTimeout(timeout);
      setSending(false);
    }
  }

  // Cargar imagen de fondo en canvas offscreen para samplear pixels reales
  useEffect(() => {
    if (!schema?.theme?.page_background) return;
    const raw = schema.theme.page_background;
    // Extraer URL de "url('...')" o usar directamente
    const match = raw.match(/url\(['"]?([^'")\s]+)['"]?\)/);
    const src = match ? match[1] : raw;
    if (!src || !src.startsWith("http")) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      bgCanvasRef.current = canvas;
    };
    img.onerror = () => {
      bgCanvasRef.current = null;
    };
    img.src = src;
  }, [schema?.theme?.page_background]);

  // Samplear pixel real del fondo debajo del cursor para adaptar color del texto
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;

    let rafId = null;

    function samplePixelAt(clientX, clientY) {
      const canvas = bgCanvasRef.current;
      if (!canvas) return null;
      // Proporción de la posición en pantalla respecto a la página entera
      const px = Math.round((clientX / window.innerWidth) * canvas.width);
      const py = Math.round((clientY / window.innerHeight) * canvas.height);
      try {
        const ctx = canvas.getContext("2d");
        const data = ctx.getImageData(
          Math.min(px, canvas.width - 1),
          Math.min(py, canvas.height - 1),
          1,
          1,
        ).data;
        return { r: data[0], g: data[1], b: data[2] };
      } catch {
        return null;
      }
    }

    function onMove(e) {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const pixel = samplePixelAt(e.clientX, e.clientY);
        if (!pixel) return;

        const { r, g, b } = pixel;
        const [h] = rgbToHsl(r, g, b);
        const dark = isBgDark(r, g, b);
        const compHue = (h + 180) % 360;
        const textL = dark ? 92 : 8;
        const textColor = `hsl(${compHue}, 60%, ${textL}%)`;
        const linkColor = `hsl(${(compHue + 30) % 360}, 75%, ${textL}%)`;

        setDynamicText(textColor);
        setDynamicLink(linkColor);
        setDynamicDark(dark);
      });
    }

    function onLeave() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      setDynamicText(null);
      setDynamicLink(null);
      setDynamicDark(null);
    }

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="form-wrap">
        <div className="loading">
          <div className="spinner"></div>
          <p>Cargando formulario...</p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div
        className="form-wrap"
        style={{
          textAlign: "center",
          padding: "clamp(32px, 6vw, 48px) clamp(20px, 4vw, 32px)",
        }}
      >
        <p className="error-msg">{errorMsg}</p>
        {errorMsg === "No se encontró el archivo .jform para este usuario." && (
          <p
            style={{
              color: "var(--text-2)",
              fontSize: "0.85rem",
              marginTop: 12,
            }}
          >
            <span
              dangerouslySetInnerHTML={{ __html: "Asegúrate de que el archivo exista en <code>forms/" }}
            />
            {username}/{formId}
            <span
              dangerouslySetInnerHTML={{ __html: ".jform</code>" }}
            />
          </p>
        )}
        {errorMsg === "El archivo .jform no define un endpoint de envío." && (
          <p
            style={{
              color: "var(--text-2)",
              fontSize: "0.85rem",
              marginTop: 12,
            }}
          >
            {errorMsg}
          </p>
        )}
      </div>
    );
  }

  if (state === "success") {
    const confirmMsg = schema?.settings?.confirmation_message;
    const formBgSuccess =
      schema?.theme?.form_background || "var(--surface, #ffffff)";
    const formBorderSuccess = schema?.theme?.colors?.border_cmyk
      ? undefined
      : "1px solid var(--border)";
    return (
      <div
        className="form-wrap"
        style={{
          textAlign: "center",
          padding: "clamp(32px, 6vw, 48px) clamp(20px, 4vw, 32px)",
          background: formBgSuccess,
          border: formBorderSuccess,
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
          {confirmMsg ? confirmMsg : "¡Gracias!"}
        </h3>
        <p style={{ color: "var(--text-2)", lineHeight: 1.6 }}>
          Tu respuesta fue enviada.
        </p>
      </div>
    );
  }

  function acceptPrivacy() {
    try {
      localStorage.setItem("jform-privacy-consent", "1");
    } catch {
      // localStorage no disponible: el modal se mostrará en la próxima visita
    }
    setPrivacyAccepted(true);
  }

  const formBg = schema.theme?.form_background || "var(--surface, #ffffff)";
  const formBorder = schema.theme?.colors?.border_cmyk
    ? undefined
    : "1px solid var(--border)";

  return (
    <>
      <style>{`
@media (max-width: 640px) {
  iframe {
    min-height: 200px !important;
  }
  .field-group input,
  .field-group select,
  .field-group textarea {
    font-size: 16px !important; /* evita zoom en iOS */
  }
  .form-footer {
    max-width: calc(100% - 32px) !important;
    margin-left: auto !important;
    margin-right: auto !important;
  }
}
`}</style>
      <div
        className="form-wrap"
        style={{ background: formBg, border: formBorder }}
      >
        {schema.header && schema.header.title ? (
          <h2>{schema.header.title}</h2>
        ) : (
          <h2>{schema.title}</h2>
        )}
        {(schema.header && schema.header.subtitle) || schema.description ? (
          <p>{schema.header?.subtitle || schema.description}</p>
        ) : null}
        <form id="f" encType="multipart/form-data" onSubmit={handleSubmit}>
          {(schema.elements || schema.fields).map((f) => {
            if (!f.id || !f.type) return null;

            // Salto / separador
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

            // Espacio en blanco
            if (f.type === "spacer") {
              return <div key={f.id} style={{ height: f.height || 24 }} />;
            }

            // Título de sección
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

            // Bordes por lado opcionales
            const borderStyle =
              f.border_top || f.border_bottom || f.border_left || f.border_right
                ? {
                    borderTop: f.border_top || "none",
                    borderBottom: f.border_bottom || "none",
                    borderLeft: f.border_left || "none",
                    borderRight: f.border_right || "none",
                    paddingLeft: f.border_left ? 12 : undefined,
                  }
                : {};

            return (
              <div className="field-group" key={f.id} style={borderStyle}>
                <label htmlFor={f.id}>
                  {f.label}
                  {f.required ? <span className="required-mark">*</span> : ""}
                </label>
                {f.description && (
                  <span className="description">{f.description}</span>
                )}
                {renderField(f)}
              </div>
            );
          })}
          <button type="submit" disabled={sending}>
            {sending
              ? "Enviando..."
              : schema.settings?.submit_button_text || "Enviar"}
          </button>
        </form>
      </div>
      <div
        ref={footerRef}
        className="form-footer"
        style={{
          textAlign: "center",
          padding:
            "clamp(16px, 4vw, 24px) clamp(12px, 3vw, 16px) clamp(24px, 5vw, 32px)",
          fontSize: "clamp(0.72rem, 2vw, 0.82rem)",
          color: dynamicText || "var(--text-2)",
          lineHeight: 2,
          maxWidth: 770,
          margin: "0 auto 48px",
          width: "100%",
          boxSizing: "border-box",
          borderRadius: 16,
          transition: "color 0.4s ease",
        }}
      >
        <p style={{ margin: "0 0 6px" }}>
          Datos cifrados y protegidos
          {" · "}
          <a
            href="/forms/terms"
            style={{
              color: dynamicLink || "var(--text)",
              textDecoration: "underline",
              transition: "color 0.4s ease",
            }}
          >
            Términos
          </a>
          {" · "}
          <a
            href="/forms/privacy"
            style={{
              color: dynamicLink || "var(--text)",
              textDecoration: "underline",
              transition: "color 0.4s ease",
            }}
          >
            Privacidad
          </a>
        </p>
        <p style={{ margin: "0 0 16px" }}>
          ¿Ves algo sospechoso?{" "}
          <a
            href="https://github.com/livrasand/jform/issues"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: dynamicLink || "var(--text-2)",
              textDecoration: "underline",
              transition: "color 0.4s ease",
            }}
          >
            Repórtalo
          </a>
        </p>
        <img
          src="/jform-logo.svg"
          alt="JFORM"
          className="form-footer-logo"
          style={{
            height: "clamp(24px, 4vw, 32px)",
            opacity: 0.6,
            filter:
              dynamicDark === null
                ? "invert(1)"
                : dynamicDark
                  ? "invert(1)"
                  : "none",
            display: "block",
            margin: "0 auto",
            transition: "filter 0.4s ease, opacity 0.4s ease",
          }}
        />
      </div>

      {state === "form" && !privacyAccepted && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tu privacidad"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              maxWidth: 460,
              width: "100%",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius, 16px)",
              padding: "28px 26px",
              boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
              color: "var(--text)",
              fontFamily: "var(--font)",
              textAlign: "left",
              maxHeight: "90vh",
              overflowY: "auto",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 16,
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flexShrink: 0 }}
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              <h2
                style={{
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  margin: 0,
                  color: "var(--text)",
                }}
              >
                Tu privacidad
              </h2>
            </div>

            <p
              style={{
                fontSize: "0.9rem",
                lineHeight: 1.65,
                color: "var(--text-2)",
                margin: "0 0 18px",
              }}
            >
              Openbin no recopila tus datos personales. Lo que escribas en este formulario está protegido: nadie, ni Openbin ni el proveedor de correo, puede verlo. Solo tú y el autor del formulario.
            </p>

            <ul
              style={{
                listStyle: "none",
                margin: "0 0 22px",
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {[
                "No almacenamos tus respuestas en ningún servidor.",
                "Los datos se envían cifrados y solo el autor del formulario puede leerlos.",
                "No usamos cookies de seguimiento ni construimos perfiles de usuario.",
              ].map(
                (point, i) => (
                  <li
                    key={i}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      fontSize: "0.88rem",
                      lineHeight: 1.55,
                      color: "var(--text-2)",
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ flexShrink: 0, marginTop: 3 }}
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    <span>{point}</span>
                  </li>
                ),
              )}
            </ul>

            <a
              href="/forms/privacy"
              style={{
                display: "block",
                fontSize: "0.78rem",
                color: "var(--text-3)",
                textAlign: "center",
                textDecoration: "underline",
                marginBottom: 16,
              }}
            >
              Saber más
            </a>

            <button
              type="button"
              onClick={acceptPrivacy}
              style={{
                width: "100%",
                padding: "12px 0",
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm, 10px)",
                fontSize: "0.92rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "opacity 0.18s ease",
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function RatingField({ f }) {
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const stars = f.max_stars || 5;
  const name = f.id;

  return (
    <div className="rating-group">
      {Array.from({ length: stars }, (_, i) => i + 1).map((v) => (
        <label
          key={v}
          className="rating-star"
          style={{
            color:
              v <= (hovered ?? selected ?? 0) ? "#f5a623" : "var(--border)",
          }}
          onMouseEnter={() => setHovered(v)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => setSelected(v)}
        >
          <input
            type="radio"
            name={name}
            value={v}
            required={f.required || false}
            checked={selected === v}
            onChange={() => setSelected(v)}
            style={{ display: "none" }}
          />
          ★
        </label>
      ))}
    </div>
  );
}

function ScaleField({ f }) {
  const [selected, setSelected] = useState(null);
  const min = f.min || 1;
  const max = f.max || 5;
  const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const name = f.id;

  // Colores segmentados por porcentajes
  const scaleColors = f.scale_colors || [];
  const totalPct = scaleColors.reduce((sum, c) => sum + (c.pct || 0), 0);
  const normalizedColors =
    totalPct > 0
      ? scaleColors.map((c) => ({
          color: c.color,
          pct: ((c.pct || 0) / totalPct) * 100,
        }))
      : [];

  function getColorForStep(stepIndex) {
    if (normalizedColors.length === 0) return null;
    const threshold = ((stepIndex + 1) / steps.length) * 100;
    let cumulative = 0;
    for (const c of normalizedColors) {
      cumulative += c.pct;
      if (threshold <= cumulative) return c.color;
    }
    return null;
  }

  return (
    <div className="scale-group">
      {(f.min_label || f.max_label) && (
        <div className="scale-labels">
          {f.min_label && (
            <span
              className="scale-label scale-label--min"
              style={
                f.min_label_color ? { color: f.min_label_color } : undefined
              }
            >
              {f.min_label}
            </span>
          )}
          {f.max_label && (
            <span
              className="scale-label scale-label--max"
              style={
                f.max_label_color ? { color: f.max_label_color } : undefined
              }
            >
              {f.max_label}
            </span>
          )}
        </div>
      )}
      <div className="scale-options">
        {steps.map((v, i) => {
          const optionColor = getColorForStep(i);
          const optionStyle = optionColor
            ? { "--option-color": optionColor }
            : undefined;
          const scaleStyle = f.scale_style || "default";
          // La barra de color superior (::before) va SIEMPRE que haya color
          const barClass = optionColor ? " scale-option--colored" : "";
          // El estilo del borde lo controla scale_style
          const styleClass =
            scaleStyle === "bordered"
              ? " scale-option--colored-border"
              : scaleStyle === "borderless"
                ? " scale-option--borderless"
                : "";
          const optionClass =
            "scale-option" +
            (selected === v ? " scale-option--selected" : "") +
            barClass +
            styleClass;
          return (
            <label key={v} className={optionClass} style={optionStyle}>
              <input
                type="radio"
                name={name}
                value={v}
                required={f.required || false}
                checked={selected === v}
                onChange={() => setSelected(v)}
              />
              <span>{v}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function renderField(f) {
  const id = f.id;
  const name = f.id;
  const placeholder = f.placeholder || "";

  if (f.type === "select") {
    return (
      <select id={id} name={name} required={f.required || false}>
        {f.options && f.options.length > 0
          ? f.options.map((o, i) => (
              <option key={i} value={o.value}>
                {o.label}
              </option>
            ))
          : null}
      </select>
    );
  }
  if (f.type === "textarea") {
    return (
      <textarea
        id={id}
        name={name}
        rows={f.rows || 4}
        placeholder={placeholder}
        required={f.required || false}
      />
    );
  }
  if (f.type === "file") {
    return (
      <input
        type="file"
        id={id}
        name={name}
        accept={f.accept || "*"}
        required={f.required || false}
      />
    );
  }
  if (f.type === "radio") {
    return (
      <div className="option-group">
        {(f.options || []).map((o, i) => (
          <label key={i} className="option-item">
            <input
              type="radio"
              name={name}
              value={o.value}
              required={f.required || false}
            />
            {o.label}
          </label>
        ))}
      </div>
    );
  }
  if (f.type === "checkbox") {
    return (
      <div className="option-group">
        {(f.options || []).map((o, i) => (
          <label key={i} className="option-item">
            <input type="checkbox" name={`${name}[]`} value={o.value} />
            {o.label}
          </label>
        ))}
      </div>
    );
  }
  if (f.type === "scale") {
    return <ScaleField f={f} />;
  }
  if (f.type === "rating") {
    return <RatingField f={f} />;
  }
  if (f.type === "radio_grid" || f.type === "checkbox_grid") {
    const inputType = f.type === "radio_grid" ? "radio" : "checkbox";
    return (
      <div>
        <div className="grid-desktop" style={{ overflowX: "auto" }}>
          <table className="grid-table">
            <thead>
              <tr>
                <th></th>
                {(f.columns || []).map((col) => (
                  <th key={col.id}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(f.rows || []).map((row) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  {(f.columns || []).map((col) => (
                    <td key={col.id} data-label={col.label}>
                      <input
                        type={inputType}
                        name={
                          inputType === "radio"
                            ? `${name}_${row.id}`
                            : `${name}_${row.id}[]`
                        }
                        value={col.id}
                        required={
                          (f.required && inputType === "radio") || false
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid-mobile">
          {(f.rows || []).map((row) => (
            <div key={row.id} className="grid-mobile-row">
              <div className="grid-mobile-row-label">{row.label}</div>
              <div className="grid-mobile-options">
                {(f.columns || []).map((col) => (
                  <label
                    key={col.id}
                    className="option-item"
                    style={{ marginBottom: 0 }}
                  >
                    <input
                      type={inputType}
                      name={
                        inputType === "radio"
                          ? `${name}_${row.id}`
                          : `${name}_${row.id}[]`
                      }
                      value={col.id}
                      required={(f.required && inputType === "radio") || false}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (f.type === "image_selection") {
    const selectionMode = f.selection_mode || "single";
    const inputType = selectionMode === "single" ? "radio" : "checkbox";
    return (
      <div className="image-selection-group">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {(f.image_options || []).map((opt, i) => (
            <label
              key={i}
              className="image-option-item"
              style={{
                position: "relative",
                cursor: "pointer",
                borderRadius: 10,
                overflow: "hidden",
                flex: "1 1 calc(50% - 12px)",
                minWidth: 140,
                aspectRatio: "4/3",
                display: "block",
              }}
            >
              <input
                type={inputType}
                name={name}
                value={opt.value}
                required={f.required && selectionMode === "single"}
                style={{ display: "none" }}
                onChange={(e) => {
                  const allLabels = e.target
                    .closest(".image-selection-group")
                    .querySelectorAll(".image-option-item");
                  allLabels.forEach((l) => l.classList.remove("selected"));
                  if (e.target.checked)
                    e.target
                      .closest(".image-option-item")
                      .classList.add("selected");
                }}
              />
              <img
                src={opt.url}
                alt={opt.label}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                  transition: "transform 0.2s",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: "linear-gradient(transparent, rgba(0,0,0,0.55))",
                  padding: "24px 10px 10px",
                  color: "#fff",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                }}
              >
                {opt.label}
              </div>
              <div
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  width: 22,
                  height: 22,
                  borderRadius: selectionMode === "single" ? "50%" : 4,
                  border: "2px solid #fff",
                  background: "rgba(255,255,255,0.25)",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                }}
              />
              <style>{`
                .image-option-item.selected img { outline: none; }
                .image-option-item.selected > div:last-child {
                  background: var(--accent);
                  border-color: var(--accent);
                }
                .image-option-item.selected {
                  outline: 3px solid var(--accent);
                  outline-offset: 2px;
                }
              `}</style>
            </label>
          ))}
        </div>
      </div>
    );
  }
  if (f.type === "csat") {
    const scale = f.scale || 5;
    const labels = f.csat_labels || [];
    const emojis = ["😠", "😞", "😐", "🙂", "😃"];
    return (
      <div className="csat-group">
        {f.hide_on_mobile && (
          <style>{`
            @media (max-width: 639px) {
              .csat-labels-text {
                display: none !important;
              }
            }
          `}</style>
        )}
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
        >
          {Array.from({ length: scale }, (_, i) => i + 1).map((v) => (
            <label
              key={v}
              className="csat-option"
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                cursor: "pointer",
                padding: 12,
                border: "2px solid var(--border)",
                borderRadius: 8,
                transition: "all 0.2s",
              }}
            >
              <input
                type="radio"
                name={name}
                value={v}
                required={f.required || false}
                style={{ display: "none" }}
              />
              <span
                style={{
                  fontSize: "2rem",
                  marginBottom: 4,
                }}
              >
                {emojis[v - 1] || "😐"}
              </span>
              <span
                className="csat-labels-text"
                style={{
                  fontSize: "0.75rem",
                  textAlign: "center",
                  color: "var(--text-2)",
                }}
              >
                {labels[v - 1] || ""}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  }
  if (f.type === "cta") {
    const isSecondary = f.button_style === "secondary";
    return (
      <div className="cta-group">
        <a
          href={f.button_url || "#"}
          target={f.open_in_new_tab !== false ? "_blank" : undefined}
          rel={f.open_in_new_tab !== false ? "noopener noreferrer" : undefined}
          style={{
            display: "inline-block",
            backgroundColor: isSecondary ? "#6b7280" : "var(--accent)",
            color: "#fff",
            padding: "12px 24px",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 600,
            transition: "opacity 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          {f.button_text || "Click here"}
        </a>
      </div>
    );
  }
  return (
    <input
      type={f.type}
      id={id}
      name={name}
      placeholder={placeholder}
      required={f.required || false}
    />
  );
}
