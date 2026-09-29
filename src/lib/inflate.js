// Algunos campos de ServiceNow viajan comprimidos: los inputs de cada nodo de un flow
// (`values`, `subflow_inputs`, `trigger_inputs`) son un JSON en gzip codificado en base64.
// Sin descomprimirlos la vista muestra un bloque ilegible en vez de los datos del paso.

// Cabecera gzip (1f 8b 08) en base64: todo flujo gzip empieza por "H4sI".
const GZIP_B64 = /^H4sI[A-Za-z0-9+/=\s]+$/

/*
 * Topes de descompresión.
 *
 * Un gzip llega a expandir ~1000 veces su tamaño, así que un campo de unos pocos MB
 * basta para pedir gigabytes de memoria y tumbar la pestaña. Y el XML no es de quien
 * lo abre: normalmente se lo pasó otra persona. Sin un tope, abrir el archivo equivocado
 * cuelga el navegador antes de dibujar nada.
 *
 * Los valores son holgados a propósito: el `values` de un nodo real ronda el kilobyte,
 * y el campo más grande que hemos visto en un update set de verdad no llega al MB.
 */
const MAX_FIELD = 32 * 1024 * 1024   // por campo
const MAX_TOTAL = 128 * 1024 * 1024  // sumando todos los campos de la carga
const MAX_PARALLEL = 4               // descomprimir todo a la vez multiplica el pico de memoria

export function looksCompressed(value) {
  return typeof value === 'string' && value.length > 32 && GZIP_B64.test(value.trim())
}

class TooBig extends Error {}

/**
 * Descomprime leyendo por trozos y cortando en cuanto se pasa del tope.
 *
 * `new Response(stream).text()` sería más corto, pero acumula todo en memoria antes de
 * devolver nada: cuando se sabe que el archivo era una bomba, el daño ya está hecho.
 * Leyendo el stream a mano se puede cancelar a mitad, y `budget` permite que el tope
 * sea el que queda de la carga entera y no solo el de este campo.
 */
async function gunzip(b64, budget) {
  const bin = atob(b64.trim())
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)

  const limit = Math.min(MAX_FIELD, budget)
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new TooBig(`el campo supera los ${Math.round(limit / 1048576)} MB al descomprimirse`)
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    // cancel() suelta el stream: sin esto, abortar deja el resto descomprimiéndose
    reader.cancel().catch(() => {})
  }
  return { text, size }
}

/** Corre las tareas de a `limit`, para que el pico de memoria no dependa del archivo. */
async function pool(tasks, limit) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) await tasks[next++]()
  })
  await Promise.all(workers)
}

/**
 * Descomprime in situ todos los campos comprimidos de los registros. Es asíncrono porque
 * DecompressionStream lo es; se hace una sola vez, antes de construir el modelo, para que
 * el resto del código siga trabajando con texto plano.
 *
 * Devuelve cuántos campos se descomprimieron y cuáles se descartaron por pasarse de tope,
 * para que la interfaz pueda avisar en vez de mostrar el campo sin explicación.
 */
export async function inflateRecords(records) {
  if (typeof DecompressionStream === 'undefined') return { inflated: 0, skipped: [] }

  const jobs = []
  for (const record of records) {
    for (const [name, value] of Object.entries(record.fields)) {
      if (looksCompressed(value)) jobs.push({ record, name, value })
    }
  }

  let budget = MAX_TOTAL
  let inflated = 0
  const skipped = []

  await pool(
    jobs.map((job) => async () => {
      if (budget <= 0) { skipped.push({ field: job.name, reason: 'se alcanzó el tope total de descompresión' }); return }
      try {
        const { text, size } = await gunzip(job.value, budget)
        budget -= size
        job.record.fields[job.name] = text
        inflated++
      } catch (e) {
        // Un campo que no era gzip se deja como estaba: no vale la pena romper la carga.
        // Uno que se pasó de tope también se deja crudo, pero eso sí se cuenta.
        if (e instanceof TooBig) skipped.push({ field: job.name, reason: e.message })
      }
    }),
    MAX_PARALLEL
  )

  return { inflated, skipped }
}
