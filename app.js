// Connect to the main desktop elements in the HTML.
const layer = document.querySelector("#window-layer");
const template = document.querySelector("#window-template");
const windowCount = document.querySelector("#window-count");
const launchers = document.querySelectorAll("[data-open-kind]");
const dock = document.querySelector(".dock");
const dockToggle = document.querySelector(".dock-toggle");
const dockMenu = document.querySelector(".dock-menu");
const contextMenu = document.createElement("div");
contextMenu.className = "context-menu";
document.body.append(contextMenu);

// Describe the sample apps/files/folders that AtomOS opens at startup.
const catalog = [
  {
    title: "Folder",
    kind: "folder",
    surface: "icon",
    group: "work",
    storage: 82,
    usage: 0.86,
    atoms: [
      { name: "roadmap.md", size: "8 MB", storage: 8 },
      { name: "interface.sketch", size: "244 MB", storage: 24 },
      { name: "build-cache.bin", size: "1.8 GB", storage: 42 },
    ],
    isOpen: false,
  },
  {
    title: "Media Molecule",
    kind: "folder",
    surface: "window",
    group: "media",
    storage: 96,
    usage: 0.39,
    atoms: [
      { name: "launch.mov", size: "3.2 GB", storage: 54 },
      { name: "cover.png", size: "18 MB", storage: 10, mediaType: "image", src: "assets/cover.png" },
      { name: "soundtrack.wav", size: "620 MB", storage: 30, mediaType: "audio", src: "assets/soundtrack.wav" },
    ],
    isOpen: true,
  },
  {
    title: "Daily Notes",
    kind: "file",
    group: "work",
    storage: 24,
    usage: 0.72,
    text: "",
    clearOnFirstFocus: true,
    storageFromText: true,
  },
  {
    title: "Archive Index",
    kind: "file",
    group: "archive",
    storage: 18,
    usage: 0.16,
    text: "",
  },
  {
    title: "Storage Field",
    kind: "panel",
    group: "system",
    storage: 50,
    usage: 0.51,
    text: "",
  },
];

// Pick which sample item opens when a launcher button is pressed.
const launcherDefaults = {
  folder: [catalog[0], catalog[1]],
  file: [catalog[2], catalog[3]],
  panel: [catalog[4]],
};

// Define what can be launched from the right-click launch menu.
const launchTypes = [
  { label: "Folder", source: () => createFolder() },
  { label: "Media Molecule", source: () => catalog[1] },
  { label: "Daily Notes", source: () => catalog[2] },
  { label: "Archive Index", source: () => catalog[3] },
  { label: "Storage Field", source: () => catalog[4] },
];

// Keep track of all open windows and the current pointer interaction.
const windows = [];
let nextZ = 5;
let nextSpawn = 0;
let activeDrag = null;
let activeResize = null;

// Limit a number so it cannot go lower than min or higher than max.
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Escape note text before putting it into HTML so typed symbols stay as text.
function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Make storage-heavy windows appear bigger, especially molecules/folders.
function sizeScale(item) {
  const storageWeight = item.kind === "folder" ? 0.34 : 0.18;
  return 1 + (item.storage / 100) * storageWeight;
}

// Decide whether a folder should be rendered as a desktop icon.
function isFolderIcon(item) {
  return item.kind === "folder" && item.surface === "icon";
}

// Recalculate Daily Notes storage from its typed character count.
function updateStorageFromText(item) {
  if (!item.storageFromText) return;
  item.storage = clamp(24 + Math.floor((item.text ?? "").length / 10), 0, 100);
}

// Update the visible storage meter without replacing an active text box.
function syncStorageDisplay(state) {
  const meter = state.node.querySelector(".meter span");
  const chip = state.node.querySelector("[data-storage-chip]");
  if (meter) meter.style.width = `${state.item.storage}%`;
  if (chip) chip.textContent = `${state.item.storage}% storage mass`;
}

// Save the current rendered size of a window for collision and boundary math.
function updateWindowSize(state) {
  state.width = state.baseWidth * state.scale;
  state.height = state.baseHeight * state.scale;
}

// Convert a file window into the small data entry shown inside a folder.
function atomFromFile(item) {
  return {
    name: item.title,
    size: `${Math.max(1, Math.round(item.storage * 8))} MB`,
    storage: item.storage,
    source: structuredClone(item),
  };
}

// Build the inside of a folder window or note-style window.
function buildBody(item) {
  if (item.kind === "folder") {
    const atoms = item.atoms
      .map(
        (atom, index) =>
          `<li data-atom-index="${index}" title="Double-click to open">
            <span>${escapeHTML(atom.name)}</span>
            <strong>${escapeHTML(atom.size)}</strong>
            ${buildAtomPreview(atom)}
          </li>`,
      )
      .join("");
    const folderContent = item.isOpen
      ? `<ul class="atom-list">${atoms || "<li><span>Empty molecule</span><strong>0 MB</strong></li>"}</ul>`
      : `<p class="folder-summary">${item.surface === "icon" ? item.atoms.length : `${item.atoms.length} atoms inside. Double-click to open.`}</p>`;

    return `
      ${item.surface === "window" ? `<div class="meter" aria-label="Storage usage"><span style="width: ${item.storage}%"></span></div>` : ""}
      ${folderContent}
      ${
        item.surface === "window"
          ? `<div class="chip-row">
              <span class="chip">${item.storage}% storage mass</span>
              <span class="chip">${Math.round(item.usage * 100)}% usage</span>
            </div>`
          : ""
      }
    `;
  }

  const noteText = item.text ?? "";
  return `
    <textarea class="note-editor" aria-label="Note text" spellcheck="true" placeholder="Cold files lose priority and slowly migrate toward the right side of the desktop.">${escapeHTML(noteText)}</textarea>
    <div class="meter" aria-label="Storage usage"><span style="width: ${item.storage}%"></span></div>
    <div class="chip-row">
      <span class="chip" data-storage-chip>${item.storage}% storage mass</span>
      <span class="chip">${Math.round(item.usage * 100)}% usage</span>
    </div>
  `;
}

// Render playable/visible previews for media atoms inside molecule windows.
function buildAtomPreview(atom) {
  if (atom.mediaType === "audio") {
    return `<audio class="atom-preview" controls src="${escapeHTML(atom.src)}"></audio>`;
  }

  if (atom.mediaType === "image") {
    return `<img class="atom-preview image-preview" src="${escapeHTML(atom.src)}" alt="${escapeHTML(atom.name)} preview" />`;
  }

  return "";
}

// Attach note-editor events after a window body is created or refreshed.
function bindBodyControls(state) {
  const editor = state.node.querySelector(".note-editor");
  if (!editor) return;

  editor.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    pauseWindow(state, 3000);

    if (state.item.clearOnFirstFocus) {
      editor.value = "";
      state.item.text = "";
      state.item.clearOnFirstFocus = false;
      updateStorageFromText(state.item);
      syncStorageDisplay(state);
    }
  });

  editor.addEventListener("input", () => {
    state.item.text = editor.value;
    state.item.clearOnFirstFocus = false;
    updateStorageFromText(state.item);
    syncStorageDisplay(state);
  });
}

// Re-render a window body after its data changes and restore body event handlers.
function refreshWindowBody(state, shouldMeasure = false) {
  state.node.querySelector(".window-body").innerHTML = buildBody(state.item);
  bindBodyControls(state);
  bindFolderControls(state);

  if (shouldMeasure && !state.node.style.height) {
    state.baseHeight = state.node.offsetHeight;
    updateWindowSize(state);
  }
}

// Attach double-click handlers to items shown inside an open folder.
function bindFolderControls(state) {
  if (state.item.kind !== "folder") return;

  state.node.querySelectorAll("[data-atom-index]").forEach((entry) => {
    entry.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      const atom = state.item.atoms.splice(Number(entry.dataset.atomIndex), 1)[0];
      if (!atom) return;

      const source = atom.source ?? {
        title: atom.name,
        kind: "file",
        group: state.item.group,
        storage: atom.storage,
        usage: 0.55,
        text: "",
      };

      state.item.storage = clamp(state.item.storage - Math.max(2, atom.storage * 0.08), 8, 100);
      state.scale = Math.max(sizeScale(state.item), state.scale - 0.03);
      updateWindowSize(state);
      refreshWindowBody(state);
      openWindow(source, { x: state.x + 112, y: state.y + 24 });
    });
  });
}

// Create one draggable, resizable window from a catalog item.
function openWindow(source, position = null) {
  const item = structuredClone(source);
  const node = template.content.firstElementChild.cloneNode(true);
  const title = node.querySelector(".rename-input");
  const subtitle = node.querySelector("p");
  const body = node.querySelector(".window-body");
  const titlebar = node.querySelector(".window-titlebar");
  const fixButton = node.querySelector(".fix-button");
  const closeButton = node.querySelector(".close-button");
  const resizeHandle = node.querySelector(".resize-handle");

  title.value = item.title;
  subtitle.textContent = `${item.kind === "folder" ? "Molecule" : "Atom"} - ${item.group}`;
  body.innerHTML = buildBody(item);
  node.dataset.kind = item.kind;
  node.classList.toggle("folder-icon-window", isFolderIcon(item));
  node.classList.toggle("is-folder-open", item.kind === "folder" && item.isOpen);
  node.style.zIndex = isFolderIcon(item) ? 1 : nextZ++;
  layer.append(node);

  const bounds = layer.getBoundingClientRect();
  const scale = sizeScale(item);
  const baseWidth = isFolderIcon(item) ? 82 : node.offsetWidth;
  const baseHeight = isFolderIcon(item) ? 96 : node.offsetHeight;
  const offset = nextSpawn++ * 34;
  const state = {
    node,
    item,
    x: position?.x ?? 44 + offset,
    y: position?.y ?? 36 + offset,
    vx: 0,
    vy: 0,
    scale,
    baseWidth,
    baseHeight,
    width: baseWidth * scale,
    height: baseHeight * scale,
    pauseUntil: 0,
    fixed: isFolderIcon(item),
  };
  node.classList.toggle("is-fixed", state.fixed);

  state.x = clamp(state.x, 8, bounds.width - state.width - 8);
  state.y = clamp(state.y, 8, bounds.height - state.height - 92);

  titlebar.addEventListener("pointerdown", (event) => startDrag(event, state));
  resizeHandle.addEventListener("pointerdown", (event) => startResize(event, state));

  node.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button, input, textarea, .resize-handle, [data-atom-index]")) return;
    if (!isFolderIcon(item)) {
      node.style.zIndex = nextZ++;
    }
    pauseWindow(state, 2500);
    startDrag(event, state);
  });

  title.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    pauseWindow(state, 3000);
  });

  title.addEventListener("focus", () => {
    title.select();
    node.classList.add("is-renaming");
  });

  title.addEventListener("blur", () => {
    node.classList.remove("is-renaming");
  });

  title.addEventListener("input", () => {
    item.title = title.value.trim() || "Untitled";
  });

  fixButton.addEventListener("pointerdown", (event) => event.stopPropagation());
  fixButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFixed(state, fixButton);
  });

  closeButton.addEventListener("pointerdown", (event) => event.stopPropagation());
  closeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    closeWindow(state);
  });

  node.addEventListener("dblclick", (event) => {
    if (item.kind !== "folder" || event.target.closest("button, input, textarea, .resize-handle")) return;
    item.isOpen = !item.isOpen;
    node.classList.toggle("is-folder-open", item.isOpen);
    refreshWindowBody(state, true);
  });

  node.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    showContextMenu(event.clientX, event.clientY, state);
  });

  windows.push(state);
  bindBodyControls(state);
  bindFolderControls(state);
  renderWindow(state);
  syncCount();
}

// Freeze physics for a little while after the user interacts with a window.
function pauseWindow(state, duration = 2500) {
  state.pauseUntil = Math.max(state.pauseUntil, performance.now() + duration);
  state.vx = 0;
  state.vy = 0;
}

// Toggle whether a window ignores the drift and attraction simulation.
function toggleFixed(state, button) {
  state.fixed = !state.fixed;
  state.vx = 0;
  state.vy = 0;
  state.node.classList.toggle("is-fixed", state.fixed);
  if (button) {
    button.textContent = state.fixed ? "Fixed" : "Fix";
    button.title = state.fixed ? "Unfix window" : "Fix window in place";
  }
}

// Focus and select the title field so the user can rename a window.
function renameWindow(state) {
  const title = state.node.querySelector(".rename-input");
  if (!title) return;
  state.node.style.zIndex = isFolderIcon(state.item) ? state.node.style.zIndex : nextZ++;
  title.focus();
  title.select();
}

// Remove a window from the page and from the simulation list.
function closeWindow(state) {
  const index = windows.indexOf(state);
  if (index >= 0) {
    windows.splice(index, 1);
  }
  state.node.remove();
  syncCount();
}

// Find a folder underneath a dropped file window.
function folderAtDropTarget(fileState, event) {
  const bounds = layer.getBoundingClientRect();
  const dropX = event.clientX - bounds.left;
  const dropY = event.clientY - bounds.top;

  return windows.find((state) => {
    if (state === fileState || !isFolderIcon(state.item)) return false;
    const insideX = dropX >= state.x && dropX <= state.x + state.width;
    const insideY = dropY >= state.y && dropY <= state.y + state.height;
    return insideX && insideY;
  });
}

// Move a window into a folder, grow the folder, and remove the source window.
function absorbFileIntoFolder(fileState, folderState) {
  folderState.item.atoms.push(atomFromFile(fileState.item));
  folderState.item.storage = clamp(folderState.item.storage + Math.max(3, fileState.item.storage * 0.12), 0, 100);
  folderState.item.isOpen = true;
  folderState.scale += 0.035;
  updateWindowSize(folderState);
  refreshWindowBody(folderState, true);
  renderWindow(folderState);
  closeWindow(fileState);
}

// Start dragging a window when the user presses its titlebar.
function startDrag(event, state) {
  if (event.button !== 0) return;
  if (event.target.closest("button, input, textarea, .resize-handle")) return;
  event.preventDefault();
  event.stopPropagation();
  const bounds = layer.getBoundingClientRect();
  state.node.setPointerCapture(event.pointerId);
  state.node.classList.add("is-dragging");
  state.node.style.zIndex = isFolderIcon(state.item) ? 2 : nextZ++;
  pauseWindow(state, 3000);
  activeDrag = {
    state,
    pointerId: event.pointerId,
    dx: event.clientX - state.x,
    dy: event.clientY - bounds.top - state.y,
  };
}

// Start resizing a window from the bottom-right corner handle.
function startResize(event, state) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  state.node.setPointerCapture(event.pointerId);
  state.node.classList.add("is-resizing");
  state.node.style.zIndex = nextZ++;
  pauseWindow(state, 3000);
  activeResize = {
    state,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startWidth: state.baseWidth,
    startHeight: state.baseHeight,
  };
}

// Move the active drag or resize interaction as the pointer moves.
window.addEventListener("pointermove", (event) => {
  if (activeDrag && event.pointerId === activeDrag.pointerId) {
    const bounds = layer.getBoundingClientRect();
    const state = activeDrag.state;
    state.x = clamp(event.clientX - activeDrag.dx, 8, bounds.width - state.width - 8);
    state.y = clamp(event.clientY - activeDrag.dy - bounds.top, 8, bounds.height - state.height - 92);
    state.vx = 0;
    state.vy = 0;
    renderWindow(state);
    return;
  }

  if (activeResize && event.pointerId === activeResize.pointerId) {
    const bounds = layer.getBoundingClientRect();
    const state = activeResize.state;
    const nextWidth = activeResize.startWidth + (event.clientX - activeResize.startX) / state.scale;
    const nextHeight = activeResize.startHeight + (event.clientY - activeResize.startY) / state.scale;

    state.baseWidth = clamp(nextWidth, 230, (bounds.width - state.x - 8) / state.scale);
    state.baseHeight = clamp(nextHeight, 170, (bounds.height - state.y - 92) / state.scale);
    state.node.style.width = `${state.baseWidth}px`;
    state.node.style.height = `${state.baseHeight}px`;
    updateWindowSize(state);
    state.vx = 0;
    state.vy = 0;
    renderWindow(state);
  }
});

// Finish any active drag or resize interaction when the pointer lifts.
window.addEventListener("pointerup", (event) => {
  if (activeDrag && event.pointerId === activeDrag.pointerId) {
    const draggedState = activeDrag.state;
    const dropTarget = draggedState.item.kind !== "folder" ? folderAtDropTarget(draggedState, event) : null;
    draggedState.node.classList.remove("is-dragging");
    draggedState.node.style.zIndex = isFolderIcon(draggedState.item) ? 1 : draggedState.node.style.zIndex;
    activeDrag = null;

    if (dropTarget) {
      absorbFileIntoFolder(draggedState, dropTarget);
    }
  }

  if (activeResize && event.pointerId === activeResize.pointerId) {
    activeResize.state.node.classList.remove("is-resizing");
    activeResize = null;
  }
});

// Hide the custom right-click menu.
function hideContextMenu() {
  contextMenu.classList.remove("is-open");
  contextMenu.classList.remove("submenu-up");
  contextMenu.innerHTML = "";
}

// Show desktop/folder actions at the pointer location.
function showContextMenu(x, y, targetState = null) {
  const options = [
    { label: "Add folder", action: () => openWindow(createFolder(), menuPositionFromViewport(x, y)) },
    { label: "Launch window", submenu: launchTypes },
  ];

  if (targetState) {
    options.push({ label: targetState.fixed ? "Unfix" : "Fix", action: () => toggleFixed(targetState) });
    options.push({ label: "Rename", action: () => renameWindow(targetState) });
  }

  if (targetState && isFolderIcon(targetState.item)) {
    options.push({ label: "Delete folder", action: () => closeWindow(targetState) });
  }

  contextMenu.innerHTML = options
    .map((option, index) => {
      if (!option.submenu) {
        return `<button type="button" data-menu-index="${index}">${option.label}</button>`;
      }

      const children = option.submenu
        .map((child, childIndex) => `<button type="button" data-menu-index="${index}" data-submenu-index="${childIndex}">${child.label}</button>`)
        .join("");
      return `<div class="context-submenu"><button type="button" data-menu-index="${index}">${option.label} ›</button><div>${children}</div></div>`;
    })
    .join("");
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.classList.toggle("submenu-up", y > window.innerHeight - 240);
  contextMenu.classList.add("is-open");

  contextMenu.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.menuIndex);
      const childIndex = button.dataset.submenuIndex;

      if (childIndex === undefined && options[index].submenu) return;

      if (childIndex !== undefined) {
        const source = options[index].submenu[Number(childIndex)].source();
        openWindow(source, menuPositionFromViewport(x, y));
      } else {
        options[index].action();
      }

      hideContextMenu();
    });
  });
}

// Convert viewport menu coordinates into coordinates inside the window layer.
function menuPositionFromViewport(x, y) {
  const bounds = layer.getBoundingClientRect();
  return {
    x: x - bounds.left,
    y: y - bounds.top,
  };
}

// Create a new empty folder for the right-click menu.
function createFolder() {
  return {
    title: `New Molecule ${nextSpawn + 1}`,
    kind: "folder",
    surface: "icon",
    group: "custom",
    storage: 18,
    usage: 0.5,
    atoms: [],
    isOpen: true,
  };
}

// Update the top-bar count so it matches the number of open windows.
function syncCount() {
  const count = windows.length;
  windowCount.textContent = `${count} window${count === 1 ? "" : "s"}`;
}

// Place the window at its current simulated position and storage-based scale.
function renderWindow(state) {
  state.node.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`;
}

// Run the AtomOS physics field: usage drift, similarity attraction, and spacing.
function applyField() {
  const bounds = layer.getBoundingClientRect();
  const now = performance.now();

  for (const state of windows) {
    if (activeDrag?.state === state || activeResize?.state === state) continue;
    if (state.fixed) continue;

    if (now < state.pauseUntil) {
      state.vx *= 0.5;
      state.vy *= 0.5;
      renderWindow(state);
      continue;
    }

    const speed = state.item.kind === "folder" ? 0.42 : 1;
    const useTarget = (1 - state.item.usage) * (bounds.width - state.width - 24) + 12;
    state.vx += (useTarget - state.x) * 0.00035 * speed;
    state.vy += (bounds.height * 0.44 - state.y) * 0.00018 * speed;

    for (const other of windows) {
      if (other === state) continue;
      const similar =
        other.item.kind === state.item.kind || other.item.group === state.item.group;
      const dx = other.x - state.x;
      const dy = other.y - state.y;
      const distance = Math.hypot(dx, dy) || 1;
      const minDistance = (state.width + other.width) * 0.36;

      if (similar && distance < 440) {
        state.vx += (dx / distance) * 0.018 * speed;
        state.vy += (dy / distance) * 0.018 * speed;
      }

      if (distance < minDistance) {
        state.vx -= (dx / distance) * 0.095 * speed;
        state.vy -= (dy / distance) * 0.095 * speed;
      }
    }

    const damping = state.item.kind === "folder" ? 0.84 : 0.91;
    state.vx *= damping;
    state.vy *= damping;
    state.x = clamp(state.x + state.vx, 8, bounds.width - state.width - 8);
    state.y = clamp(state.y + state.vy, 8, bounds.height - state.height - 92);
    renderWindow(state);
  }

  requestAnimationFrame(applyField);
}

// Wire launcher buttons so each one opens the next matching sample window.
launchers.forEach((button) => {
  button.addEventListener("click", () => {
    const options = launcherDefaults[button.dataset.openKind];
    openWindow(options[nextSpawn % options.length]);
  });
});

// Toggle the sideways launcher menu at the bottom-right.
dockToggle.addEventListener("click", () => {
  const isOpen = dock.classList.toggle("is-open");
  dockToggle.setAttribute("aria-expanded", String(isOpen));
  dockToggle.textContent = isOpen ? "›" : "‹";
  dockMenu.setAttribute("aria-hidden", String(!isOpen));
});

// Open the starter set of windows when AtomOS loads.
for (const item of catalog) {
  openWindow(item);
}

// Start the animation loop that keeps windows drifting and attracting.
requestAnimationFrame(applyField);

// Open the desktop context menu when the user right-clicks empty space.
layer.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  showContextMenu(event.clientX, event.clientY);
});

// Close the context menu after any normal click elsewhere.
window.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".context-menu")) {
    hideContextMenu();
  }
});
