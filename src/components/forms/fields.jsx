// Funciones de renderizado de campos del motor JFORM.
// Copia de FormView.jsx para reutilizar en el editor (CreateForm.jsx)
// sin modificar el motor existente.
import { useState } from "react";

export function RatingField({ f }) {
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

export function ScaleField({ f }) {
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

export function renderField(f) {
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
