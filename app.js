const canvas = document.querySelector("#canvas");
const layersEl = document.querySelector("#layers");
const form = document.querySelector("#inspector-form");
const emptyInspector = document.querySelector("#empty-inspector");
const originalInspector = document.querySelector("#original-inspector");
const baseUpload = document.querySelector("#base-upload");
const imageUpload = document.querySelector("#image-upload");
let temp;
let items = [],
  originals = [],
  erasedOriginals = [],
  selected = null,
  id = 0,
  baseSrc = "picture-studio-base.png";
let exportCanvas = null;
let replacementTarget = null;
const CANVAS_W = 648,
  CANVAS_H = 810,
  OUTPUT_W = 1080,
  OUTPUT_H = 1350;
const SCALE_X = OUTPUT_W / CANVAS_W,
  SCALE_Y = OUTPUT_H / CANVAS_H;
const SECTION_MASK_TOP = 100,
  SECTION_MASK_HEIGHT = CANVAS_H - SECTION_MASK_TOP;
const sectionsEl = document.querySelector("#sections");
const sections = [
  {
    id: "header",
    name: "Property header",
    sourceY: 110,
    height: 222,
    zIndex: 1,
  },
  {
    id: "description",
    name: "Description",
    sourceY: 331,
    height: 88,
    zIndex: 1,
  },
  { id: "gallery", name: "Photo gallery", sourceY: 419, height: 100, zIndex: 1 },
  {
    id: "contacts",
    name: "Contact cards",
    sourceY: 519,
    height: 90,
    zIndex: 1,
  },
  {
    id: "footer",
    name: "Footer & disclosures",
    sourceY: 609,
    height: CANVAS_H - 609,
    zIndex: 1,
  },
];
const sectionOffsets = Object.fromEntries(
  sections.map((section) => [section.id, 0]),
);
const sectionById = (id) => sections.find((section) => section.id === id);
const sectionY = (id) => sectionById(id).sourceY + sectionOffsets[id];
const zoneSection = (zone) =>
  zone.section ||
  sections.find(
    (section) =>
      zone.y >= section.sourceY && zone.y < section.sourceY + section.height,
  )?.id;
function renderSections() {
  sectionsEl.innerHTML = "";
  sections.forEach((section) => {
    const row = document.createElement("div");
    row.className = "section-row";
    row.innerHTML = `<span>${section.name} <small>${sectionOffsets[section.id] > 0 ? "+" : ""}${sectionOffsets[section.id]} px</small></span><input aria-label="${section.name} Z-index" type="number" min="0" max="99" value="${section.zIndex}" title="Z-index" /><button aria-label="Move ${section.name} up 1 pixel">↑</button><button aria-label="Move ${section.name} down 1 pixel">↓</button>`;
    const [zIndex] = row.querySelectorAll("input");
    const [up, down] = row.querySelectorAll("button");
    zIndex.oninput = (e) => {
      section.zIndex = Number(e.target.value);
      renderSectionSlices();
    };
    up.onclick = () => nudgeSection(section.id, -1);
    down.onclick = () => nudgeSection(section.id, 1);
    sectionsEl.append(row);
  });
}
function renderSectionSlices() {
  document
    .querySelectorAll(".section-mask,.section-slice")
    .forEach((el) => el.remove());
  const mask = document.createElement("div");
  mask.className = "section-mask";
  Object.assign(mask.style, {
    left: "0px",
    top: SECTION_MASK_TOP + "px",
    width: CANVAS_W + "px",
    height: SECTION_MASK_HEIGHT + "px",
  });
  canvas.append(mask);
  sections.forEach((section) => {
    const slice = document.createElement("div");
    slice.className = "section-slice";
    Object.assign(slice.style, {
      left: "0px",
      top: sectionY(section.id) + "px",
      width: CANVAS_W + "px",
      height: section.height + "px",
      zIndex: section.zIndex,
      backgroundImage: `url(${baseSrc})`,
      backgroundSize: `${CANVAS_W}px ${CANVAS_H}px`,
      backgroundPosition: `0 -${section.sourceY}px`,
    });
    canvas.append(slice);
  });
}
function nudgeSection(id, delta) {
  sectionOffsets[id] += delta;
  [...items, ...originals].forEach((item) => {
    if (zoneSection(item) === id) {
      item.y += delta;
      if (item.type !== "original") updateElement(item);
    }
  });
  renderSections();
  renderSectionSlices();
  installHotspots();
}
function resetSectionPositions() {
  sections.forEach((section) => {
    const delta = -sectionOffsets[section.id];
    if (!delta) return;
    sectionOffsets[section.id] = 0;
    [...items, ...originals].forEach((item) => {
      if (zoneSection(item) === section.id) {
        item.y += delta;
        if (item.type !== "original") updateElement(item);
      }
    });
  });
  renderSections();
  renderSectionSlices();
  installHotspots();
}

const $ = (s) => document.querySelector(s);
if (location.protocol === "file:") $("#local-warning").hidden = false;
const newId = () => `layer-${++id}`;
function addText() {
  add({
    id: newId(),
    type: "text",
    name: "New text",
    x: 54,
    y: 48,
    width: 270,
    height: 70,
    text: "Double-click to edit",
    font: "Arial, sans-serif",
    size: 28,
    color: "#ffffff",
    background: "transparent",
    weight: "700",
    align: "left",
    lineHeight: 1.17,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    opacity: 100,
    radius: 0,
    zIndex: 4,
  });
}
function addImage(src, name = "Picture") {
  add({
    id: newId(),
    type: "image",
    name,
    x: 68,
    y: 84,
    width: 220,
    height: 160,
    src,
    opacity: 100,
    radius: 0,
    zIndex: 4,
  });
}
function add(data) {
  items.push(data);
  render(data);
  select(data.id);
}
const templateZones = [
  {
    label: "Main property photo",
    type: "image",
    x: 255,
    y: 110,
    width: 393,
    height: 222,
  },
  {
    label: "Address",
    type: "text",
    x: 32,
    y: 163,
    width: 207,
    height: 38,
    text: "1124 Kingham Drive,\nChesterfield, VA 23114",
    size: 16,
    color: "#ffffff",
    background: "transparent",
    maskType: "bluePanel",
  },
  {
    label: "Home facts",
    type: "text",
    x: 35,
    y: 213,
    width: 147,
    height: 77,
    text: "5 Bed\n4.5 Bath\n4,272 sqft\nBuilt 2003",
    size: 14,
    color: "#ffffff",
    background: "transparent",
    maskType: "bluePanel",
  },
  {
    label: "Price",
    type: "text",
    x: 37,
    y: 299,
    width: 135,
    height: 34,
    text: "$815,000",
    size: 24,
    color: "#ffffff",
    background: "transparent",
    weight: "900",
    maskType: "bluePanel",
  },
  {
    label: "Property description",
    type: "text",
    x: 28,
    y: 331,
    width: 591,
    height: 66,
    text: "Welcome to this stunning 5-bedroom, 4.5-bath home in the highly sought-after Kingham section of The Grove, where timeless style meets modern luxury. Beautiful hardwood floors flow throughout the first and second levels, creating a warm and elegant feel from the moment you step inside.",
    size: 10,
    color: "#14213b",
    background: "#ffffff",
  },
  {
    label: "Exterior thumbnail",
    type: "image",
    x: 22,
    y: 419,
    width: 140,
    height: 93,
  },
  {
    label: "Living-room thumbnail",
    type: "image",
    x: 178,
    y: 417,
    width: 140,
    height: 93,
  },
  {
    label: "Family-room thumbnail",
    type: "image",
    x: 334,
    y: 421,
    width: 140,
    height: 93,
  },
  {
    label: "Dining-room thumbnail",
    type: "image",
    x: 486,
    y: 420,
    width: 140,
    height: 93,
  },
  {
    label: "Lender portrait",
    type: "image",
    x: 17,
    y: 521,
    width: 68,
    height: 87,
  },
  {
    label: "Lender details",
    type: "text",
    x: 90,
    y: 520,
    width: 216,
    height: 60,
    text: "Marshall Hawkins\nVP of Mortgage Lending, NMLS# 1756757\nC: (804) 381-8067\nrate.com/marshallhawkins",
    size: 10,
    color: "#14213b",
    background: "#ffffff",
  },
  {
    label: "Agent portrait",
    type: "image",
    x: 327,
    y: 520,
    width: 74,
    height: 90,
  },
  {
    label: "Agent details",
    type: "text",
    x: 406,
    y: 520,
    width: 148,
    height: 65,
    text: "Meagan Arline\nAgent license #0225235913\n(804) 625-5096\nsbrgrealestate.com",
    size: 10,
    color: "#14213b",
    background: "#ffffff",
  },
  {
    label: "Rate footer logo",
    type: "image",
    x: 22,
    y: 611,
    width: 84,
    height: 24,
    section: "footer",
  },
  {
    label: "Footer company line",
    type: "text",
    x: 112,
    y: 618,
    width: 219,
    height: 14,
    text: "Operating as Guaranteed Rate, Inc. in New York.",
    size: 7,
    color: "#14213b",
    background: "#ffffff",
    section: "footer",
  },
  {
    label: "Legal disclosure",
    type: "text",
    x: 20,
    y: 640,
    width: 603,
    height: 45,
    text: "Applicant subject to credit and underwriting approval. Not all applicants will be approved for financing. Receipt of application does not represent an approval for financing or interest rate guarantee. Refinancing your mortgage may increase over the term of your loan. Restrictions may apply, contact Rate for current rates and for more information.\nMarshall Hawkins NMLS #1756757. Applicant subject to credit and underwriting approval. Restrictions apply. Guaranteed Rate, Inc. dba Rate; NMLS #2611; For licensing information visit nmlsconsumeraccess.org. GA - Residential Mortgage Licensee #20973.",
    size: 8,
    color: "#14213b",
    background: "#ffffff",
    section: "footer",
  },
  {
    label: "broker logo",
    type: "image",
    x: 413,
    y: 575,
    width: 40,
    height: 40,
    section: "footer",
  },
];
function resolvedZone(zone) {
  const section = zoneSection(zone);
  return {
    ...zone,
    section,
    y: zone.y + (sectionY(section) - sectionById(section).sourceY),
  };
}
function installHotspots() {
  const holder = $("#hotspots");
  holder.innerHTML = "";
  templateZones.forEach((zone, n) => {
    const active = resolvedZone(zone),
      b = document.createElement("button");
    b.className = "hotspot";
    b.type = "button";
    b.dataset.label = active.label;
    b.style.cssText = `left:${active.x}px;top:${active.y}px;width:${active.width}px;height:${active.height}px`;
    b.onclick = () => activateZone(active, n);
    holder.append(b);
  });
}
function addOriginal(zone, zoneIndex) {
  if (originals.some((item) => item.zone === zoneIndex)) return;
  originals.push({
    id: newId(),
    type: "original",
    name: `Original · ${zone.label}`,
    x: zone.x,
    y: zone.y,
    width: zone.width,
    height: zone.height,
    background:
      zone.maskType === "bluePanel"
        ? "linear-gradient(105deg, #256db2 0%, #15579c 100%)"
        : zone.background || "#ffffff",
    maskType: zone.maskType,
    zone: zoneIndex,
    section: zone.section,
    zIndex: 0,
  });
  renderLayers();
}
function activateZone(zone, zoneIndex) {
  const existing = items.find((i) => i.zone === zoneIndex);
  if (existing) {
    select(existing.id);
    return;
  }
  addOriginal(zone, zoneIndex);
  if (zone.type === "image") {
    replacementTarget = { zone, zoneIndex };
    imageUpload.click();
    return;
  }
  const layer = {
    id: newId(),
    type: "text",
    name: zone.label,
    x: zone.x,
    y: zone.y,
    width: zone.width,
    height: zone.height,
    text: zone.text,
    font: "Arial, sans-serif",
    size: zone.size,
    color: zone.color,
    background: zone.background,
    weight: zone.weight || "400",
    align: "left",
    opacity: 100,
    radius: 0,
    zone: zoneIndex,
    section: zone.section,
  };
  add(layer);
  setTimeout(() => $("textarea#text-content")?.focus(), 20);
}
function render(item) {
  const tpl = $(`#${item.type}-template`).content.firstElementChild.cloneNode(
    true,
  );
  tpl.id = item.id;
  canvas.append(tpl);
  updateElement(item);
  bindElement(tpl, item);
  renderLayers();
}
function updateElement(item) {
  const el = document.getElementById(item.id);
  if (!el) return;
  Object.assign(el.style, {
    left: item.x + "px",
    top: item.y + "px",
    width: item.width + "px",
    height: item.height + "px",
    opacity: item.opacity / 100,
    borderRadius: item.radius + "px",
    zIndex: item.zIndex ?? 4,
    backgroundColor: item.background || "transparent",
  });
  if (item.type === "text") {
    const c = el.querySelector(".content");
    c.innerHTML = item.html || escapeHtml(item.text).replace(/\n/g, "<br>");
    Object.assign(c.style, {
      fontFamily: item.font,
      fontSize: item.size + "px",
      fontWeight: item.weight,
      color: item.color,
      textAlign: item.align,
      lineHeight: item.lineHeight ?? 1.17,
      padding: `${item.paddingTop ?? item.padding ?? 0}px ${item.paddingRight ?? item.padding ?? 0}px ${item.paddingBottom ?? item.padding ?? 0}px ${item.paddingLeft ?? item.padding ?? 0}px`,
      boxSizing: "border-box",
    });
  } else el.querySelector("img").src = item.src;
  renderLayers();
}
function select(layerId) {
  selected = [...items, ...originals].find((i) => i.id === layerId) || null;
  document
    .querySelectorAll(".element")
    .forEach((e) => e.classList.toggle("selected", e.id === layerId));
  renderLayers();
  renderInspector();
}
function renderLayers() {
  const all = [...originals, ...items];
  layersEl.innerHTML = all.length
    ? ""
    : '<p class="empty">Add text or a picture to begin.</p>';
  [...all].reverse().forEach((item) => {
    const b = document.createElement("button");
    b.className = "layer " + (selected?.id === item.id ? "selected" : "");
    const icon =
      item.type === "text" ? "T" : item.type === "original" ? "0" : "▧";
    b.innerHTML = `<span class="layer-icon">${icon}</span><span class="layer-name">${escapeHtml(item.name)}</span>`;
    b.onclick = () => select(item.id);
    layersEl.append(b);
  });
}
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
function renderInspector() {
  if (!selected) {
    form.hidden = true;
    originalInspector.hidden = true;
    emptyInspector.hidden = false;
    emptyInspector.querySelector("h2").textContent = "Style your design";
    emptyInspector.querySelector("p").textContent =
      "Choose a text or picture layer to change its look.";
    return;
  }
  if (selected.type === "original") {
    form.hidden = true;
    emptyInspector.hidden = true;
    originalInspector.hidden = false;
    $("#original-z-index").value = selected.zIndex ?? 0;
    return;
  }
  form.hidden = false;
  originalInspector.hidden = true;
  emptyInspector.hidden = true;
  $("#layer-name").textContent = selected.type === "text" ? "Text" : "Picture";
  $("#text-controls").hidden = selected.type !== "text";
  $("#image-controls").hidden = selected.type !== "image";
  if (selected.type === "text") {
    $("#text-content").innerHTML =
      selected.html || escapeHtml(selected.text).replace(/\n/g, "<br>");
    $("#font-family").value = selected.font;
    $("#font-size").value = selected.size;
    $("#text-color").value = selected.color;
    $("#text-background").value =
      selected.background && selected.background !== "transparent"
        ? selected.background
        : "#ffffff";
    $("#background-none").checked =
      !selected.background || selected.background === "transparent";
    $("#font-weight").value = selected.weight;
    $("#text-align").value = selected.align;
    $("#line-height").value = selected.lineHeight ?? 1.17;
    $("#padding-top").value = selected.paddingTop ?? selected.padding ?? 0;
    $("#padding-right").value = selected.paddingRight ?? selected.padding ?? 0;
    $("#padding-bottom").value = selected.paddingBottom ?? selected.padding ?? 0;
    $("#padding-left").value = selected.paddingLeft ?? selected.padding ?? 0;
  }
  $("#layer-z-index").value = selected.zIndex ?? 4;
  $("#opacity").value = selected.opacity;
  $("#opacity-value").value = selected.opacity + "%";
  $("#border-radius").value = selected.radius;
  $("#layer-width").value = Math.round(selected.width);
  $("#layer-height").value = Math.round(selected.height);
  $("#radius-field").style.visibility =
    selected.type === "image" ? "visible" : "hidden";
}
function bindElement(el, item) {
  el.addEventListener("pointerdown", (e) => {
    if (e.target.classList.contains("resize-handle"))
      return resizeStart(e, item);
    select(item.id);
    const r = canvas.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, ox: item.x, oy: item.y };
    el.setPointerCapture(e.pointerId);
    const move = (ev) => {
      item.x = Math.max(
        0,
        Math.min(CANVAS_W - item.width, start.ox + ev.clientX - start.x),
      );
      item.y = Math.max(
        0,
        Math.min(CANVAS_H - item.height, start.oy + ev.clientY - start.y),
      );
      updateElement(item);
    };
    const end = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
  });
  if (item.type === "text")
    el.addEventListener("dblclick", () => {
      const next = prompt("Update text", item.text);
      if (next !== null) {
        item.text = next;
        item.name = next.split("\n")[0].slice(0, 28) || "Text";
        updateElement(item);
        renderInspector();
      }
    });
}
function resizeStart(e, item) {
  e.stopPropagation();
  select(item.id);
  const el = document.getElementById(item.id),
    start = { x: e.clientX, y: e.clientY, w: item.width, h: item.height };
  el.setPointerCapture(e.pointerId);
  const move = (ev) => {
    item.width = Math.max(40, start.w + ev.clientX - start.x);
    item.height = Math.max(24, start.h + ev.clientY - start.y);
    updateElement(item);
  };
  const end = () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", end);
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", end);
}
function updateSelected(key, value) {
  if (!selected) return;
  selected[key] = value;
  if (key === "text")
    selected.name = value.split("\n")[0].slice(0, 28) || "Text";
  updateElement(selected);
}
[
  ["#font-family", "font"],
  ["#font-size", "size"],
  ["#text-color", "color"],
  ["#font-weight", "weight"],
  ["#text-align", "align"],
  ["#line-height", "lineHeight"],
  ["#padding-top", "paddingTop"],
  ["#padding-right", "paddingRight"],
  ["#padding-bottom", "paddingBottom"],
  ["#padding-left", "paddingLeft"],
  ["#opacity", "opacity"],
  ["#border-radius", "radius"],
  ["#layer-width", "width"],
  ["#layer-height", "height"],
  ["#layer-z-index", "zIndex"],
].forEach(([sel, key]) =>
  $(sel).addEventListener("input", (e) => {
    let v = e.target.value;
    if (
      ["size", "lineHeight", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "opacity", "radius", "width", "height", "zIndex"].includes(key)
    )
      v = Number(v);
    updateSelected(key, v);
    if (key === "opacity") $("#opacity-value").value = v + "%";
  }),
);
$("#text-background").addEventListener("input", (e) => {
  if (!selected) return;
  $("#background-none").checked = false;
  updateSelected("background", e.target.value);
});
function saveTextContent(editor) {
  if (selected?.type !== "text") return;
  selected.html = editor.innerHTML;
  selected.text = editor.innerText;
  selected.name = selected.text.split("\n")[0].slice(0, 28) || "Text";
  renderLayers();
}
$("#text-content").addEventListener("input", (e) => {
  saveTextContent(e.currentTarget);
});
function sanitizeInlineHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content
    .querySelectorAll("script,style,link,meta,iframe,object,embed")
    .forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || (name === "href" || name === "src") && value.startsWith("javascript:")) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  return template.innerHTML;
}
$("#text-content").addEventListener("paste", (event) => {
  const clipboard = event.clipboardData;
  const html = clipboard.getData("text/html");
  const plainText = clipboard.getData("text/plain");
  const pastedHtml = html || (/^\s*</.test(plainText) ? plainText : "");
  if (!pastedHtml || !/<[a-z][\s\S]*>/i.test(pastedHtml)) return;
  event.preventDefault();
  document.execCommand("insertHTML", false, sanitizeInlineHtml(pastedHtml));
  event.currentTarget.dispatchEvent(new Event("input", { bubbles: true }));
});
function formatSelectedText(command, value = null) {
  if (selected?.type !== "text") return;
  $("#text-content").focus();
  document.execCommand(command, false, value);
  $("#text-content").dispatchEvent(new Event("input", { bubbles: true }));
}
["#selection-bold", "#selection-italic"].forEach((selector) =>
  $(selector).addEventListener("mousedown", (event) => event.preventDefault()),
);
$("#selection-bold").addEventListener("click", () => formatSelectedText("bold"));
$("#selection-italic").addEventListener("click", () => formatSelectedText("italic"));
$("#selection-font").addEventListener("change", (event) => {
  if (event.target.value) formatSelectedText("fontName", event.target.value);
  event.target.value = "";
});
$("#selection-color").addEventListener("input", (event) =>
  formatSelectedText("foreColor", event.target.value),
);
$("#clear-text-html").addEventListener("click", () => {
  if (selected?.type !== "text") return;
  const editor = $("#text-content");
  const text = editor.innerText;
  editor.replaceChildren(document.createTextNode(text));
  editor.dispatchEvent(new Event("input", { bubbles: true }));
});
$("#apply-text").addEventListener("click", () => {
  if (selected?.type !== "text") return;
  saveTextContent($("#text-content"));
  updateElement(selected);
});
$("#background-none").addEventListener("change", (e) => {
  if (!selected) return;
  updateSelected(
    "background",
    e.target.checked ? "transparent" : $("#text-background").value,
  );
});
$("#original-z-index").addEventListener("input", (e) => {
  if (selected?.type === "original") {
    selected.zIndex = Number(e.target.value);
    renderLayers();
  }
});
$("#add-text").onclick = addText;
$("#reset-layout").onclick = resetSectionPositions;
imageUpload.onchange = (e) => {
  const f = e.target.files[0];
  if (f) {
    const r = new FileReader();
    r.onload = () => {
      if (replacementTarget) {
        const { zone, zoneIndex } = replacementTarget;
        add({
          ...zone,
          id: newId(),
          name: zone.label,
          src: r.result,
          opacity: 100,
          radius: 0,
          zone: zoneIndex,
        });
        replacementTarget = null;
      } else addImage(r.result, f.name.replace(/\.[^.]+$/, ""));
    };
    r.readAsDataURL(f);
  }
  e.target.value = "";
};
baseUpload.onchange = (e) => {
  const f = e.target.files[0];
  if (f) {
    const r = new FileReader();
    r.onload = () => {
      baseSrc = r.result;
      canvas.style.backgroundImage = `url(${baseSrc})`;
      resetSectionPositions();
      renderSectionSlices();
      const img = new Image();
      img.onload = () =>
        ($("#canvas-size").textContent = `${img.width} × ${img.height} px`);
      img.src = baseSrc;
    };
    r.readAsDataURL(f);
  }
  e.target.value = "";
};
function sampleBluePanelMask(original, mask) {
if (original.maskType !== "bluePanel") return;
  const image = new Image();
  image.src = baseSrc;
  image.onload = () => {
    const probe = document.createElement("canvas");
    probe.width = CANVAS_W;
    probe.height = CANVAS_H;
    const ctx = probe.getContext("2d");
    ctx.drawImage(image, 0, 0, CANVAS_W, CANVAS_H);
    const y = Math.max(1, original.y - 14),
      left = ctx.getImageData(Math.max(1, original.x - 8), y, 1, 1).data,
      right = ctx.getImageData(
        Math.min(248, original.x + original.width + 8),
        y,
        1,
        1,
      ).data;
    const stops = [
      `rgb(${left[0]}, ${left[1]}, ${left[2]})`,
      `rgb(${right[0]}, ${right[1]}, ${right[2]})`,
    ];
    original.maskStops = stops;
    mask.style.background = `linear-gradient(90deg, ${stops[0]}, ${stops[1]})`;
  };
}
function eraseOriginal(original) {
  erasedOriginals.push(original);
 console.log(original)
  const mask = document.createElement("div");
  mask.className = "removed-mask";
  Object.assign(mask.style, {
    left: original.x + "px",
    top: original.y + "px",
    width: original.width + "px",
    height: original.height + "px",
    zIndex: Math.max(2, original.zIndex ?? 0),
    background:"#ffffff00",
	  //    background: original.background,
  });
console.log('look here');
temp = mask
  canvas.append(mask);
  sampleBluePanelMask(original, mask);
}
$("#delete-layer").onclick = () => {
  if (!selected) return;
  if (selected.type === "original") {

    eraseOriginal(selected);
    originals = originals.filter((i) => i !== selected);
  } else {
    document.getElementById(selected.id).remove();
    items = items.filter((i) => i !== selected);
  }
  selected = null;
  renderLayers();
  renderInspector();
};
$("#duplicate").onclick = () => {
  if (!selected) return;
  const c = {
    ...selected,
    id: newId(),
    name: selected.name + " copy",
    x: selected.x + 18,
    y: selected.y + 18,
  };
  items.push(c);
  render(c);
  select(c.id);
};
canvas.onclick = (e) => {
  if (e.target === canvas) select(null);
};
$("#download").onclick = exportPng;
const quickTipsCarousel = $("#quick-tips-carousel");
const tipSlides = [...quickTipsCarousel.querySelectorAll("[data-tip-slide]")];
const tipDots = [...quickTipsCarousel.parentElement.querySelectorAll("[data-tip-dot]")];
let activeTip = 0;
function showTip(index) {
  activeTip = (index + tipSlides.length) % tipSlides.length;
  tipSlides.forEach((slide, slideIndex) => (slide.hidden = slideIndex !== activeTip));
  tipDots.forEach((dot, dotIndex) => {
    const active = dotIndex === activeTip;
    dot.setAttribute("aria-selected", String(active));
    dot.style.background = active ? "#1767c7" : "#c9d2df";
  });
  $("#tip-count").textContent = `${activeTip + 1} / ${tipSlides.length}`;
}
$("#tip-prev").onclick = () => showTip(activeTip - 1);
$("#tip-next").onclick = () => showTip(activeTip + 1);
tipDots.forEach((dot, index) => (dot.onclick = () => showTip(index)));
function wrapLines(ctx, text, width) {
  return text.split("\n").flatMap((paragraph) => {
    const words = paragraph.split(/\s+/),
      lines = [];
    let line = "";
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    });
    if (line) lines.push(line);
    return lines;
  });
}
function richTextRuns(item) {
  const template = document.createElement("template");
  template.innerHTML = item.html || escapeHtml(item.text).replace(/\n/g, "<br>");
  const base = {
    font: item.font,
    size: item.size * SCALE_X,
    weight: item.weight,
    italic: false,
    color: item.color,
  };
  const runs = [];
  const add = (text, style) => {
    if (text) runs.push({ text, style: { ...style } });
  };
  const walk = (node, inherited) => {
    if (node.nodeType === Node.TEXT_NODE) {
      add(node.nodeValue, inherited);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.tagName === "BR") {
      add("\n", inherited);
      return;
    }
    const tag = node.tagName;
    const style = { ...inherited };
    if (tag === "B" || tag === "STRONG") style.weight = "700";
    if (tag === "I" || tag === "EM") style.italic = true;
    if (tag === "FONT") {
      style.font = node.getAttribute("face") || style.font;
      style.color = node.getAttribute("color") || style.color;
    }
    if (node.style.fontFamily) style.font = node.style.fontFamily;
    if (node.style.fontWeight) style.weight = node.style.fontWeight;
    if (node.style.fontStyle) style.italic = node.style.fontStyle === "italic";
    if (node.style.color) style.color = node.style.color;
    [...node.childNodes].forEach((child) => walk(child, style));
    if (["DIV", "P"].includes(tag)) add("\n", inherited);
  };
  [...template.content.childNodes].forEach((node) => walk(node, base));
  return runs;
}
function canvasFont(style) {
  return `${style.italic ? "italic " : ""}${style.weight} ${style.size}px ${style.font}`;
}
async function drawTextPreview(ctx, item, x, y, width, height) {
  const content = document.querySelector(`#${CSS.escape(item.id)} .content`);
  if (!content) return false;
  const legacyPadding = item.padding ?? 0;
  const paddingTop = (item.paddingTop ?? legacyPadding) * SCALE_Y;
  const paddingRight = (item.paddingRight ?? legacyPadding) * SCALE_X;
  const paddingBottom = (item.paddingBottom ?? legacyPadding) * SCALE_Y;
  const paddingLeft = (item.paddingLeft ?? legacyPadding) * SCALE_X;
  const renderHeight = Math.max(height, OUTPUT_H - y);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${renderHeight}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:100%;height:${height}px;overflow:visible;white-space:pre-wrap;overflow-wrap:break-word;padding:${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px;font-family:${item.font};font-size:${item.size * SCALE_X}px;font-weight:${item.weight};color:${item.color};text-align:${item.align};line-height:${item.lineHeight ?? 1.17}">${content.innerHTML}</div></foreignObject></svg>`;
console.log(svg);
svg = svg.replaceAll("&nbsp;", "&#160;");
try {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    ctx.drawImage(image, x, y, width, renderHeight);
    return true;
  } catch (error) {
    console.warn("Rich text export fell back to canvas text rendering.", error);
    return false;
  }
}
function drawRichText(ctx, item, x, y, width) {
  const lines = [], current = [];
  let currentWidth = 0, pendingSpace = null;
  const finishLine = () => {
    lines.push({ runs: [...current], width: currentWidth });
    current.length = 0;
    currentWidth = 0;
    pendingSpace = null;
  };
  for (const run of richTextRuns(item)) {
    for (const token of run.text.split(/(\s+)/)) {
      if (!token) continue;
      if (token.includes("\n")) {
        token.split("\n").forEach((part, index, parts) => {
          if (part) {
            ctx.font = canvasFont(run.style);
            const wordWidth = ctx.measureText(part).width;
            if (current.length && currentWidth + wordWidth > width) finishLine();
            current.push({ text: part, style: run.style, width: wordWidth });
            currentWidth += wordWidth;
          }
          if (index < parts.length - 1) finishLine();
        });
      } else if (/^\s+$/.test(token)) {
        pendingSpace = run.style;
      } else {
        ctx.font = canvasFont(run.style);
        const wordWidth = ctx.measureText(token).width;
        let spaceWidth = 0;
        if (pendingSpace && current.length) {
          ctx.font = canvasFont(pendingSpace);
          spaceWidth = ctx.measureText(" ").width;
        }
        if (current.length && currentWidth + spaceWidth + wordWidth > width) {
          finishLine();
          spaceWidth = 0;
        }
        if (spaceWidth) current.push({ text: " ", style: pendingSpace, width: spaceWidth });
        current.push({ text: token, style: run.style, width: wordWidth });
        currentWidth += spaceWidth + wordWidth;
        pendingSpace = null;
      }
    }
  }
  if (current.length || !lines.length) finishLine();
  const lineHeight = item.size * SCALE_X * (item.lineHeight ?? 1.17);
  lines.forEach((line, lineIndex) => {
    let cursor = item.align === "center" ? x + (width - line.width) / 2 : item.align === "right" ? x + width - line.width : x;
    line.runs.forEach((run) => {
      ctx.font = canvasFont(run.style);
      ctx.fillStyle = run.style.color;
      ctx.fillText(run.text, cursor, y + lineIndex * lineHeight);
      cursor += run.width;
    });
  });
}
function paintMask(ctx, item) {
  const x = item.x * SCALE_X,
    y = item.y * SCALE_Y,
    w = item.width * SCALE_X,
    h = item.height * SCALE_Y;
  if (item.maskType === "bluePanel") {
    const gradient = ctx.createLinearGradient(x, y, x + w, y),
      stops = item.maskStops || ["#1d61a5", "#1a5799"];
    gradient.addColorStop(0, stops[0]);
    gradient.addColorStop(1, stops[1]);
    ctx.fillStyle = gradient;
  } else ctx.fillStyle = item.background;
  ctx.fillRect(x, y, w, h);
}
async function exportPng() {
  try {
    const out = document.createElement("canvas");
    out.width = OUTPUT_W;
    out.height = OUTPUT_H;
    const ctx = out.getContext("2d");
    const bg = new Image();
    bg.src = baseSrc;
    await bg.decode();
    ctx.drawImage(bg, 0, 0, out.width, out.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(
      0,
      SECTION_MASK_TOP * SCALE_Y,
      OUTPUT_W,
      SECTION_MASK_HEIGHT * SCALE_Y,
    );
sections.forEach((section) =>{ 
	ctx.drawImage(
        bg,
        0,
        section.sourceY * SCALE_Y,
        OUTPUT_W,
        section.height * SCALE_Y,
        0,
        sectionY(section.id) * SCALE_Y,
        OUTPUT_W,
        section.height * SCALE_Y,
      )
    });
    erasedOriginals.forEach((it) => paintMask(ctx, it));
    for (const it of items) {
      ctx.save();
      ctx.globalAlpha = it.opacity / 100;
      const x = it.x * SCALE_X,
        y = it.y * SCALE_Y,
        w = it.width * SCALE_X,
        h = it.height * SCALE_Y;
      if (it.type === "image") {
        const im = new Image();
        im.src = it.src;
        await im.decode();
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, it.radius * SCALE_X);
        ctx.clip();
        ctx.fillStyle = "#fff";
        ctx.fillRect(x, y, w, h);
        ctx.drawImage(im, x, y, w, h);
      } else {
        if (it.background && it.background !== "transparent") {
          ctx.fillStyle = it.background;
          ctx.fillRect(x, y, w, h);
        }
        const drawnFromPreview = await drawTextPreview(ctx, it, x, y, w, h);
        if (!drawnFromPreview) {
          ctx.textBaseline = "top";
          const legacyPadding = it.padding ?? 0;
          const paddingTop = (it.paddingTop ?? legacyPadding) * SCALE_Y;
          const paddingRight = (it.paddingRight ?? legacyPadding) * SCALE_X;
          const paddingBottom = (it.paddingBottom ?? legacyPadding) * SCALE_Y;
          const paddingLeft = (it.paddingLeft ?? legacyPadding) * SCALE_X;
          const textWidth = Math.max(1, w - paddingLeft - paddingRight);
          drawRichText(ctx, it, x + paddingLeft, y + paddingTop, textWidth);
        }
      }
      ctx.restore();
    }
    showExportModal(out);
  } catch (error) {
    $("#local-warning").hidden = false;
    $("#local-warning").textContent =
      "Export is blocked because this page was opened as a local file. Run “node server.js”, then open http://localhost:4173.";
    console.warn("PNG export needs the local server.", error);
  }
}

function closeExportModal() {
  $("#export-modal").hidden = true;
  $("#download").focus();
}
function showExportModal(out) {
  exportCanvas = out;
  out.id = "export-preview-canvas";
  $("#export-preview").replaceChildren(out);
  $("#export-modal").hidden = false;
  $("#download-rendered").focus();
}
$("#close-export").onclick = closeExportModal;
$("#cancel-export").onclick = closeExportModal;
$("#export-modal").addEventListener("click", (event) => {
  if (event.target.matches("[data-close-export]")) closeExportModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#export-modal").hidden) closeExportModal();
});
$("#download-rendered").onclick = () => {
  if (!exportCanvas) return;
  const link = document.createElement("a");
  link.download = "picture-studio-export.png";
  link.href = exportCanvas.toDataURL("image/png");
  link.click();
};


renderSections();
renderSectionSlices();
installHotspots();
