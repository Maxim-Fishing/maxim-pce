# Maxim PCE — NEXUS TOOLS

Aplicación web y móvil para administrar y controlar el mantenimiento de las
**herramientas y equipos de presión** de Maxim Fishing. Funciona como módulo
**Mtto Operativo** dentro de NEXUS TOOLS.

- **En producción:** https://maxim-fishing.github.io/maxim-pce/
- **Backend de datos:** Supabase (proyecto *Maxim-PCE*) — Auth, base de datos y Storage.
- **Backend de archivos:** Google Apps Script + Google Drive (reflejo y sincronización de PDFs).

Incluye: login con usuarios propios y roles, inventario con búsqueda y filtros,
fichas (hoja de vida) con documentos estáticos, ciclos de mantenimiento con
alertas de vencimiento, dashboard, movilización de equipos, formulario Wireline,
generación del reporte MF-F-MTO-025 y **sincronización masiva de certificados
(NDT / PH / COC) desde Drive**.

---

## 1. Cómo está construida

> ⚠️ La app en producción es **un solo archivo: `Index.html`** (HTML + JavaScript
> vanilla, sin framework ni paso de build). Los archivos de React/Vite
> (`package.json`, `vite.config.js`, `.env.example`, `index .html` con espacio)
> son de un scaffold anterior y **no son lo que está desplegado** — se conservan
> solo como referencia.

Archivos relevantes en esta carpeta:

```
Index.html        La aplicación completa en producción (editar aquí).
apps-script.gs    Código de Google Apps Script (backend de Drive). Se pega en el editor de Apps Script.
logo.png          Logo.
intro.mp4 / acceso.mp4   Videos de la portada.
```

Configuración incrustada en `Index.html` (cerca del inicio del `<script>`):

```js
const URL_SB      = "https://ryfhzlbvcqnxaptltslo.supabase.co";  // proyecto Supabase
const KEY         = "sb_publishable_...";                        // clave publicable (pública, correcta)
const DRIVE_URL   = "https://script.google.com/macros/s/.../exec"; // Web App de Apps Script
const DRIVE_TOKEN = "maxim-pce-2026";                            // debe coincidir con TOKEN del Apps Script
```

La clave de Supabase es la **publicable** (antes "anon"): es pública por diseño y
la seguridad real la dan las políticas **RLS** de la base de datos.

---

## 2. Roles

Se asignan en Supabase (no hay auto-registro):

| Rol | Puede |
|-----|-------|
| `admin` | Control total: fichas, mantenimientos, documentos, unidades, dashboard y sincronizaciones. |
| `operador` | Registrar mantenimientos y subir documentos de ciclo; consulta inventario y dashboard. |
| `consulta` | Solo lectura: fichas, documentos, dashboard y alertas. |

Crear un usuario:
1. Supabase → **Authentication** → **Add user** (correo y contraseña).
2. Copia el **User UID**.
3. Supabase → **SQL Editor**:
```sql
insert into profiles (id, nombre, rol)
values ('UID-DEL-USUARIO', 'Nombre Apellido', 'admin');
```

---

## 3. Modelo de documentos

El vínculo real es por `item_id`; el **código** del ítem es el puente para encontrarlo.

- **Estáticos** (`documentos_estaticos`): **COC**, ficha técnica y manual O&M. Uno por
  ítem. Se ven en la ficha.
- **Dinámicos** (`documentos_dinamicos`): reportes, NDT y pruebas, ligados a un
  **ciclo de mantenimiento**.

El campo `archivo_path` puede ser una ruta de Supabase Storage (bucket `documentos`)
**o** una URL de Google Drive. La app abre ambas correctamente.

Ruta de archivos en Drive/Storage: **`Categoría / Tipo / Código`**
(ej. `equipo / EPLST312F / EPLST312F0058`).

Estructura del código (resaltado por partes en la interfaz): `EP · LST · 312 · F0058`
→ **línea** (2) · **tipo** (3) · **medida** (3) · **serie** (resto).

---

## 4. Backend de Drive (Apps Script)

El archivo `apps-script.gs` vive en tu cuenta de Google y expone un Web App.
Carpetas configuradas dentro del script:

```js
CARPETAS.herramienta   // raíz de herramientas
CARPETAS.equipo        // raíz de equipos de presión
NDT_FOLDER_NAME        // carpeta de certificados NDT
PH_FOLDER_ID           // carpeta de pruebas hidrostáticas
COC_INBOX_ID           // carpeta "bandeja" de COC nuevos
```

**Actualizar el Apps Script:** editor de Apps Script → pega `apps-script.gs` →
Guardar → **Implementar → Administrar implementaciones → editar la existente →
Versión: "Nueva versión" → Implementar**.
⚠️ Siempre *editar la implementación existente* para conservar la misma URL
(`DRIVE_URL`); crear una nueva la cambiaría y rompería la conexión.

---

## 5. Sincronización masiva desde Drive (solo admin)

En la vista **Resumen**, botones **SINCRONIZAR NDT / PH / COC**. Cada uno lee su
carpeta de Drive, extrae el **código del nombre del archivo**, lo busca en el
inventario y lo enlaza.

Formato de código en el nombre: `EPLST312F0058`
(patrón `(EL|EP|FB|SL|SW|WL|WS|WT) + letra + 2 + 3 dígitos + letra + 3-4 dígitos`).
Un archivo puede contener varios códigos separados por `_`.

### COC (Certificados de Conformidad)
1. Suelta los COC en la **carpeta bandeja** (`COC_INBOX_ID`), con el código en el
   nombre (ej. `COC_EPLST312F0058.pdf`).
2. Entra como **admin** → **Resumen** → **SINCRONIZAR COC**.
3. La app **verifica los códigos**:
   - Los que existen se enlazan.
   - Los que **no existen** se listan; puedes **crearlos** en el momento
     (eligiendo la categoría) o solo enlazar los existentes.
4. Cada COC se enlaza en la ficha (`documentos_estaticos`, tipo `coc`) y su archivo
   se **mueve** de la bandeja a su ruta final `Categoría / Tipo / Código`.

Es idempotente: reprocesar la carpeta no duplica (el archivo movido ya no aparece
en la bandeja y el enlace se actualiza).

---

## 6. Publicar cambios

La app se sirve por **GitHub Pages** desde el repositorio `maxim-fishing/maxim-pce`.
Para publicar una nueva versión, sube el `Index.html` actualizado a ese repositorio
(reemplaza el archivo y confirma el cambio). GitHub Pages actualiza el sitio en
unos minutos.

---

## Historial de cambios
- **Sincronización de COC desde Drive** con verificación y creación de ítems faltantes.
- Generación del reporte de mantenimiento **MF-F-MTO-025** en PDF.
- Sincronización de **NDT** y **PH** desde Drive.
- Movilización de equipos, dashboard y alertas de vencimiento.
