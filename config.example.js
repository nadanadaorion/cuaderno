// Copia este archivo como `config.js` y pon los datos de tu proyecto Supabase.
//
// Sólo la Project URL y la clave publishable/anon. NUNCA pongas aquí una
// service-role o secret key: este archivo lo sirve el navegador y cualquiera
// puede leerlo. La anon key no vuelve privados los datos — eso lo hacen las
// políticas RLS de supabase/migrations/0001_cuaderno.sql.
//
// En GitHub Pages no hace falta commitear config.js: el workflow lo genera a
// partir de las Variables del repositorio.

window.CUADERNO_CONFIG = {
  url: 'https://TU-PROYECTO.supabase.co',
  anonKey: 'TU-ANON-KEY'
};
