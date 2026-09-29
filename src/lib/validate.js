/**
 * Comprobaciones previas al parseo.
 *
 * La extensión no dice nada: un .zip renombrado a .xml se sube igual, se lee como texto y
 * llena el cuadro con caracteres de control. El parser terminaba quejándose, pero recién
 * después de ensuciar la pantalla y con un mensaje sobre la sintaxis del XML que no ayuda
 * a entender que el archivo simplemente no era XML.
 *
 * Aquí se mira el contenido: primero los bytes, después el texto ya decodificado.
 */

/* Firmas de los formatos que la gente suele renombrar o exportar por error. El .zip es el
   caso real: ServiceNow entrega los update sets grandes comprimidos. */
const SIGNATURES = [
  { bytes: [0x50, 0x4b], name: 'un archivo ZIP', hint: 'Descomprímelo y sube el .xml que hay dentro.' },
  { bytes: [0x1f, 0x8b], name: 'un archivo GZIP', hint: 'Descomprímelo y sube el .xml que hay dentro.' },
  { bytes: [0x25, 0x50, 0x44, 0x46], name: 'un PDF' },
  { bytes: [0x89, 0x50, 0x4e, 0x47], name: 'una imagen PNG' },
  { bytes: [0xff, 0xd8, 0xff], name: 'una imagen JPEG' },
  { bytes: [0xd0, 0xcf, 0x11, 0xe0], name: 'un documento de Office antiguo' },
  { bytes: [0x7b, 0x5c, 0x72, 0x74], name: 'un documento RTF' },
  { bytes: [0x53, 0x51, 0x4c, 0x69], name: 'una base de datos SQLite' }
]

// 5 MB de XML son ~5 M de caracteres: mirar el arranque basta y no cuesta nada.
const SNIFF = 4096

class FileError extends Error {}

function fail(msg) {
  throw new FileError(msg)
}

function startsWith(bytes, sig) {
  return sig.every((b, i) => bytes[i] === b)
}

/**
 * El BOM y el espacio en blanco inicial no cuentan: lo que importa es el primer carácter
 * con significado, que en un XML siempre es '<'.
 */
function firstMeaningful(text) {
  return text.replace(/^﻿/, '').trimStart()
}

/**
 * Un XML puede declarar su codificación en el prólogo. Decodificamos como UTF-8 —lo que
 * exporta ServiceNow— y solo si el propio archivo dice otra cosa se vuelve a decodificar.
 */
function decode(buffer) {
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  const declared = /^﻿?\s*<\?xml[^>]*encoding\s*=\s*["']([\w-]+)["']/i.exec(utf8)
  const label = declared && declared[1].toLowerCase()
  if (!label || label === 'utf-8' || label === 'utf8') return utf8
  try {
    return new TextDecoder(label).decode(buffer)
  } catch {
    return utf8 // codificación desconocida: seguimos con UTF-8 y que decidan las demás comprobaciones
  }
}

/** Bytes crudos: detecta lo que ni siquiera es texto antes de intentar decodificarlo. */
function checkBytes(buffer, name) {
  const head = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, SNIFF))
  if (!head.length) fail(`«${name}» está vacío.`)

  for (const sig of SIGNATURES) {
    if (startsWith(head, sig.bytes)) {
      fail(`«${name}» no es un XML: es ${sig.name}.` + (sig.hint ? ' ' + sig.hint : ''))
    }
  }
  // Ningún texto lleva bytes nulos; casi todo binario sí.
  if (head.includes(0)) fail(`«${name}» no es un archivo de texto: parece binario.`)
}

/** Texto ya decodificado: descarta lo que es texto pero no es XML. */
function checkText(text, name) {
  // Un binario decodificado como UTF-8 se llena de U+FFFD. Un XML legítimo mal codificado
  // trae unos pocos en los acentos, así que se mide la proporción y no la presencia.
  const head = text.slice(0, SNIFF)
  const broken = (head.match(/�/g) || []).length
  if (broken > Math.max(4, head.length * 0.01)) {
    fail(`«${name}» no es un archivo de texto legible: parece binario o usa una codificación desconocida.`)
  }
  assertXmlText(text, name)
}

/**
 * Lo mínimo para llamarlo XML: que empiece por '<'. No valida la sintaxis —de eso se
 * encarga el parser— pero evita que un CSV, un JSON o un log lleguen hasta ahí.
 */
export function assertXmlText(text, name) {
  const start = firstMeaningful(text)
  if (!start) fail(`«${name}» está vacío.`)
  if (!start.startsWith('<')) {
    const preview = start.slice(0, 40).replace(/\s+/g, ' ')
    fail(`«${name}» no parece XML: empieza por «${preview}…» en vez de «<».`)
  }
}

/**
 * Lee el archivo y devuelve su texto, o lanza un error explicando por qué no sirve.
 * Se lee como ArrayBuffer y no como texto justamente para poder mirar los bytes.
 */
export function readXmlFile(file) {
  const name = file.name || 'el archivo'
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`No se pudo leer «${name}».`))
    reader.onload = () => {
      try {
        const buffer = reader.result
        checkBytes(buffer, name)
        const text = decode(buffer)
        checkText(text, name)
        resolve(text)
      } catch (e) {
        reject(e)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}
