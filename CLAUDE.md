# nexolu-comms-front

Panel operativo dedicado de `nexolu-comms-api` (Vue 3 + Vite). Consume
**exclusivamente** ese servicio, directo (sin BFF): auth en `/panel/*`,
todo lo demás en `/v1/admin/*` y `/v1/platform/*`, autenticado con el JWT
del panel — **nunca** con `NEXOLU_PLATFORM_API_KEY`, que es server-side y
jamás debe viajar a un navegador.

## Por qué un repo aparte de nexolu-admin-front

`nexolu-admin-front` es el panel **interno de infraestructura** de todo
Nexolú (droplets, deploys, pagos, IA) con un proxy mínimo de comms. Este
panel es el **front del canal de comunicaciones**: procesos,
configuraciones y capacidades **por negocio** (webhooks con reintento,
números propios por Embedded Signup, y en fases siguientes plantillas y
catálogo — ver `nexolu-utils/docs/research/whatsapp-plan-implementacion.md`).
Scaffold copiado de `nexolu-admin-front` (mismo stack y tema); la
divergencia deliberada: sin concepto de ambiente en la URL (una instancia
del panel = una instancia de comms-api). Auth: SSO con auth.nexolu.co
(producto `nexolu-connect`) + login local. Dos roles con distinción dura:
`platform` (admin Nexolú, ve todo, único que ve **Usuarios**) y `client`
(negocio externo, el backend recorta todo a sus apps por scope — el menú
por rol en `router/navigation.ts` es solo UX). Dominio: connect.nexolu.co.

## Reglas del proyecto (heredadas del ecosistema)

- **Rutas del frontend en español** (`/iniciar-sesion`, `/canales`); el
  `name` interno y los identificadores de código en inglés. Textos
  visibles en español.
- **Tema**: `src/theme/nexoluPreset.ts` (Aura + indigo de marca, el mismo
  preset de nexolu-pos-front/nexolu-admin-front). No cambiarlo sin
  decidirlo antes con el usuario.
- **Sin capa Nexolú UI**: PrimeVue directo, igual que nexolu-admin-front.
- **Tipos espejo**: `src/types/*.ts` reflejan schemas de
  `nexolu-comms-api` — mantener sincronizados y decir de qué archivo
  Python vienen.

## Correr en local

```bash
npm install
npm run dev        # Vite en http://localhost:5173
```

Necesita `nexolu-comms-api` corriendo (por defecto en `:8010`, ver
`.env.example`) con `PANEL_EMAIL`, `PANEL_PASSWORD_HASH` (bcrypt),
`PANEL_JWT_SECRET` y `PANEL_CORS_ORIGINS=http://localhost:5173` en su
`.env`.

## Verificación

```bash
npm run type-check
npm run lint
npm run build
```
