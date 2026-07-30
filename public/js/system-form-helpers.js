(function () {
  "use strict";

  const NAME_RE = /^[\p{L}][\p{L}\s'-]{1,59}$/u;
  const DISALLOWED_SEARCH_RE = /[<>`{}[\]\\]/g;

  function stripAccents(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function normalizeForSearch(value) {
    return stripAccents(value)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function sanitizeName(value, max = 60) {
    return String(value || "")
      .replace(/[^\p{L}\s'-]/gu, "")
      .replace(/\s{2,}/g, " ")
      .slice(0, max);
  }

  function sanitizeSearch(value, max = 80) {
    return String(value || "")
      .replace(DISALLOWED_SEARCH_RE, "")
      .replace(/\s{2,}/g, " ")
      .slice(0, max);
  }

  function isValidName(value) {
    const text = String(value || "").trim();
    return !text || NAME_RE.test(text);
  }

  function fieldKey(input) {
    return [
      input.id,
      input.name,
      input.getAttribute("aria-label"),
      input.getAttribute("placeholder"),
      input.dataset.validate
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function setInvalid(input, message) {
    input.setCustomValidity(message || "");
    input.classList.toggle("is-invalid", Boolean(message && input.value.trim()));
  }

  function wireNameField(input) {
    if (input.readOnly || input.disabled) return;
    input.maxLength = Math.min(Number(input.maxLength > 0 ? input.maxLength : 60), 60);
    input.title = input.title || "Solo letras, espacios, apostrofe y guion.";

    input.addEventListener("input", () => {
      const cleaned = sanitizeName(input.value, input.maxLength || 60);
      if (input.value !== cleaned) input.value = cleaned;
      setInvalid(input, isValidName(input.value) ? "" : "Ingresa solo letras en este campo.");
    });

    input.addEventListener("blur", () => {
      input.value = input.value.trim().replace(/\s+/g, " ");
      setInvalid(input, isValidName(input.value) ? "" : "Ingresa solo letras en este campo.");
    });
  }

  function wireSearchField(input) {
    if (input.disabled) return;
    input.maxLength = Math.min(Number(input.maxLength > 0 ? input.maxLength : 80), 80);
    input.autocomplete = input.autocomplete || "off";

    input.addEventListener("input", () => {
      const cleaned = sanitizeSearch(input.value, input.maxLength || 80);
      if (input.value !== cleaned) input.value = cleaned;
    });
  }

  function uniqueSuggestions(items, query, limit = 8) {
    const q = normalizeForSearch(query);
    const values = Array.from(new Set(
      items
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    ));

    const starts = [];
    const contains = [];

    values.forEach((value) => {
      const normalized = normalizeForSearch(value);
      if (!q || normalized.startsWith(q)) starts.push(value);
      else if (normalized.includes(q)) contains.push(value);
    });

    return starts.concat(contains).slice(0, limit);
  }

  function fillDatalist(datalist, values) {
    if (!datalist) return;
    datalist.innerHTML = values
      .map((value) => `<option value="${String(value).replaceAll('"', "&quot;")}"></option>`)
      .join("");
  }

  function init() {
    document.querySelectorAll("input[type='text'], input:not([type]), input[type='search']").forEach((input) => {
      const key = fieldKey(input);
      if (key.includes("nombre") || key.includes("apellido") || input.dataset.validate === "name") {
        wireNameField(input);
      } else if (input.type === "search" || input.classList.contains("input-buscar")) {
        wireSearchField(input);
      }
    });

    document.querySelectorAll("textarea").forEach((textarea) => {
      textarea.addEventListener("input", () => {
        const cleaned = sanitizeSearch(textarea.value, textarea.maxLength > 0 ? textarea.maxLength : 1000);
        if (textarea.value !== cleaned) textarea.value = cleaned;
      });
    });
  }

  window.SystemFormHelpers = {
    normalizeForSearch,
    sanitizeName,
    sanitizeSearch,
    isValidName,
    uniqueSuggestions,
    fillDatalist
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
