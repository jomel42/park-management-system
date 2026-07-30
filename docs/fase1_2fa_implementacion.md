# Fase 1 - Implementacion 2FA

## Archivos principales

- `database/001_create_otp_codes.sql`
- `src/modules/otp/`
- `src/middlewares/auth.middleware.js`
- `src/middlewares/roles.middleware.js`
- `src/middlewares/rate-limit.middleware.js`
- `public/pages/otp.html`
- `public/js/otp.js`

## Flujo

1. `POST /api/auth/login` valida email y contrasena.
2. Si el usuario tiene `id_rol` 1 o 2, se genera OTP, se guarda en `otp_codes` y se envia por Gmail.
3. El frontend redirige a `/otp`.
4. `POST /api/auth/2fa/verify` valida el codigo.
5. Si el codigo es correcto, se invalida y se genera el JWT definitivo.
6. Usuarios con `id_rol` 3 siguen entrando con el flujo anterior.

## Variables necesarias

Usar `EMAIL_APP_PASSWORD` para Gmail. El servicio mantiene compatibilidad temporal con `EMAIL_PASS`, pero la variable recomendada es:

```env
EMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

## Paso obligatorio en MySQL

Ejecutar antes de probar login de administrador o gestor:

```sql
SOURCE database/001_create_otp_codes.sql;
```

O copiar el contenido del archivo SQL en el cliente MySQL.

