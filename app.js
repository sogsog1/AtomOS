const layer = document.querySelector("#window-layer");
const template = document.querySelector("#window-template");
const windowCount = document.querySelector("#window-count");
const launchers = document.querySelectorAll("[data-open-kind]");

const catalog = [
  {
    title: "Project Molecule",
    kind: "folder",
    group: "work",
    storage: 82,
    usage: 0.86,
    atoms: [
      ["roadmap.md", "8 MB"],
      ["interface.sketch", "244 MB"],
      ["build-cache.bin", "1.8 GB"],
    ],
  },
  {
    title: "Media Molecule",
    kind: "folder",
    group: "media",
    storage: 96,
    usage: 0.39,
    atoms: [
      ["launch.mov", "3.2 GB"],
      ["cover.png", "18 MB"],
      ["soundtrack.wav", "620 MB"],
    ],
  },
  {
    title: "Daily Notes",
    kind: "file",
    group: "work",
    storage: 24,
    usage: 0.72,
    text: "Atoms in the same project family gently pull together. Use this file more and it keeps drifting left.",
  },
  {
    title: "Archive Index",
    kind: "file",
    group: "archive",
    storage: 18,
    usage: 0.16,
    text: "Cold files lose priority and slowly migrate toward the right side of the desktop.",
  },
  {
    title: "Storage Field",
    kind: "panel",
    group: "system",
    storage: 50,
    usage: 0.51,
    text: "The field is always running: attraction by kind and group, size by storage, horizontal drift by usage.",
  },
];

const launcherDefaults = {
  folder: [catalog[0], catalog[1]],
  file: [catalog[2], catalog[3]],
  panel: [catalog[4]],
};

const windows = [];
let nextZ = 5;
let nextSpawn = 0;
let activeDrag = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sizeScale(item) {
  const storageWeight = item.kind === "folder" ? 0.34 : 0.18;
  return 1 + (item.storage / 100) * storageWeight;
}

function buildBody(item) {
  if (item.kind === "folder") {
    const atoms = item.atoms
      .map(([name, size]) => `<li><span>${name}</span><strong>${size}</strong></li>`)
      .join("");
    return `
      <div class="meter" aria-label="Storage usage"><span style="width: ${item.storage}%"></span></div>
      <ul class="atom-list">${atoms}</ul>
      <div class="chip-row">
        <span class="chip">${item.storage}% storage mass</span>
        <span class="chip">${Math.round(item.usage * 100)}% usage</span>
      </div>
    `;
  }

  return `
    <p>${item.text}</p>
    <div class="meter" aria-label="Storage usage"><span style="width: ${item.storage}%"></span></div>
    <div class="chip-row">
      <span class="chip">${item.storage}% storage mass</span>
      <span class="chip">${Math.round(item.usage * 100)}% usage</span>
    </div>
  `;
}

function openWindow(source) {
  const item = structuredClone(source);
  const node = template.content.firstElementChild.cloneNode(true);
  const title = node.querySelector("h2");
  const subtitle = node.querySelector("p");
  const body = node.querySelector(".window-body");
  const titlebar = node.querySelector(".window-titlebar");
  const useButton = node.querySelector(".usage-button");
  const closeButton = node.querySelector(".close-button");

  title.textContent = item.title;
  subtitle.textContent = `${item.kind === "folder" ? "Molecule" : "Atom"} - ${item.group}`;
  body.innerHTML = buildBody(item);
  node.dataset.kind = item.kind;
  node.style.zIndex = nextZ++;
  layer.append(node);

  const bounds = layer.getBoundingClientRect();
  const scale = sizeScale(item);
  const width = node.offsetWidth * scale;
  const height = node.offsetHeight * scale;
  const offset = nextSpawn++ * 34;
  const state = {
    node,
    item,
    x: clamp(44 + offset, 8, bounds.width - width - 8),
    y: clamp(36 + offset, 8, bounds.height - height - 92),
    vx: 0,
    vy: 0,
    scale,
    width,
    height,
  };

  titlebar.addEventListener("pointerdown", (event) => startDrag(event, state));
  node.addEventListener("pointerdown", () => {
    node.style.zIndex = nextZ++;
  });
  useButton.addEventListener("click", () => {
    item.usage = clamp(item.usage + 0.16, 0, 1);
    body.innerHTML = buildBody(item);
  });
  closeButton.addEventListener("click", () => closeWindow(state));

  windows.push(state);
  renderWindow(state);
  syncCount();
}

function closeWindow(state) {
  const index = windows.indexOf(state);
  if (index >= 0) {
    windows.splice(index, 1);
  }
  state.node.remove();
  syncCount();
}

function startDrag(event, state) {
  if (event.button !== 0) return;
  event.preventDefault();
  const bounds = layer.getBoundingClientRect();
  state.node.setPointerCapture(event.pointerId);
  state.node.classList.add("is-dragging");
  state.node.style.zIndex = nextZ++;
  activeDrag = {
    state,
    pointerId: event.pointerId,
    dx: event.clientX - state.x,
    dy: event.clientY - bounds.top - state.y,
  };
}

window.addEventListener("pointermove", (event) => {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
  const bounds = layer.getBoundingClientRect();
  const state = activeDrag.state;
  state.x = clamp(event.clientX - activeDrag.dx, 8, bounds.width - state.width - 8);
  state.y = clamp(event.clientY - activeDrag.dy - bounds.top, 8, bounds.height - state.height - 92);
  state.vx = 0;
  state.vy = 0;
  renderWindow(state);
});

window.addEventListener("pointerup", (event) => {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
  activeDrag.state.node.classList.remove("is-dragging");
  activeDrag = null;
});

function syncCount() {
  const count = windows.length;
  windowCount.textContent = `${count} window${count === 1 ? "" : "s"}`;
}

function renderWindow(state) {
  state.node.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`;
}

function applyField() {
  const bounds = layer.getBoundingClientRect();

  for (const state of windows) {
    if (activeDrag?.state === state) continue;

    const useTarget = (1 - state.item.usage) * (bounds.width - state.width - 24) + 12;
    state.vx += (useTarget - state.x) * 0.00035;
    state.vy += (bounds.height * 0.44 - state.y) * 0.00018;

    for (const other of windows) {
      if (other === state) continue;
      const similar =
        other.item.kind === state.item.kind || other.item.group === state.item.group;
      const dx = other.x - state.x;
      const dy = other.y - state.y;
      const distance = Math.hypot(dx, dy) || 1;
      const minDistance = (state.width + other.width) * 0.36;

      if (similar && distance < 440) {
        state.vx += (dx / distance) * 0.018;
        state.vy += (dy / distance) * 0.018;
      }

      if (distance < minDistance) {
        state.vx -= (dx / distance) * 0.095;
        state.vy -= (dy / distance) * 0.095;
      }
    }

    state.vx *= 0.91;
    state.vy *= 0.91;
    state.x = clamp(state.x + state.vx, 8, bounds.width - state.width - 8);
    state.y = clamp(state.y + state.vy, 8, bounds.height - state.height - 92);
    renderWindow(state);
  }

  requestAnimationFrame(applyField);
}

launchers.forEach((button) => {
  button.addEventListener("click", () => {
    const options = launcherDefaults[button.dataset.openKind];
    openWindow(options[nextSpawn % options.length]);
  });
});

for (const item of catalog) {
  openWindow(item);
}

requestAnimationFrame(applyField);
