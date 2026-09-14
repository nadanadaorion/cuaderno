// Supabase: cuenta, documentos, ajustes y tipografías.
//
// Todo lo de aquí es opcional. Sin credenciales, sin sesión o sin red, la app
// sigue funcionando contra localStorage y esta capa simplemente no se enciende.
// El control de acceso vive en las políticas RLS de la base, nunca aquí: la
// anon key es pública y viaja en el navegador, así que cualquier comprobación
// hecha sólo en este archivo no sería una frontera de seguridad.

import { state, FONT_MIME, uid } from './state.js';

// La biblioteca se carga bajo demanda, no con un import estático: un import
// estático ata el arranque de la app a que el CDN responda, y sin red la
// página entera se queda en blanco. Cargándola aquí, el editor arranca
// siempre y la nube es lo único que se queda fuera.
const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';

const conf = globalThis.CUADERNO_CONFIG || {};

let sb = null;
let session = null;
let channel = null;
let hooks = {};

export const configured = () => Boolean(conf.url && conf.anonKey);
export const user = () => session?.user || null;
export const online = () => Boolean(sb && session);

const toMs = (iso) => (iso ? Date.parse(iso) : 0);
const toIso = (ms) => new Date(ms || Date.now()).toISOString();

const rowToDoc = (r) => ({
  id: r.id,
  name: r.name || '',
  text: r.body || '',
  created: toMs(r.created_at),
  updated: toMs(r.updated_at)
});

const docToRow = (d) => ({
  id: d.id,
  owner: session.user.id,
  name: d.name || '',
  body: d.text,
  created_at: toIso(d.created),
  updated_at: toIso(d.updated)
});

function status(mode) {
  hooks.onStatus?.(mode);
}

/** Arranca el cliente y engancha los cambios de sesión. */
export async function init(callbacks) {
  hooks = callbacks || {};
  if (!configured()) {
    status('off');
    return false;
  }

  let createClient;
  try {
    ({ createClient } = await import(/* @vite-ignore */ SUPABASE_ESM));
  } catch {
    status('local');
    return false;
  }

  sb = createClient(conf.url, conf.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const { data } = await sb.auth.getSession();
  session = data.session || null;

  sb.auth.onAuthStateChange((_event, next) => {
    const was = session?.user?.id;
    session = next || null;
    if (session?.user?.id !== was) {
      hooks.onAuth?.(user());
      if (session) start();
      else stop();
    }
  });

  hooks.onAuth?.(user());
  if (session) await start();
  else status('local');
  return true;
}

export async function signIn(email) {
  if (!sb) throw new Error('sin configurar');
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.href.split('#')[0] }
  });
  if (error) throw error;
}

export async function signOut() {
  if (!sb) return;
  await sb.auth.signOut();
}

// ---------------------------------------------------------------------------
// Sincronización
// ---------------------------------------------------------------------------

async function start() {
  status('saving');
  await pullSettings();
  await pullDocs();
  listen();
  status('synced');
}

function stop() {
  if (channel) {
    sb.removeChannel(channel);
    channel = null;
  }
  status('local');
}

function listen() {
  if (channel) sb.removeChannel(channel);
  channel = sb
    .channel('documents')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'documents', filter: `owner=eq.${session.user.id}` },
      (payload) => {
        if (payload.eventType === 'DELETE') hooks.onRemoteDelete?.(payload.old?.id);
        else hooks.onRemoteDoc?.(rowToDoc(payload.new));
      }
    )
    .subscribe();
}

/** Trae todo y deja que la app resuelva la mezcla. */
export async function pullDocs() {
  if (!online()) return null;
  const { data, error } = await sb.from('documents').select('*').eq('owner', session.user.id);
  if (error) {
    status('local');
    return null;
  }
  hooks.onDocs?.(data.map(rowToDoc));
  return data;
}

export async function pushDoc(doc) {
  if (!online()) return;
  status('saving');
  const { error } = await sb.from('documents').upsert(docToRow(doc), { onConflict: 'id' });
  status(error ? 'local' : 'synced');
}

export async function deleteDoc(id) {
  if (!online()) return;
  await sb.from('documents').delete().eq('id', id).eq('owner', session.user.id);
}

async function pullSettings() {
  if (!online()) return;
  const { data, error } = await sb
    .from('settings')
    .select('*')
    .eq('owner', session.user.id)
    .maybeSingle();
  if (error) return;

  if (!data) {
    await pushSettings();
    await pullFonts();
    return;
  }
  hooks.onSettings?.({
    defaultFont: data.default_font,
    size: data.size,
    lead: data.lead,
    tracking: data.tracking,
    theme: data.theme,
    texture: data.texture,
    updated: toMs(data.updated_at)
  });
  await pullFonts();
}

export async function pushSettings() {
  if (!online()) return;
  await sb.from('settings').upsert(
    {
      owner: session.user.id,
      default_font: state.defaultFont,
      size: state.size,
      lead: state.lead,
      tracking: state.tracking ?? -0.012,
      theme: state.theme,
      texture: state.texture !== false,
      updated_at: toIso(Date.now())
    },
    { onConflict: 'owner' }
  );
}

// ---------------------------------------------------------------------------
// Tipografías
// ---------------------------------------------------------------------------

export function fontUrl(path) {
  if (!sb) return '';
  return sb.storage.from('fonts').getPublicUrl(path).data.publicUrl;
}

async function pullFonts() {
  if (!online()) return;
  const { data, error } = await sb.from('fonts').select('*').eq('owner', session.user.id);
  if (error) return;
  hooks.onFonts?.(
    data.map((r) => ({ id: r.id, label: r.label, ext: r.ext, path: r.path, url: fontUrl(r.path) }))
  );
}

export async function uploadFont(file, ext) {
  if (!online()) throw Object.assign(new Error('sin sesión'), { code: 'no_session' });

  const id = uid();
  const path = `${session.user.id}/${id}.${ext}`;

  const up = await sb.storage.from('fonts').upload(path, file, {
    contentType: FONT_MIME[ext],
    upsert: false
  });
  if (up.error) throw up.error;

  const row = { id, owner: session.user.id, label: fontLabel(file.name), ext, path };
  const ins = await sb.from('fonts').insert(row);
  if (ins.error) {
    // La fila es el índice del archivo: sin ella el objeto queda huérfano.
    await sb.storage.from('fonts').remove([path]);
    throw ins.error;
  }
  return { id, label: row.label, ext, path, url: fontUrl(path) };
}

export async function deleteFont(font) {
  if (!online()) return;
  await sb.from('fonts').delete().eq('id', font.id).eq('owner', session.user.id);
  if (font.path) await sb.storage.from('fonts').remove([font.path]);
}

export function fontLabel(filename) {
  return (
    filename
      .replace(/\.(woff2|woff|ttf|otf)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim() || 'Fuente'
  );
}
