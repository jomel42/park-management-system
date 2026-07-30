const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const messageEl = document.getElementById("error");

function setMessage(text, ok = false) {
  if (!messageEl) return;
  messageEl.textContent = text || "";
  messageEl.classList.toggle("ok", ok);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function isValidName(value) {
  return /^[\p{L}\s'-]{2,60}$/u.test(value);
}

function sanitizeName(value) {
  return String(value || "")
    .replace(/[^\p{L}\s'-]/gu, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, 60);
}

function sanitizeNumericCode(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function getPasswordError(password) {
  if (password.length < 8 || password.length > 72) {
    return "La contrasena debe tener entre 8 y 72 caracteres.";
  }

  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return "La contrasena debe incluir mayuscula, minuscula, numero y simbolo.";
  }

  return "";
}

function redirectByRole(user) {
  if (Number(user.id_rol) === 1) {
    window.location.href = "/admin";
    return;
  }

  if (Number(user.id_rol) === 2) {
    // AQUÍ ESTÁ LA CORRECCIÓN: Apuntando a la interfaz real del Gestor
    window.location.href = "/admin-assets/gestor/dashboard/interfaces/index.html";
    return;
  }

  window.location.href = "/pages/usuario/dashboard.html";
}

function saveSession(data) {
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
}

function saveTwoFactorChallenge(data) {
  sessionStorage.setItem("twoFactorChallengeId", String(data.challengeId));
  sessionStorage.setItem("twoFactorEmailMasked", data.emailMasked || "");
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "No se pudo completar la solicitud");
  }

  return data;
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("");

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const button = loginForm.querySelector("button[type='submit']");

    if (!email || !password) {
      setMessage("Completa correo y contrasena.");
      return;
    }

    if (!isValidEmail(email)) {
      setMessage("Ingresa un correo electronico valido.");
      return;
    }

    if (password.length < 6 || password.length > 72) {
      setMessage("La contrasena no tiene un formato valido.");
      return;
    }

    button.disabled = true;
    button.textContent = "Validando acceso...";

    try {
      const data = await postJson("/api/auth/login", {
        email,
        password
      });

      if (data.requires2FA) {
        if (!data.challengeId) {
          throw new Error("Respuesta 2FA incompleta");
        }

        saveTwoFactorChallenge(data);
        setMessage("Codigo enviado. Redirigiendo a verificacion...", true);
        setTimeout(() => {
          window.location.href = "/otp";
        }, 450);
        return;
      }

      if (!data.token || !data.user) {
        throw new Error("Respuesta de login incompleta");
      }

      saveSession(data);
      setMessage("Ingreso correcto. Redirigiendo segun tu rol...", true);
      setTimeout(() => redirectByRole(data.user), 450);
    } catch (error) {
      setMessage(error.message || "Credenciales incorrectas");
    } finally {
      button.disabled = false;
      button.textContent = "Entrar al sistema";
    }
  });
}
if (registerForm) {
  let registroPendienteEmail = null; // guarda el email entre pasos

  ["nombre", "apellido_paterno", "apellido_materno"].forEach((id) => {
    const input = document.getElementById(id);
    input?.addEventListener("input", () => {
      const cleaned = sanitizeName(input.value);
      if (input.value !== cleaned) input.value = cleaned;
    });
  });

  document.getElementById("codigo_verificacion")?.addEventListener("input", (event) => {
    event.target.value = sanitizeNumericCode(event.target.value);
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("");

    const button           = registerForm.querySelector("button[type='submit']");
    const verificacionStep = document.getElementById("verificacionStep");

    // ── PASO 2: ya mandamos el código, ahora verificamos ──────────────────
    if (registroPendienteEmail) {
      const codigo = document.getElementById("codigo_verificacion").value.trim();

      if (!/^\d{6}$/.test(codigo)) {
        setMessage("El codigo debe tener 6 digitos numericos.");
        return;
      }

      button.disabled    = true;
      button.textContent = "Verificando...";

      try {
        const data = await postJson("/api/auth/verify-email", {
          email:  registroPendienteEmail,
          codigo
        });

        if (!data.token || !data.user) throw new Error("Respuesta de verificacion incompleta");

        saveSession(data);
        setMessage("Cuenta verificada. Bienvenido, redirigiendo...", true);
        setTimeout(() => redirectByRole(data.user), 650);

      } catch (error) {
        setMessage(error.message || "Codigo incorrecto o expirado");
      } finally {
        button.disabled    = false;
        button.textContent = "Verificar codigo";
      }

      return;
    }

    // ── PASO 1: validar campos y enviar código ────────────────────────────
    const nombre            = normalizeName(document.getElementById("nombre").value);
    const apellido_paterno  = normalizeName(document.getElementById("apellido_paterno").value);
    const apellido_materno  = normalizeName(document.getElementById("apellido_materno").value);
    const email             = document.getElementById("email").value.trim().toLowerCase();
    const password          = document.getElementById("password").value;
    const passwordConfirm   = document.getElementById("password_confirm").value;

    if (!nombre || !apellido_paterno || !apellido_materno || !email || !password || !passwordConfirm) {
      setMessage("Completa todos los campos del registro.");
      return;
    }

    if (!isValidName(nombre) || !isValidName(apellido_paterno) || !isValidName(apellido_materno)) {
      setMessage("Nombre y apellidos deben tener entre 2 y 60 letras.");
      return;
    }

    if (!isValidEmail(email)) {
      setMessage("Ingresa un correo electronico valido.");
      return;
    }

    const passwordError = getPasswordError(password);
    if (passwordError) { setMessage(passwordError); return; }

    if (password !== passwordConfirm) {
      setMessage("Las contrasenas no coinciden.");
      return;
    }

    button.disabled    = true;
    button.textContent = "Enviando codigo...";

    try {
      await postJson("/api/auth/register", {
        nombre, apellido_paterno, apellido_materno, email, password
      });

      // Guardamos el email para el paso 2
      registroPendienteEmail = email;

      // Mostrar campo de código y ocultar campos de registro
      verificacionStep.style.display = "block";
      registerForm.querySelectorAll("label:not(#verificacionStep label)").forEach(el => {
        el.style.display = "none";
      });

      button.textContent = "Verificar codigo";
      setMessage(
        `Codigo enviado a ${email}. Revisa tu bandeja (o spam) e ingresalo aqui.`,
        true
      );

    } catch (error) {
      setMessage(error.message || "No se pudo crear la cuenta");
    } finally {
      button.disabled = false;
    }
  });
}
