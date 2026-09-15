# Conectar Supabase

Guía paso a paso. No hace falta saber SQL: sólo copiar, pegar y correr.

## 1. Crear el proyecto

1. Entra a [supabase.com](https://supabase.com) y crea un proyecto.
2. Anota la región y la contraseña de la base (no la necesita la app, pero sí
   tú si algún día entras por `psql`).

## 2. Crear las tablas

1. En el panel, abre **SQL Editor › New query**.
2. Pega completo el contenido de
   [`supabase/migrations/0001_cuaderno.sql`](../supabase/migrations/0001_cuaderno.sql).
3. **Run.**
4. Repite con las migraciones siguientes, en orden numérico:
   [`0002_interletrado.sql`](../supabase/migrations/0002_interletrado.sql) y
   [`0003_formato_en_vivo.sql`](../supabase/migrations/0003_formato_en_vivo.sql).
   Si ya tenías la base creada antes de ellas, córrelas ahora: sin esas
   columnas, los ajustes no se sincronizan. Son idempotentes, así que correr
   una que ya estaba aplicada no hace daño.

Ese script crea tres tablas (`documents`, `settings`, `fonts`), enciende RLS
con una política por dueño en cada una, agrega `documents` a Realtime y crea el
bucket `fonts` en Storage. Es idempotente: volver a correrlo no rompe nada, así
que puedes repetirlo si algo falló a la mitad.

Para comprobar que quedó: **Table Editor** debe mostrar las tres tablas, cada
una con el candado de *RLS enabled*.

## 3. Permitir el regreso del enlace de correo

La sesión se abre con un enlace mágico: Supabase manda un correo y ese enlace
regresa a tu sitio. Hay que decirle a dónde puede regresar.

En **Authentication › URL Configuration**:

- **Site URL**: la dirección principal de tu cuaderno, por ejemplo
  `https://nadanadaorion.github.io/cuaderno/`.
- **Redirect URLs**: agrega esa misma, y también `http://localhost:8000` si vas
  a trabajar en tu máquina.

Si falta este paso, el enlace llega al correo pero al abrirlo Supabase lo
rechaza.

## 4. Poner las credenciales en la app

En **Project Settings › API** copia:

- **Project URL**
- la clave **anon** / **publishable**

Para trabajar en tu máquina, ponlas en `config.js`:

```js
window.CUADERNO_CONFIG = {
  url: 'https://abcdefgh.supabase.co',
  anonKey: 'eyJhbGciOi...'
};
```

Para GitHub Pages, ponlas como Variables del repositorio (ver el README): el
workflow arma `config.js` solo al desplegar.

> **Nunca** copies la clave `service_role` ni una `secret`. Esas saltan RLS por
> diseño: puesta en una app estática, cualquiera podría leer y borrar todo.
> La única que va aquí es la anon/publishable.

## 5. Probar

1. Abre el cuaderno, `☰` › **Entrar**, escribe tu correo y manda el enlace.
2. Abre el enlace desde el mismo navegador. Al volver, arriba debe aparecer
   **en la nube** con un punto.
3. Escribe algo, abre el cuaderno en el celular con la misma cuenta y revisa
   que aparezca.

## Si algo falla

**El indicador se queda en "solo aquí".**
La app no pudo conectar. Con la consola del navegador abierta (F12): un 401 o
un mensaje de JWT significa credenciales mal copiadas; un error de red apunta a
la URL del proyecto.

**Llega el correo pero el enlace no entra.**
Falta la URL en *Redirect URLs* (paso 3), o abriste el enlace en un navegador
distinto al que pidió el enlace.

**Entra, pero no aparece ningún documento.**
Normal la primera vez: la cuenta está vacía y lo que tenías local sube en la
primera sincronización. Si no sube, revisa en **Table Editor › documents** que
haya filas y que su `owner` coincida con tu usuario en **Authentication ›
Users**.

**No deja subir tipografías.**
Revisa que exista el bucket `fonts` en **Storage** y que esté marcado como
público. El script del paso 2 lo crea; si el proyecto es viejo, puede que ya
existiera con otra configuración.

**Los correos no llegan.**
El servicio de correo que trae Supabase de fábrica tiene un límite bajo por
hora y a veces cae en spam. Para uso personal alcanza; si te topas con el
límite, en **Authentication › Emails** se puede conectar un SMTP propio.
