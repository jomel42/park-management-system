import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD || process.env.EMAIL_PASS
  }
});

export async function sendVerificationEmail(email, nombre, codigo) {
  await transporter.sendMail({
    from: `"Parques La Paz" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verifica tu cuenta — Parques La Paz',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#2d6a4f">Hola, ${nombre}</h2>
        <p>Usa este código para verificar tu cuenta en <strong>Parques La Paz</strong>:</p>
        <div style="
          font-size:36px;
          font-weight:bold;
          letter-spacing:10px;
          color:#1b4332;
          background:#d8f3dc;
          padding:20px;
          text-align:center;
          border-radius:8px;
          margin:24px 0;
        ">${codigo}</div>
        <p style="color:#666">Este código expira en <strong>15 minutos</strong>.</p>
        <p style="color:#999;font-size:12px">Si no creaste esta cuenta, ignora este correo.</p>
      </div>
    `
  });
}

export async function sendLoginOtpEmail(email, nombre, codigo) {
  await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || 'Parques La Paz'}" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Codigo de acceso - Parques La Paz',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#2d6a4f">Hola, ${nombre}</h2>
        <p>Usa este codigo para completar tu inicio de sesion:</p>
        <div style="
          font-size:36px;
          font-weight:bold;
          letter-spacing:10px;
          color:#1b4332;
          background:#d8f3dc;
          padding:20px;
          text-align:center;
          border-radius:8px;
          margin:24px 0;
        ">${codigo}</div>
        <p style="color:#666">Este codigo expira en <strong>5 minutos</strong>.</p>
        <p style="color:#999;font-size:12px">Si no intentaste iniciar sesion, cambia tu contrasena.</p>
      </div>
    `
  });
}
