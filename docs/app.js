"use strict";

const $ = (selector) => document.querySelector(selector);
const data = window.metProject;
const number = (value) => Number(value).toFixed(2);
const gainNumber = new Intl.NumberFormat("en", {
  signDisplay: "exceptZero",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(href, text, className) {
  const anchor = element("a", className, text);
  anchor.href = href;
  return anchor;
}

function fillTable(table, columns, rows) {
  const head = table.createTHead().insertRow();
  for (const label of columns) {
    const cell = element("th", "", label);
    cell.scope = "col";
    head.append(cell);
  }
  const body = table.createTBody();
  for (const values of rows) {
    const row = body.insertRow();
    if (String(values[0]).startsWith("MeT")) row.className = "highlight";
    values.forEach((value, index) => {
      const cell = element(index ? "td" : "th", "", value);
      if (!index) cell.scope = "row";
      row.append(cell);
    });
  }
}

function setupCanvas(canvas) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return null;
  const ratio = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  return { context, width, height };
}

function line(ctx, x0, y0, x1, y1, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function drawCapacity(points, metricLabel, range) {
  const chart = setupCanvas($("#scaling-chart"));
  if (!chart) return;
  const { context: ctx, width, height } = chart;
  const x0 = 32, x1 = width - 20, y0 = 19, y1 = height - 45;
  const values = points.map((point) => point.value);
  const [yMin, yMax] = range ?? [
    Math.floor(Math.min(...values) - .35),
    Math.ceil(Math.max(...values) + .35)
  ];
  const firstWidth = points[0].H;
  const widthSpan = points.at(-1).H - firstWidth;
  const x = (index) => x0 + (x1 - x0) * (points[index].H - firstWidth) / widthSpan;
  const y = (value) => y1 - (Math.max(value, yMin) - yMin) / (yMax - yMin) * (y1 - y0);
  ctx.font = '12px system-ui, sans-serif';
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  for (let tick = yMin; tick <= yMax; tick += Math.ceil((yMax - yMin) / 4)) {
    line(ctx, x0, y(tick), x1, y(tick), "#365171");
    ctx.fillStyle = "#b5cbe8";
    ctx.fillText(tick.toString(), x0 - 7, y(tick));
  }
  const area = ctx.createLinearGradient(0, 0, 0, y1);
  area.addColorStop(0, "#83bdf352");
  area.addColorStop(1, "#83bdf30c");
  ctx.beginPath();
  ctx.moveTo(x(0), y1);
  values.forEach((value, index) => ctx.lineTo(x(index), y(value)));
  ctx.lineTo(x(values.length - 1), y1);
  ctx.closePath();
  ctx.fillStyle = area;
  ctx.fill();
  values.slice(1).forEach((value, index) => line(ctx, x(index), y(values[index]), x(index + 1), y(value), "#94c6ff", 2.5));
  ctx.textAlign = "center";
  points.forEach((point, index) => {
    const px = x(index), py = y(point.value);
    ctx.fillStyle = index === points.length - 1 ? "#a5e0c9" : "#a9cffc";
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#dbeaff";
    ctx.fillText(point.H, px, y1 + 14);
  });
  ctx.fillStyle = "#b5cbe8";
  ctx.fillText("Recurrent width H", (x0 + x1) / 2, height - 8);
  $("#scaling-chart").setAttribute("aria-label", metricLabel + " values: " + points.map((point) =>
    "H " + point.H + ", " + number(point.value)
  ).join("; "));
}

const resourceMetrics = [
  { key: "params", label: "Parameters", unit: "M" },
  { key: "flops", label: "GFLOPs/frame" },
  { key: "peak", label: "GPU peak", unit: "GB" },
  { key: "latency", label: "Latency", unit: "ms/frame" },
  { key: "state", label: "State/stream", unit: "MB" }
];

function metricTitle({ label, unit }) {
  return unit ? label + " (" + unit + ")" : label;
}

function drawModelSize(canvas, pairs, attribute, benchmarkName) {
  const chart = setupCanvas(canvas);
  if (!chart) return;
  const { context: ctx, width, height } = chart;
  const { key } = attribute;
  const values = pairs.flatMap(({ met, vit }) => [Number(met[key]), Number(vit[key])]);
  const minimum = key === "score" ? Math.min(...values) : 0;
  const maximum = Math.max(...values);
  const targetStep = (maximum - minimum) / 4 || 1;
  const magnitude = 10 ** Math.floor(Math.log10(targetStep));
  const step = [1, 2, 5, 10].find((factor) => factor * magnitude >= targetStep) * magnitude;
  const firstTick = Math.floor(minimum / step);
  const lastTick = Math.max(firstTick + 1, Math.ceil(maximum / step));
  const x0 = 35, x1 = width - 7, y0 = 21, y1 = height - 58;
  const x = (index) => x0 + 19 + (x1 - x0 - 38) * index / (pairs.length - 1);
  const y = (value) => y1 - (Number(value) / step - firstTick) * (y1 - y0) / (lastTick - firstTick);
  const style = getComputedStyle(canvas);
  const series = [
    { model: "vit", color: style.getPropertyValue("--vit-line").trim(), dash: [6, 4] },
    { model: "met", color: style.getPropertyValue("--met-line").trim(), dash: [] }
  ];

  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#b5cbe8";
  for (let index = firstTick; index <= lastTick; index++) {
    const tick = index * step;
    line(ctx, x0, y(tick), x1, y(tick), "#365171");
    ctx.fillText(String(Number(tick.toPrecision(8))), x0 - 7, y(tick));
  }

  for (const { model, color, dash } of series) {
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x(0), y(pairs[0][model][key]));
    pairs.slice(1).forEach((pair, index) => ctx.lineTo(x(index + 1), y(pair[model][key])));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.textAlign = "center";
  pairs.forEach((pair, index) => {
    const px = x(index);
    const metIsHigher = Number(pair.met[key]) >= Number(pair.vit[key]);
    for (const { model, color } of series) {
      const isMeT = model === "met";
      const value = pair[model][key];
      const py = y(value);
      ctx.beginPath();
      ctx.arc(px, py, isMeT ? 3.5 : 4.8, 0, 2 * Math.PI);
      ctx.fillStyle = isMeT ? color : "#11233c";
      ctx.fill();
      if (!isMeT) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      const above = isMeT === metIsHigher;
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.fillStyle = color;
      ctx.textBaseline = above ? "bottom" : "top";
      ctx.fillText(value, px, py + (above ? -8 : 8));
    }
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "#dbeaff";
    ctx.textBaseline = "middle";
    ctx.fillText(pair.size, px, y1 + 32);
  });
  ctx.fillStyle = "#b5cbe8";
  ctx.fillText("Model size", (x0 + x1) / 2, height - 8);
  canvas.setAttribute("aria-label", benchmarkName + ", " + metricTitle(attribute) + " by model size. " +
    pairs.map(({ size, met, vit }) => size + ", MeT " + met[key] + ", ViT " + vit[key]).join("; "));
}

function sizeGain(pair) {
  return Number(pair.met.score) - Number(pair.vit.score);
}

function renderSizeSummary(pairs, metricLabel) {
  const gains = pairs.map(sizeGain);
  const scaleMax = Math.ceil(Math.max(...gains) / 5) * 5;
  const bars = pairs.map((pair, index) => {
    const row = element("li");
    const track = element("span", "gain-track");
    track.setAttribute("aria-hidden", "true");
    const fill = element("span", "gain-fill");
    fill.style.width = `${100 * gains[index] / scaleMax}%`;
    track.append(fill);
    row.append(element("span", "", pair.size), track, element("strong", "", gainNumber.format(gains[index])));
    return row;
  });
  const list = $("#size-gains");
  list.replaceChildren(...bars);
  list.setAttribute("aria-label", metricLabel + " gains by model size");
  $("#size-gain-label").textContent = metricLabel + " gain over same-size ViT";

  const costs = resourceMetrics.slice(0, 3).map(({ label, key }) => {
    const ratios = pairs.map((pair) => Number(pair.met[key]) / Number(pair.vit[key]));
    const low = number(Math.min(...ratios));
    const high = number(Math.max(...ratios));
    const range = low === high ? low : low + "–" + high;
    const group = element("div");
    group.append(element("dt", "", label), element("dd", "", range + "×"));
    return group;
  });
  $("#size-costs").replaceChildren(...costs);
}

function initializeScaling() {
  const capacity = data.capacity;
  const models = [...new Set(capacity.map((point) => point.Model))];
  const benchmarks = {
    thumos: { name: "THUMOS14", title: "THUMOS14 mAP", metric: "mAP", column: "mAP", key: "thumos_map" },
    ssv2: { name: "SSv2", title: "SSv2 Top-1 Accuracy", metric: "Top-1 accuracy", column: "Top-1 acc.", key: "ssv2_top1" }
  };
  const capacityRanges = {
    thumos: { "MeT-Large": [47, 50] },
    ssv2: { "MeT-Small": [54, 57], "MeT-Large": [57, 60] }
  };
  const slice = $("#slice");
  const metric = $("#metric");
  const sizeMetric = $("#size-metric");
  const canvas = $("#scaling-chart");
  const table = $("#chart-data-table");
  const axisButtons = [...document.querySelectorAll("[data-axis]")];
  let mode = "capacity";
  let plot = null;

  slice.replaceChildren(...models.map((model) => new Option(model, model)));
  slice.value = "MeT-Base";
  sizeMetric.replaceChildren(new Option(benchmarks.thumos.metric, "score"),
    ...resourceMetrics.map(({ key, label }) => new Option(label, key)));
  for (const [id, unit] of [["thumos", "mAP"], ["ssv2", "acc."]]) {
    const pair = data.sizeComparison[id].find(({ size }) => size === "Large");
    $(`#large-${id}-gain`).replaceChildren(
      document.createTextNode(gainNumber.format(sizeGain(pair))), element("span", "", " " + unit)
    );
  }

  function update() {
    const benchmark = benchmarks[metric.value];
    table.replaceChildren();
    table.createCaption().textContent = benchmark.title;
    if (mode === "size") {
      sizeMetric.options[0].textContent = benchmark.metric;
      const attribute = sizeMetric.value === "score"
        ? { key: "score", label: benchmark.metric, unit: "%" }
        : resourceMetrics.find(({ key }) => key === sizeMetric.value);
      const pairs = data.sizeComparison[metric.value];
      $("#chart-stat").textContent = metricTitle(attribute);
      renderSizeSummary(pairs, benchmark.metric);
      const rows = pairs.flatMap(({ size, vit, met }) => [
        ["ViT-" + size, vit.score, ...resourceMetrics.map(({ key }) => vit[key])],
        ["MeT-" + size, met.score, ...resourceMetrics.map(({ key }) => met[key])]
      ]);
      fillTable(table, ["Model", benchmark.column, ...resourceMetrics.map(metricTitle)], rows);
      plot = () => drawModelSize(canvas, pairs, attribute, benchmark.name);
      plot();
      return;
    }

    const points = capacity.filter((point) => point.Model === slice.value)
      .map((point) => ({ H: point.H, value: point[benchmark.key] }));
    const gain = points.at(-1).value - points[0].value;
    $("#chart-stat").replaceChildren(
      element("strong", "", gainNumber.format(gain)),
      document.createTextNode(" " + benchmark.metric + " with wider memory")
    );
    fillTable(table, ["Model", "Recurrent width H", benchmark.column],
      points.map((point) => [slice.value, point.H, number(point.value)]));
    const range = capacityRanges[metric.value][slice.value];
    plot = () => drawCapacity(points, benchmark.title, range);
    plot();
  }

  function updateAxis(nextMode) {
    mode = nextMode;
    axisButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.axis === mode)));
    const compareSizes = mode === "size";
    slice.closest("label").hidden = compareSizes;
    sizeMetric.closest("label").hidden = !compareSizes;
    canvas.dataset.axis = mode;
    $("#size-legend").hidden = !compareSizes;
    $("#size-comparison").hidden = !compareSizes;
    $("#capacity-caption").hidden = compareSizes;
    $("#size-caption").hidden = !compareSizes;
    update();
  }

  axisButtons.forEach((button) => button.addEventListener("click", () => updateAxis(button.dataset.axis)));
  slice.addEventListener("change", update);
  metric.addEventListener("change", update);
  sizeMetric.addEventListener("change", update);
  new ResizeObserver(() => plot?.()).observe(canvas);
  updateAxis(mode);
}

function paperFigure(item) {
  const figure = element("figure", "paper-figure" + (item.wide ? " wide" : ""));
  figure.id = "figure-" + item.number;
  const asset = link(item.pdf || item.image, "", "figure-asset");
  asset.target = "_blank";
  asset.rel = "noopener";
  asset.setAttribute("aria-label", "Open full-size Figure " + item.number);
  const image = element("img");
  image.src = item.image;
  image.alt = item.alt || item.title;
  image.loading = "lazy";
  image.decoding = "async";
  if (item.width && item.height) {
    image.width = item.width;
    image.height = item.height;
  }
  asset.append(image);
  const caption = element("figcaption");
  caption.append(element("span", "figure-id", "Figure " + item.number + "."), document.createTextNode(" "),
    element("strong", "", item.title));
  figure.append(caption, asset);
  return figure;
}

function paperTable(item) {
  const details = element("details", "paper-table");
  details.id = "table-" + item.number;
  details.open = item.number === 5 || item.number === 6;
  const summary = element("summary");
  summary.append(element("span", "table-id", "Table " + item.number), document.createTextNode(item.title));
  const inner = element("div", "table-inner");
  if (item.caption) inner.append(element("p", "", item.caption));
  if (item.columns && item.rows) {
    const scroll = element("div", "table-scroll");
    scroll.tabIndex = 0;
    scroll.setAttribute("aria-label", item.title);
    const table = element("table");
    fillTable(table, item.columns, item.rows);
    scroll.append(table);
    inner.append(scroll);
  } else if (item.image) {
    const preview = element("img", "table-preview");
    preview.src = item.image;
    preview.alt = "Table " + item.number + ". " + item.title;
    preview.loading = "lazy";
    inner.append(preview);
  }
  if (item.pdf || item.image) {
    inner.append(link(item.pdf || item.image, item.pdf ? "Open the paper table" : "Open full-size table", "figure-link"));
  }
  details.append(summary, inner);
  return details;
}

function initializeEvidence() {
  const slots = { architecture: "#architecture-figures", results: "#result-figures", showcases: "#case-overview", additional: "#additional-case-figures" };
  const figureOrder = [3, 1, 4, 2, 5, 6, 7, 8];
  for (const number of figureOrder) {
    const figure = data.figures.find((item) => item.number === number);
    if (figure) $(slots[figure.section]).append(paperFigure(figure));
  }
  for (const table of data.tables) $(table.number < 5 ? "#architecture-tables" : "#result-tables").append(paperTable(table));
}

const modelColors = { "ViT-Large": "#d84772", "TRecViT-Large": "#8c70b3", "MeT-Large": "#2763a4" };

function drawScores(canvas, item, playbackTime) {
  const chart = setupCanvas(canvas);
  if (!chart) return;
  const { context: ctx, width, height } = chart;
  const start = item.window[0], end = item.window[1];
  const x0 = 34, x1 = width - 16, y0 = 16, y1 = height - 31;
  const x = (value) => x0 + (x1 - x0) * (value - start) / (end - start);
  const y = (value) => y1 - (y1 - y0) * value;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  for (const interval of item.groundTruth) {
    ctx.fillStyle = "#d9ebde";
    const left = Math.max(start, interval[0]), right = Math.min(end, interval[1]);
    if (right > left) ctx.fillRect(x(left), y0, x(right) - x(left), y1 - y0);
  }
  for (const tick of [0, .25, .5, .75, 1]) {
    line(ctx, x0, y(tick), x1, y(tick), "#d5deeb");
    ctx.fillStyle = "#52617a";
    ctx.fillText(String(tick), x0 - 5, y(tick));
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  for (const series of item.series) {
    ctx.strokeStyle = modelColors[series.model];
    ctx.lineWidth = series.model === "MeT-Large" ? 2.4 : 1.7;
    ctx.beginPath();
    item.times.forEach((time, index) => {
      if (index) ctx.lineTo(x(time), y(series.values[index]));
      else ctx.moveTo(x(time), y(series.values[index]));
    });
    ctx.stroke();
  }
  if (Number.isFinite(playbackTime)) {
    const cursor = x(Math.min(end, playbackTime + start));
    line(ctx, cursor, y0, cursor, y1, "#244567", 1.4);
  }
  ctx.restore();
  ctx.textAlign = "center";
  ctx.fillStyle = "#52617a";
  const tickCount = width < 360 ? 3 : 5;
  for (let index = 0; index < tickCount; index++) {
    const position = start + index / (tickCount - 1) * (end - start);
    ctx.textAlign = index === 0 ? "left" : index === tickCount - 1 ? "right" : "center";
    ctx.fillText(Number(position.toFixed(2)) + " s", x(position), y1 + 14);
  }
}

function videoFor(item) {
  const video = element("video");
  video.controls = true;
  video.playsInline = true;
  video.preload = "none";
  video.poster = item.poster;
  for (const [file, type] of [[item.webm, "video/webm"], [item.video, "video/mp4"]]) {
    if (!file) continue;
    const source = element("source");
    source.src = file;
    source.type = type;
    video.append(source);
  }
  video.setAttribute("aria-label", item.title);
  video.append(link(item.video, "Open video"));
  video.addEventListener("error", () => {
    const note = element("p", "load-error", "This browser could not play the clip. ");
    note.append(link(item.video, "Open video file"));
    video.after(note);
  }, { once: true });
  return video;
}

function thumosContent(container, item, video) {
  const legend = element("div", "plot-legend");
  for (const [model, color] of Object.entries(modelColors)) {
    const label = element("span");
    const swatch = element("i", "swatch");
    swatch.style.setProperty("--swatch", color);
    label.append(swatch, document.createTextNode(model));
    legend.append(label);
  }
  const plot = element("canvas");
  plot.setAttribute("role", "img");
  plot.setAttribute("aria-label", "Recorded framewise scores for " + item.title + ". Green shading marks ground-truth action intervals.");
  const note = element("p", "", "Action score over source video time");
  container.append(legend, plot, note);
  const redraw = () => drawScores(plot, item, video?.currentTime);
  new ResizeObserver(redraw).observe(plot);
  video?.addEventListener("timeupdate", redraw);
  video?.addEventListener("seeked", redraw);
  let frame;
  function animate() {
    redraw();
    if (!video.paused && !video.ended) frame = requestAnimationFrame(animate);
  }
  video?.addEventListener("play", () => {
    cancelAnimationFrame(frame);
    animate();
  });
}

function ssv2Content(container, item) {
  const truth = element("p");
  truth.append(element("strong", "", "Ground truth  "), document.createTextNode(item.groundTruth));
  const table = element("table");
  fillTable(table, ["Model", "Prediction", "Softmax score"], item.predictions.map((prediction) => [
    prediction.model, prediction.label, number(prediction.score) + "%"
  ]));
  item.predictions.forEach((prediction, index) => {
    const cell = table.tBodies[0].rows[index].cells[1];
    const badge = element("b", prediction.correct ? "correct" : "incorrect", prediction.correct ? " ✓" : " ✗");
    badge.setAttribute("aria-label", prediction.correct ? "Correct" : "Incorrect");
    cell.append(badge);
    table.tBodies[0].rows[index].cells[2].className = prediction.correct ? "correct" : "incorrect";
  });
  container.append(truth, table);
}

function initializeCases() {
  for (const group of ["thumos", "ssv2"]) {
    const target = $("#" + group + "-cases");
    data.cases[group].forEach((item, index) => {
      const details = element("details", "case");
      details.id = item.id;
      const summary = element("summary", "", item.title);
      summary.append(element("small", "", item.reference));
      const content = element("div", "case-content");
      details.append(summary, content);
      details.addEventListener("toggle", () => {
        if (details.open && !content.hasChildNodes()) {
          const video = item.video ? videoFor(item) : null;
          if (video) content.append(video);
          else if (item.poster) {
            const poster = element("img");
            poster.src = item.poster;
            poster.alt = item.title;
            content.append(poster);
          }
          if (group === "thumos") thumosContent(content, item, video);
          else ssv2Content(content, item);
        } else if (!details.open) {
          content.querySelector("video")?.pause();
        }
      });
      target.append(details);
      if (index < 2) details.open = true;
    });
  }
}

$("#copy-citation").addEventListener("click", async () => {
  const content = $("#bibtex");
  try {
    await navigator.clipboard.writeText(content.textContent);
    $("#copy-status").textContent = "Copied.";
  } catch {
    const range = document.createRange();
    range.selectNodeContents(content);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    $("#copy-status").textContent = "BibTeX selected for copying.";
  }
});

if (data) {
  initializeScaling();
  initializeEvidence();
  initializeCases();
} else {
  $("#chart-stat").textContent = "Measured results are temporarily unavailable.";
}
