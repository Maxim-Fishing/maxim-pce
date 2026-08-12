# Maxim PCE — App de herramientas y equipos de presión

Aplicación web (y móvil, se ve bien en el teléfono) para consultar y administrar el
inventario de herramientas y equipos de presión de Maxim Fishing, conectada a Supabase.

Esta primera versión incluye: **login con usuarios propios**, **lista de ítems con
búsqueda** por código / S/N / descripción, **filtros** por línea y estado, y el
**código resaltado por partes** (línea · tipo · medida). Los permisos por rol
(admin / operador / consulta) ya están protegidos en la base de datos.

---

## 1. Requisitos
- Node.js 18 o superior (https://nodejs.org).

## 2. Instalar y ejecutar
```bash
npm install
cp .env.example .env      # en Windows: copy .env.example .env
```
Abre el archivo `.env` y pega tu **clave anon public**:
Supabase → tu proyecto **Maxim-PCE** → Project Settings → API → "anon public".
(La URL ya viene puesta.)

```bash
npm run dev
```
Abre la dirección que muestra la terminal (normalmente http://localhost:5173).

## 3. Crear tu primer usuario (administrador)
Los usuarios NO se registran solos; los creas tú:
1. Supabase → **Authentication** → **Add user** → correo y contraseña.
2. Copia el **User UID** que aparece.
3. Supabase → **SQL Editor** y ejecuta (reemplaza el UID y el nombre):
```sql
insert into profiles (id, nombre, rol)
values ('PEGA-AQUI-EL-UID', 'Cristian Repizo', 'admin');
```
Roles posibles: `admin`, `operador`, `consulta`.

## 4. Subir a un repositorio (GitHub)
```bash
git init
git add .
git commit -m "Primera versión Maxim PCE"
```
Crea un repositorio vacío en GitHub y sigue las instrucciones para conectar y hacer `git push`.
El archivo `.env` NO se sube (está en `.gitignore`) — así tus claves quedan protegidas.

## 5. Publicar en internet (Vercel — gratis)
1. Entra a https://vercel.com e importa el repositorio de GitHub.
2. En "Environment Variables" agrega las dos:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy. Vercel te da un enlace que puedes abrir desde el celular.

---

## Estructura del proyecto
```
src/
  App.jsx               Decide si mostrar Login o la app segun la sesion
  supabaseClient.js     Conexion a Supabase
  lib/useSession.js     Sesion + perfil (nombre y rol) del usuario
  pages/Login.jsx       Pantalla de inicio de sesion
  pages/Items.jsx       Lista de items con busqueda, filtros y paginacion
  components/CodigoTag   Resalta las partes del codigo (linea/tipo/medida)
  styles.css            Tema industrial oscuro (naranja/negro)
```

## Lo que sigue (próximas versiones)
- Ficha de cada ítem con sus documentos (estáticos y por ciclo).
- Registro de mantenimiento con los formularios WL (y WS después).
- Tablero de vencimientos (cumplidos / por vencer / vencidos) con alerta a 10 días.
- Carga de PDF al bucket `documentos`, en subcarpetas por categoría/tipo/código.
