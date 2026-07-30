(() => {
  const nearbyPattern = /cerca|cercano|ubicacion|donde queda|cancha cerca/i;

  function getSession() {
    const token = localStorage.getItem("token");
    return token ? { token } : null;
  }

  function getBrowserLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  function createWidget() {
    if (document.getElementById("chatbotWidget")) return;

    const root = document.createElement("section");
    root.id = "chatbotWidget";
    root.innerHTML = `
      <button class="chatbot-floating-button" id="chatbotOpen" type="button" aria-label="Abrir asistente">
        <span class="chatbot-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 3a8 8 0 0 0-8 8v4.2c0 1 .8 1.8 1.8 1.8H8v-6H5.8V11a6.2 6.2 0 0 1 12.4 0v.2H16v6h2.2c1 0 1.8-.8 1.8-1.8V11a8 8 0 0 0-8-8Z"/>
            <path d="M8.8 13.4c.7.9 1.8 1.4 3.2 1.4s2.5-.5 3.2-1.4"/>
          </svg>
        </span>
      </button>
      <div class="chatbot-container hidden" id="chatbotPanel" role="dialog" aria-label="Asistente de parques">
        <header class="chatbot-header">
          <div>
            <strong>Asistente de parques</strong>
            <small>La Paz</small>
          </div>
          <button class="chatbot-close" id="chatbotClose" type="button" aria-label="Cerrar">x</button>
        </header>
        <div class="chatbot-messages" id="chatbotMessages"></div>
        <div class="quick-actions" id="chatbotQuickActions">
          <button class="quick-btn" type="button" data-question="parques cercanos">Parques cerca</button>
          <button class="quick-btn" type="button" data-question="como reportar un problema">Reportar</button>
          <button class="quick-btn" type="button" data-question="parques abiertos y horarios">Horarios</button>
          <button class="quick-btn" type="button" data-question="canchas registradas">Canchas</button>
        </div>
        <section class="chatbot-map-shell hidden" id="chatbotMapShell" aria-label="Mapa de parques cercanos">
          <div class="chatbot-map-head">
            <span>Parques cercanos</span>
            <button type="button" id="chatbotMapClose" aria-label="Cerrar mapa">Cerrar</button>
          </div>
          <div id="chatbotMap"></div>
        </section>
        <form class="chatbot-input-container" id="chatbotForm">
          <input class="chatbot-input" id="chatbotInput" maxlength="300" placeholder="Pregunta por parques, canchas o reportes..." autocomplete="off">
          <button class="chatbot-send" type="submit">Enviar</button>
        </form>
      </div>
    `;
    document.body.appendChild(root);

    const open = root.querySelector("#chatbotOpen");
    const close = root.querySelector("#chatbotClose");
    const panel = root.querySelector("#chatbotPanel");
    const form = root.querySelector("#chatbotForm");
    const input = root.querySelector("#chatbotInput");
    const messages = root.querySelector("#chatbotMessages");
    const mapEl = root.querySelector("#chatbotMap");
    const mapShell = root.querySelector("#chatbotMapShell");
    const mapClose = root.querySelector("#chatbotMapClose");
    let map = null;
    let markers = [];
    let tileLayer = null;

    function addMessage(text, type = "bot") {
      const el = document.createElement("div");
      el.className = type === "user" ? "user-message" : "bot-message";
      el.textContent = text;
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
      return el;
    }

    function destroyMap() {
      markers.forEach((marker) => marker.remove());
      markers = [];
      if (tileLayer) {
        tileLayer.remove();
        tileLayer = null;
      }
      if (map) {
        map.remove();
        map = null;
      }
      mapShell.classList.add("hidden");
    }

    function renderMap(parks) {
      destroyMap();
      if (!Array.isArray(parks) || !parks.length || typeof L === "undefined") return;

      mapShell.classList.remove("hidden");
      setTimeout(() => {
        map = L.map(mapEl, {
          zoomControl: false,
          attributionControl: false,
          zoomAnimation: true,
          fadeAnimation: true,
          markerZoomAnimation: true,
          easeLinearity: 0.25
        })
          .setView([parks[0].latitud, parks[0].longitud], 13);
        tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "OpenStreetMap",
          maxZoom: 19
        }).addTo(map);

        markers = parks
          .filter((park) => Number.isFinite(Number(park.latitud)) && Number.isFinite(Number(park.longitud)))
          .map((park) => {
            const abierto = Number(park.esta_abierto) === 1;
            const color = abierto ? "#4caf50" : "#d96b6b";
            const icon = L.divIcon({
              className: "",
              html: `<span style="display:block;width:24px;height:24px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 6px 16px rgba(0,0,0,.32);"></span>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            });
            const distance = Number.isFinite(Number(park.distancia_km))
              ? ` - ${Number(park.distancia_km || 0).toFixed(2)} km`
              : "";
            return L.marker([Number(park.latitud), Number(park.longitud)], { icon })
              .addTo(map)
              .bindPopup(`${park.nombre}${distance}<br>${abierto ? "Abierto" : "Cerrado"}<br>Horario ${park.hora_apertura || "06:00"}-${park.hora_cierre || "20:00"}`);
          });

        if (markers.length) {
          map.fitBounds(L.featureGroup(markers).getBounds().pad(0.18), {
            animate: true,
            duration: 0.85,
            easeLinearity: 0.25,
            padding: [18, 18]
          });
        }
        map.invalidateSize();
      }, 80);
    }

    async function send(question) {
      const session = getSession();
      if (!session) {
        addMessage("Inicia sesion para usar el asistente.");
        return;
      }

      const cleanQuestion = String(question || "").trim();
      if (!cleanQuestion) return;

      addMessage(cleanQuestion, "user");
      input.value = "";
      const pending = addMessage("Consultando...");

      let location = null;
      if (nearbyPattern.test(cleanQuestion)) {
        location = await getBrowserLocation();
        if (!location) {
          pending.textContent = "Necesito permiso de ubicacion para buscar parques cercanos.";
          return;
        }
      }

      try {
        const response = await fetch("/api/chatbot/message", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.token}`
          },
          body: JSON.stringify({ question: cleanQuestion, location })
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.ok) throw new Error(json.error || json.message || "No se pudo responder.");
        pending.textContent = json.message;
        renderMap(json.context?.parks);
      } catch (error) {
        pending.textContent = error.message || "Error del asistente.";
      }
    }

    addMessage("Hola. Puedo ayudarte con parques, canchas, ubicaciones y reportes del sistema.");

    open.addEventListener("click", () => {
      panel.classList.toggle("hidden");
      if (!panel.classList.contains("hidden") && map) {
        setTimeout(() => map.invalidateSize(), 80);
      }
    });
    close.addEventListener("click", () => {
      destroyMap();
      panel.classList.add("hidden");
    });
    mapClose.addEventListener("click", destroyMap);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      send(input.value);
    });
    root.querySelectorAll("[data-question]").forEach((button) => {
      button.addEventListener("click", () => send(button.dataset.question));
    });
  }

  document.addEventListener("DOMContentLoaded", createWidget);
})();
