const otpForm = document.getElementById("otpForm");
const messageEl = document.getElementById("error");
const otpHint = document.getElementById("otpHint");

function setMessage(text, ok = false) {
  if (!messageEl) return;
  messageEl.textContent = text || "";
  messageEl.classList.toggle("ok", ok);
}

function redirectByRole(user) {
  if (Number(user.id_rol) === 1) {
    window.location.href = "/admin";
    return;
  }

  if (Number(user.id_rol) === 2) {
    window.location.href = "/admin-assets/gestor/dashboard/interfaces/index.html";
    return;
  }

  window.location.href = "/pages/usuario/dashboard.html";
}

function saveSession(data) {
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
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

const challengeId = Number(sessionStorage.getItem("twoFactorChallengeId"));
const emailMasked = sessionStorage.getItem("twoFactorEmailMasked");

if (!challengeId) {
  window.location.href = "/login";
}

if (emailMasked) {
  otpHint.textContent = `Ingresa el codigo enviado a ${emailMasked}.`;
}

document.getElementById("codigo")?.addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
});

otpForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");

  const codigo = document.getElementById("codigo").value.trim();
  const button = otpForm.querySelector("button[type='submit']");

  if (!/^\d{6}$/.test(codigo)) {
    setMessage("El codigo debe tener 6 digitos numericos.");
    return;
  }

  button.disabled = true;
  button.textContent = "Verificando...";

  try {
    const data = await postJson("/api/auth/2fa/verify", {
      challengeId,
      codigo
    });

    if (!data.token || !data.user) {
      throw new Error("Respuesta de verificacion incompleta");
    }

    sessionStorage.removeItem("twoFactorChallengeId");
    sessionStorage.removeItem("twoFactorEmailMasked");
    saveSession(data);
    setMessage("Codigo correcto. Redirigiendo...", true);
    setTimeout(() => redirectByRole(data.user), 450);
  } catch (error) {
    setMessage(error.message || "Codigo incorrecto o expirado");
  } finally {
    button.disabled = false;
    button.textContent = "Verificar codigo";
  }
});
