const state = {
  parks: [],
  filtered: [],
  selectedPark: null,
  selectedImages: [],
  map: null,
  markers: new Map(),
  courtsRequestId: 0
};

const els = {
  userName: document.getElementById("userName"),
  welcomeName: document.getElementById("welcomeName"),
  sessionFullName: document.getElementById("sessionFullName"),
  sessionRole: document.getElementById("sessionRole"),
  logoutBtn: document.getElementById("logoutBtn"),
  search: document.getElementById("buscadorParques"),
  status: document.getElementById("estadoFiltro"),
  parksGrid: document.getElementById("parksGrid"),
  parksCounter: document.getElementById("parksCounter"),
  parkDetail: document.getElementById("parkDetail"),
  mapList: document.getElementById("mapList"),
  reportForm: document.getElementById("reportForm"),
  reportParkName: document.getElementById("reportParkName"),
  reportCourtSelect: document.getElementById("reportCourtSelect"),
  courtCards: document.getElementById("courtCards"),
  reportText: document.getElementById("reportText"),
  reportImageFile: document.getElementById("reportImageFile"),
  imagePreviewContainer: document.getElementById("imagePreviewContainer"),
  fileUploadText: document.getElementById("fileUploadText"),
  uploadLabel: document.querySelector(".file-upload-label"),
  reportMessage: document.getElementById("reportMessage"),
  currentYear: document.getElementById("currentYear")
};

const FOTO_MAX_BYTES = 4 * 1024 * 1024;
const FOTO_MAX_FILES = 5;
const FOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

const roles = {
  1: "Administrador",
  2: "Gestor",
  3: "Usuario"
};

function getSession() {
  const token = localStorage.getItem("token");
  const rawUser = localStorage.getItem("user");

  if (!token || !rawUser) {
    window.location.href = "/login";
    return null;
  }

  try {
    return { token, user: JSON.parse(rawUser) };
  } catch {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login";
    return null;
  }
}

function getFullName(user) {
  return [user.nombre, user.apellido_paterno, user.apellido_materno]
    .filter(Boolean)
    .join(" ");
}

function setSessionInfo(user) {
  const fullName = getFullName(user) || "Usuario ciudadano";
  els.userName.textContent = fullName;
  els.welcomeName.textContent = user.nombre || "usuario";
  els.sessionFullName.textContent = fullName;
  els.sessionRole.textContent = roles[user.id_rol] || user.rol || "Usuario";
}

function logout() {
  fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login";
}

function normalizePark(park) {
  return {
    ...park,
    latitud: Number(park.latitud),
    longitud: Number(park.longitud),
    esta_abierto: Number(park.esta_abierto),
    abierto_ahora: Number(park.abierto_ahora ?? park.esta_abierto)
  };
}

function isParkOpen(park) {
  return Number(park.abierto_ahora ?? park.esta_abierto) === 1;
}

function scheduleLabel(park) {
  return `${park.hora_apertura || "06:00"}-${park.hora_cierre || "20:00"}`;
}

function statusLabel(park) {
  return isParkOpen(park) ? "Abierto" : "Cerrado";
}

function statusClass(park) {
  return isParkOpen(park) ? "open" : "closed";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeParkSearch(value) {
  return String(value ?? "")
    .replace(/[^\p{L}\s'-]/gu, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, 80);
}

function getSearchText() {
  const cleaned = sanitizeParkSearch(els.search.value);
  if (els.search.value !== cleaned) {
    els.search.value = cleaned;
  }
  return normalizeSearchText(cleaned);
}

function parkSearchValues(park) {
  return [park.nombre, park.nombre_zona]
    .filter(Boolean)
    .map((value) => String(value));
}

function parkMatchesQuery(park, query) {
  if (!query) return { matches: true, starts: false };
  const values = parkSearchValues(park).map(normalizeSearchText);
  return {
    matches: values.some((value) => value.includes(query)),
    starts: values.some((value) => value.startsWith(query))
  };
}

function updateSearchSuggestions(query = getSearchText()) {
  const datalist = document.getElementById("parkSearchSuggestions");
  if (!datalist) return;

  const suggestions = [];
  const seen = new Set();

  const addValue = (value, starts) => {
    const text = String(value || "").trim();
    const key = normalizeSearchText(text);
    if (!text || seen.has(key)) return;
    if (query && !(starts || key.includes(query))) return;
    seen.add(key);
    suggestions.push({ text, starts });
  };

  state.parks.forEach((park) => {
    parkSearchValues(park).forEach((value) => {
      const normalized = normalizeSearchText(value);
      addValue(value, !query || normalized.startsWith(query));
    });
  });

  suggestions.sort((a, b) => Number(b.starts) - Number(a.starts) || a.text.localeCompare(b.text, "es"));
  datalist.innerHTML = suggestions
    .slice(0, 10)
    .map((item) => `<option value="${escapeHtml(item.text)}"></option>`)
    .join("");
}

function setReportMessage(text, ok = false) {
  els.reportMessage.textContent = text || "";
  els.reportMessage.classList.toggle("ok", ok);
}

function validateImageFile(file) {
  if (!file) return "Carga una foto del problema.";
  if (!FOTO_TYPES.includes(file.type)) return "La foto debe ser JPG, PNG o WEBP.";
  if (file.size <= 0 || file.size > FOTO_MAX_BYTES) return "La foto debe pesar maximo 4 MB.";
  return "";
}

function validateSelectedImages() {
  if (!state.selectedImages.length) return "Carga al menos una foto del problema.";
  if (state.selectedImages.length > FOTO_MAX_FILES) return `Puedes subir maximo ${FOTO_MAX_FILES} imagenes por reporte.`;
  for (const file of state.selectedImages) {
    const error = validateImageFile(file);
    if (error) return error;
  }
  return "";
}

function imageKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function addSelectedImages(files) {
  const existing = new Set(state.selectedImages.map(imageKey));
  const accepted = [];

  for (const file of files) {
    const error = validateImageFile(file);
    if (error) {
      setReportMessage(error);
      continue;
    }
    if (!existing.has(imageKey(file))) {
      accepted.push(file);
      existing.add(imageKey(file));
    }
  }

  if (state.selectedImages.length + accepted.length > FOTO_MAX_FILES) {
    setReportMessage(`Puedes subir maximo ${FOTO_MAX_FILES} imagenes por reporte.`);
    return;
  }

  state.selectedImages.push(...accepted);
  setReportMessage("");
  renderImagePreview();
}

function removeSelectedImage(index) {
  state.selectedImages.splice(index, 1);
  renderImagePreview();
}

function renderImagePreview() {
  els.imagePreviewContainer.innerHTML = "";

  if (!state.selectedImages.length) {
    els.fileUploadText.textContent = "Seleccionar imagenes";
    els.uploadLabel?.classList.remove("selected");
    return;
  }

  els.fileUploadText.textContent = `${state.selectedImages.length} imagen(es) seleccionadas`;
  els.uploadLabel?.classList.add("selected");

  state.selectedImages.forEach((file, index) => {
    const card = document.createElement("div");
    card.className = "preview-card";

    const image = document.createElement("img");
    image.className = "preview-image";
    image.alt = file.name || `Imagen ${index + 1}`;

    const reader = new FileReader();
    reader.onload = (event) => {
      image.src = event.target.result;
    };
    reader.readAsDataURL(file);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "preview-remove";
    button.textContent = "Quitar";
    button.addEventListener("click", () => removeSelectedImage(index));

    card.appendChild(image);
    card.appendChild(button);
    els.imagePreviewContainer.appendChild(card);
  });
}

async function loadParks() {
  try {
    const response = await fetch("/api/parques/mapa");
    const json = await response.json();
    if (!response.ok || !json.success) throw new Error("No se pudieron cargar los parques");

    state.parks = (json.data || [])
      .map(normalizePark)
      .filter((park) => Number.isFinite(park.latitud) && Number.isFinite(park.longitud));

    updateSearchSuggestions("");
    filterParks();

    if (state.filtered.length) selectPark(state.filtered[0].id_parque, false);
  } catch (error) {
    els.parksGrid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    els.mapList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    els.parksCounter.textContent = "Error";
  }
}

async function loadCourtsForPark(idParque) {
  const session = getSession();
  if (!session) return;

  const requestId = ++state.courtsRequestId;
  els.reportCourtSelect.disabled = true;
  els.reportCourtSelect.innerHTML = `<option value="">Cargando canchas...</option>`;
  if (els.courtCards) els.courtCards.innerHTML = "";

  try {
    const response = await fetch(`/api/reportes/parques/${idParque}/canchas`, {
      headers: { Authorization: `Bearer ${session.token}` }
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) throw new Error(json.error || "No se pudieron cargar las canchas");
    if (requestId !== state.courtsRequestId) return;

    const courts = json.data || [];
    if (!courts.length) {
      els.reportCourtSelect.innerHTML = `<option value="">Este parque no tiene canchas registradas</option>`;
      els.reportCourtSelect.disabled = true;
      renderCourtCards([]);
      return;
    }

    els.reportCourtSelect.innerHTML = `<option value="">Selecciona una cancha</option>` + courts.map((court) => `
      <option value="${court.id_cancha}">${escapeHtml(court.nombre)}${court.estado ? ` - ${escapeHtml(court.estado)}` : ""} - ${escapeHtml(court.hora_apertura || "06:00")}-${escapeHtml(court.hora_cierre || "20:00")}</option>
    `).join("");
    els.reportCourtSelect.disabled = false;
    renderCourtCards(courts);
  } catch (error) {
    els.reportCourtSelect.innerHTML = `<option value="">Error cargando canchas</option>`;
    els.reportCourtSelect.disabled = true;
    if (els.courtCards) els.courtCards.innerHTML = "";
    setReportMessage(error.message || "Error cargando canchas");
  }
}

function renderCourtCards(courts) {
  if (!els.courtCards) return;

  if (!courts.length) {
    els.courtCards.innerHTML = `<div class="empty-state">Sin canchas para este parque.</div>`;
    return;
  }

  els.courtCards.innerHTML = courts.map((court) => {
    const isClosedPark = Number(court.parque_abierto_ahora) !== 1;
    return `
      <button type="button" class="court-card" data-court-id="${court.id_cancha}">
        <strong>${escapeHtml(court.nombre || "Cancha sin nombre")}</strong>
        <span>${escapeHtml(court.estado || "Sin estado")} - Horario ${escapeHtml(court.hora_apertura || "06:00")}-${escapeHtml(court.hora_cierre || "20:00")}</span>
        <small>${isClosedPark ? "Parque cerrado en este momento" : "Parque abierto en este momento"}</small>
      </button>
    `;
  }).join("");

  els.courtCards.querySelectorAll("[data-court-id]").forEach((card) => {
    card.addEventListener("click", () => {
      els.reportCourtSelect.value = card.dataset.courtId;
      els.courtCards.querySelectorAll(".court-card").forEach((item) => item.classList.remove("active"));
      card.classList.add("active");
    });
  });
}

function filterParks() {
  const q = getSearchText();
  const status = els.status.value;
  const scored = [];

  state.parks.forEach((park) => {
    const match = parkMatchesQuery(park, q);
    const matchesStatus =
      status === "todos" ||
      (status === "abierto" && isParkOpen(park)) ||
      ((status === "cerrado" || status === "refaccion") && !isParkOpen(park));

    if (match.matches && matchesStatus) {
      scored.push({ park, score: q && match.starts ? 0 : 1 });
    }
  });

  state.filtered = q
    ? scored.sort((a, b) => a.score - b.score || a.park.nombre.localeCompare(b.park.nombre, "es")).map((item) => item.park)
    : scored.map((item) => item.park);

  updateSearchSuggestions(q);
  renderParks();
  renderMapList();
  renderMarkers();
}

function renderParks() {
  els.parksCounter.textContent = `${state.filtered.length} parque(s)`;

  if (!state.filtered.length) {
    els.parksGrid.innerHTML = `<div class="empty-state">No se encontraron parques con esos filtros.</div>`;
    return;
  }

  els.parksGrid.innerHTML = state.filtered.map((park) => `
    <article class="park-card ${state.selectedPark?.id_parque === park.id_parque ? "active" : ""}" data-park-id="${park.id_parque}">
      <span class="status ${statusClass(park)}">${statusLabel(park)}</span>
      <h3>${escapeHtml(park.nombre)}</h3>
      <p class="park-description">${escapeHtml(park.descripcion || "Sin descripcion registrada.")}</p>
      <div class="park-meta">
        <span>Zona: ${escapeHtml(park.nombre_zona || "Sin zona")}</span>
        <span>Canchas: ${Number(park.total_canchas || 0)}</span>
        <span>Horario: ${escapeHtml(scheduleLabel(park))}</span>
      </div>
    </article>
  `).join("");

  els.parksGrid.querySelectorAll("[data-park-id]").forEach((card) => {
    card.addEventListener("click", () => selectPark(Number(card.dataset.parkId)));
  });
}

function renderDetail() {
  const park = state.selectedPark;

  if (!park) {
    els.parkDetail.innerHTML = `
      <span class="section-label">Detalle</span>
      <p>Selecciona un parque para revisar su informacion.</p>
    `;
    els.reportParkName.value = "";
    els.reportCourtSelect.innerHTML = `<option value="">Selecciona primero un parque</option>`;
    els.reportCourtSelect.disabled = true;
    if (els.courtCards) els.courtCards.innerHTML = "";
    return;
  }

  els.reportParkName.value = park.nombre;
  els.parkDetail.innerHTML = `
    <span class="section-label">Detalle</span>
    <h3>${escapeHtml(park.nombre)}</h3>
    <div class="detail-list">
      <span><strong>Estado:</strong> ${statusLabel(park)}</span>
      <span><strong>Horario:</strong> ${escapeHtml(scheduleLabel(park))}</span>
      <span><strong>Zona:</strong> ${escapeHtml(park.nombre_zona || "Sin zona")}</span>
      <span><strong>Canchas:</strong> ${Number(park.total_canchas || 0)}</span>
      <span><strong>Latitud:</strong> ${park.latitud.toFixed(6)}</span>
      <span><strong>Longitud:</strong> ${park.longitud.toFixed(6)}</span>
    </div>
    <p class="section-sub">${escapeHtml(park.descripcion || "Sin descripcion registrada.")}</p>
  `;
}

function renderMapList() {
  if (!state.filtered.length) {
    els.mapList.innerHTML = `<div class="empty-state">Sin parques para mostrar en el mapa.</div>`;
    return;
  }

  els.mapList.innerHTML = state.filtered.map((park) => `
    <article data-map-park-id="${park.id_parque}">
      <span class="status ${statusClass(park)}">${statusLabel(park)}</span>
      <h3>${escapeHtml(park.nombre)}</h3>
      <p>${escapeHtml(park.nombre_zona || "Sin zona")} - ${Number(park.total_canchas || 0)} cancha(s)</p>
      <p>Horario ${escapeHtml(scheduleLabel(park))}</p>
    </article>
  `).join("");

  els.mapList.querySelectorAll("[data-map-park-id]").forEach((item) => {
    item.addEventListener("click", () => selectPark(Number(item.dataset.mapParkId)));
  });
}

function initMap() {
  state.map = L.map("map", {
    zoomAnimation: true,
    fadeAnimation: true,
    markerZoomAnimation: true,
    easeLinearity: 0.25,
    wheelDebounceTime: 40
  }).setView([-16.5, -68.15], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "OpenStreetMap",
    maxZoom: 19
  }).addTo(state.map);
}

function markerIcon(park) {
  const color = isParkOpen(park) ? "#4f9f67" : "#d96b6b";
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:28px;height:28px;border-radius:50% 50% 50% 0;background:${color};border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 6px 16px rgba(0,0,0,.32);"></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  });
}

function renderMarkers() {
  if (!state.map) return;

  state.markers.forEach((marker) => marker.remove());
  state.markers.clear();

  state.filtered.forEach((park) => {
    const marker = L.marker([park.latitud, park.longitud], { icon: markerIcon(park) }).addTo(state.map);
    marker.bindPopup(`
      <strong>${escapeHtml(park.nombre)}</strong><br>
      ${escapeHtml(park.nombre_zona || "Sin zona")}<br>
      ${statusLabel(park)}<br>
      Horario ${escapeHtml(scheduleLabel(park))}
    `);
    marker.on("click", () => selectPark(park.id_parque, false));
    state.markers.set(park.id_parque, marker);
  });

  if (state.filtered.length) {
    const group = L.featureGroup(Array.from(state.markers.values()));
    if (state.filtered.length === 1) {
      const park = state.filtered[0];
      state.map.flyTo([park.latitud, park.longitud], Math.max(state.map.getZoom(), 15), {
        animate: true,
        duration: 1,
        easeLinearity: 0.25
      });
    } else {
      state.map.fitBounds(group.getBounds().pad(.18), {
        animate: true,
        duration: 0.95,
        easeLinearity: 0.25,
        padding: [24, 24]
      });
    }
  }
}

function selectPark(id, openPopup = true) {
  const park = state.parks.find((item) => item.id_parque === id);
  if (!park) return;

  state.selectedPark = park;
  renderParks();
  renderDetail();
  loadCourtsForPark(park.id_parque);

  const marker = state.markers.get(id);
  if (marker && state.map) {
    state.map.flyTo([park.latitud, park.longitud], Math.max(state.map.getZoom(), 15), {
      animate: true,
      duration: 1.15,
      easeLinearity: 0.25
    });
    if (openPopup) {
      window.setTimeout(() => marker.openPopup(), 520);
    }
  }
}

function handleSearchInput() {
  filterParks();
}

async function submitReport(event) {
  event.preventDefault();
  setReportMessage("");

  const session = getSession();
  if (!session) return;
  if (!state.selectedPark) {
    setReportMessage("Selecciona primero un parque.");
    return;
  }

  const idCancha = Number(els.reportCourtSelect.value);
  if (!Number.isInteger(idCancha) || idCancha <= 0) {
    setReportMessage("Selecciona la cancha especifica del reporte.");
    return;
  }

  const descripcion = els.reportText.value.trim();
  if (descripcion.length < 10 || descripcion.length > 1000) {
    setReportMessage("La descripcion debe tener entre 10 y 1000 caracteres.");
    return;
  }

  const imageError = validateSelectedImages();
  if (imageError) {
    setReportMessage(imageError);
    return;
  }

  const button = els.reportForm.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "Enviando...";

  try {
    const formData = new FormData();
    formData.append("id_parque", String(state.selectedPark.id_parque));
    formData.append("id_cancha", String(idCancha));
    formData.append("descripcion", descripcion);

    state.selectedImages.forEach((imageFile) => {
      formData.append("imagenes", imageFile);
      formData.append("fechas_foto", new Date(imageFile.lastModified).toISOString());
    });

    const response = await fetch("/api/reportes", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}` },
      body: formData
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) throw new Error(json.error || "No se pudo registrar el reporte");

    els.reportText.value = "";
    els.reportImageFile.value = "";
    state.selectedImages = [];
    renderImagePreview();
    setReportMessage("Reporte enviado correctamente.", true);
  } catch (error) {
    setReportMessage(error.message || "Error enviando reporte");
  } finally {
    button.disabled = false;
    button.textContent = "Enviar reporte";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const session = getSession();
  if (!session) return;

  if (els.currentYear) els.currentYear.textContent = String(new Date().getFullYear());
  setSessionInfo(session.user);
  initMap();
  await loadParks();

  els.logoutBtn.addEventListener("click", logout);
  els.search.addEventListener("input", handleSearchInput);
  els.status.addEventListener("change", filterParks);
  window.addEventListener("resize", () => {
    if (state.map) state.map.invalidateSize();
  });
  els.reportImageFile.addEventListener("change", () => {
    addSelectedImages(Array.from(els.reportImageFile.files || []));
    els.reportImageFile.value = "";
  });
  els.reportCourtSelect.addEventListener("change", () => {
    if (!els.courtCards) return;
    els.courtCards.querySelectorAll(".court-card").forEach((item) => {
      item.classList.toggle("active", item.dataset.courtId === els.reportCourtSelect.value);
    });
  });
  els.reportForm.addEventListener("submit", submitReport);
});
