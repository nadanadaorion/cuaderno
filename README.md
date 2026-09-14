# Cuaderno

Un cuaderno para escribir sin distracciones. Papel amarillo, tinta negra, un
caret azul y nada más en pantalla mientras escribes. Los textos viven en el
navegador y, si conectas una cuenta, se sincronizan entre tus dispositivos.

No hay compilación: son archivos estáticos y módulos ES. Se abren tal cual.

## Qué hace

- **Varios documentos.** Crear, renombrar, cambiar y eliminar. Eliminar ofrece
  *Deshacer* durante siete segundos en vez de pedir confirmación.
- **Sincronización.** Con una cuenta, los documentos y los ajustes viven en
  Supabase y llegan solos a los otros dispositivos abiertos (Realtime).
- **Tipografías propias.** Tres de casa y las que subas (`woff2`, `woff`,
  `ttf`, `otf`). La estrella marca con cuál abre el cuaderno.
- **Textura de papel.** Un shader dibuja grano, fibra, manchas y motas. Es
  estática — se genera una vez por tema y tamaño de ventana — y se puede
  apagar.
- **Exportar.** `.txt`, `.md`, copiar al portapapeles, y un respaldo `.json`
  de todo que se puede volver a importar.
- **Local-first.** Todo se pinta desde `localStorage` al instante. Sin
  credenciales, sin sesión o sin red, el editor funciona igual; lo único que
  se queda fuera es la nube.

## Atajos

| Tecla | Acción |
| --- | --- |
| `Ctrl/⌘ O` | Documentos |
| `Ctrl/⌘ ⇧ N` | Documento nuevo |
| `Ctrl/⌘ S` | Exportar |
| `Esc` | Cerrar lo que esté abierto |

## Correrlo en tu máquina

```bash
cp config.example.js config.js   # y pon tus datos de Supabase
python3 -m http.server 8000
```

Abre <http://localhost:8000>. Sin `config.js` también arranca: se queda en modo
local, con todo guardado sólo en ese navegador.

Tiene que servirse por HTTP, no abriendo el archivo con `file://` — los módulos
ES no cargan desde el sistema de archivos.

## Conectar Supabase

Los pasos completos están en [docs/SUPABASE.md](docs/SUPABASE.md). En corto:

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Corre `supabase/migrations/0001_cuaderno.sql` en el SQL Editor.
3. En *Authentication › URL Configuration*, agrega la URL de tu sitio a las
   *Redirect URLs*.
4. Pon la Project URL y la clave **anon/publishable** en `config.js`.

## Publicar en GitHub Pages

En *Settings › Pages*, elige **GitHub Actions** como origen. Luego, en
*Settings › Secrets and variables › Actions › Variables*, crea:

| Variable | Valor |
| --- | --- |
| `SUPABASE_URL` | la Project URL |
| `SUPABASE_ANON_KEY` | la clave anon/publishable |

Y lanza el workflow **Deploy GitHub Pages** a mano. El workflow genera
`config.js` con esas variables; por eso `config.js` no está versionado.

Si no defines las variables, el sitio se publica igual pero sin nube.

## Seguridad

- Sólo la Project URL y la clave **anon/publishable** llegan al navegador.
  Nunca pongas una `service-role` o `secret` en `config.js`, en el repositorio
  ni en las Variables: esta app es estática y cualquiera puede leer lo que se
  sirve.
- La anon key no vuelve privados los datos. Lo que los vuelve privados son las
  políticas RLS: cada fila lleva un `owner` y sólo su dueño la alcanza. Toda
  comprobación hecha en el cliente es comodidad, no seguridad.
- El bucket `fonts` es público en lectura a propósito: un `@font-face` necesita
  una URL estable y una URL firmada caduca. Los archivos de fuente no son datos
  sensibles; los documentos nunca pasan por ahí. La escritura sigue atada a la
  carpeta de cada cuenta.

## Límites conocidos

- Los conflictos se resuelven por **última escritura gana**, comparando la hora
  de edición. Si editas el mismo documento en dos dispositivos a la vez, gana
  el último en guardar; no hay fusión de párrafos.
- La página necesita red para **cargar** la primera vez (y para cargar la
  biblioteca de Supabase). Una vez cargada, escribir funciona sin conexión,
  pero no hay Service Worker todavía, así que abrirla sin red no funciona.
- La biblioteca de Supabase se carga desde jsDelivr. Para no depender de un
  tercero en tiempo de ejecución, se puede descargar a `vendor/` y apuntar
  `SUPABASE_ESM` ahí.
- Las tipografías subidas requieren sesión: sin cuenta no hay dónde guardarlas.

## Estructura

```
index.html          una sola página
styles.css          toda la hoja de estilo
config.example.js   plantilla de credenciales
src/
  state.js          estado, localStorage, migraciones, derivados de texto
  paper.js          el shader de papel
  editor.js         lienzo, caret espejo y la mira del cursor
  cloud.js          Supabase: cuenta, documentos, ajustes, tipografías
  app.js            interfaz, eventos y la mezcla entre local y nube
supabase/migrations/
  0001_cuaderno.sql esquema, RLS, Realtime y Storage
```
