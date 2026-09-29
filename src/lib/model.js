import { extractDocument, isSysId } from './xml.js'
import { inflateRecords } from './inflate.js'
import { tableInfo } from './tables.js'

const SYSTEM_FIELDS = new Set([
  'sys_created_by', 'sys_created_on', 'sys_updated_by', 'sys_updated_on',
  'sys_mod_count', 'sys_domain', 'sys_domain_path', 'sys_package', 'sys_scope',
  'sys_policy', 'sys_replace_on_upgrade', 'sys_class_name', 'sys_update_name',
  'sys_customer_update', 'sys_name', 'sys_tags'
])

// Tablas de metadatos (etiquetas, choices, traducciones): sirven para resolver
// nombres pero no tiene sentido listarlas ni compararlas como registros sueltos.
const METADATA_TABLES = new Set([
  'sys_documentation', 'sys_translated_text', 'sys_choice', 'sys_complex_object',
  'sys_element_mapping'
])


export async function buildModel(text) {
  const doc = extractDocument(text)
  const records = doc.records.map((r, i) => ({ ...r, id: 'r' + i, info: tableInfo(r.table) }))

  // los inputs de los nodos de un flow viajan en gzip+base64: hay que expandirlos antes
  // de construir nada, porque el resto del modelo asume texto plano.
  const { skipped } = await inflateRecords(records)

  const bySysId = new Map()
  for (const r of records) if (r.sysId && !bySysId.has(r.sysId)) bySysId.set(r.sysId, r)

  // índice de referencias: sys_id -> registros que lo apuntan
  const refs = new Map()
  for (const r of records) {
    for (const [field, value] of Object.entries(r.fields)) {
      if (field === 'sys_id' || !isSysId(value)) continue
      const key = value.trim()
      if (!refs.has(key)) refs.set(key, [])
      refs.get(key).push({ record: r, field })
    }
  }

  const model = { records, bySysId, refs, inflateSkipped: skipped }

  const roots = pickRoots(records).map((r) => decorate(r, model))

  // los registros que no cuelgan de ningún root visible se listan aparte
  const rootIds = new Set(roots.map((r) => r.id))
  const claimed = new Set()
  for (const root of roots) for (const id of root.consumedIds) claimed.add(id)
  const orphans = records.filter(
    (r) => !rootIds.has(r.id) && !claimed.has(r.id) && !METADATA_TABLES.has(r.table)
  )

  // Lo más nuevo que toca este XML. Con formato 'YYYY-MM-DD HH:MM:SS' basta comparar
  // como texto, y sirve para decir cuál de los dos lados de una comparación es posterior.
  const updatedAt = records.reduce((max, r) => {
    const v = (r.fields.sys_updated_on || '').trim()
    return v > max ? v : max
  }, '')

  const updateSet = buildUpdateSet(doc, records, roots)

  // lo que ya se lista como entrada del update set no vuelve a aparecer como suelto
  if (updateSet && !updateSet.entriesMissing) {
    const listed = new Set(updateSet.entries.map((e) => e.recordId).filter(Boolean))
    return { ...model, roots, orphans: orphans.filter((r) => !listed.has(r.id)), updateSet, updatedAt }
  }

  return { ...model, roots, orphans, updateSet, updatedAt }
}

/**
 * Un update set es una lista de registros tocados. Cada <sys_update_xml> aporta el
 * "qué, quién y cuándo" y su payload aporta el registro en sí; aquí se vuelven a juntar
 * para poder listar el update set completo y abrir cualquier entrada con su vista normal.
 */
function buildUpdateSet(doc, records, roots) {
  if (!doc.entries.length && !doc.set) return null

  const rootById = new Map(roots.map((r) => [r.id, r]))
  const entries = doc.entries.map((entry) => {
    const own = entry.recordIndexes.map((i) => records[i]).filter(Boolean)
    const main = own.find((r) => r.primary) || own[0] || null
    const root = main ? rootById.get(main.id) || null : null
    const target = root || main
    return {
      ...entry,
      record: main,
      root,
      recordId: main ? main.id : '',
      table: entry.table || (main ? main.table : ''),
      title: entry.targetName || (target ? displayName(target) : entry.name),
      info: tableInfo(entry.table || (main ? main.table : '')),
      view: root ? root.view : 'generic',
      // cuántos registros relacionados viajaron con el principal: da una idea de si el
      // export trae la action completa o sólo su cabecera
      relatedCount: Math.max(own.length - 1, 0),
      detail: root && root.view === 'action' ? root.stepCount + ' steps'
        : root && root.view === 'flow' ? root.nodeCount + ' acciones'
        : ''
    }
  })

  const setFields = (doc.set && doc.set.fields) || {}
  return {
    record: doc.set,
    // Un export hecho con "Export > XML" sobre la fila del update set trae la cabecera y
    // nada más. Es un error fácil de cometer y el síntoma (una pantalla casi vacía) no
    // explica nada por sí solo, así que lo detectamos para poder decirlo.
    entriesMissing: !doc.entries.length,
    name: setFields.name || '',
    description: setFields.description || '',
    state: setFields.state || '',
    application: setFields.application || '',
    createdBy: setFields.sys_created_by || '',
    createdOn: setFields.sys_created_on || '',
    entries
  }
}

/**
 * Elige los registros que se muestran como entrada principal.
 * En un export real cada bloque <record_update table="x"> trae un registro principal
 * y decenas de registros relacionados; sin esto un solo XML produciría cientos de
 * entradas y la comparación terminaría mostrando cualquier registro suelto.
 */
function pickRoots(records) {
  const primary = records.filter((r) => r.primary)
  if (primary.length) {
    const notChild = primary.filter((r) => r.info.kind !== 'child')
    return notChild.length ? notChild : primary
  }
  return records.filter((r) => r.info.kind !== 'child')
}

/**
 * Absorbe de forma transitiva todo lo que referencia a los registros ya consumidos
 * (mappings, condiciones, snapshots, traducciones…) para que no queden sueltos.
 * Nunca absorbe otro registro principal.
 */
function expandConsumed(consumed, model) {
  const ids = new Set()
  for (const r of model.records) if (consumed.has(r.id) && r.sysId) ids.add(r.sysId)
  let changed = true
  while (changed) {
    changed = false
    for (const r of model.records) {
      if (consumed.has(r.id) || r.primary) continue
      for (const [field, value] of Object.entries(r.fields)) {
        if (field === 'sys_id' || !isSysId(value) || !ids.has(value.trim())) continue
        consumed.add(r.id)
        if (r.sysId) ids.add(r.sysId)
        changed = true
        break
      }
    }
  }
}

function decorate(record, model) {
  const base = {
    ...record,
    // una entrada sin payload (un DELETE, o un payload roto) sólo conoce su target_name
    title: record.placeholder ? (record.source.targetName || displayName(record)) : displayName(record),
    consumedIds: [record.id]
  }
  if (record.placeholder) return { ...base, ...genericView(record) }
  if (record.table === 'sys_hub_flow') return buildFlow(base, model)
  if (record.table.startsWith('sys_hub_action_type')) return buildAction(base, model)
  return { ...base, view: 'generic' }
}

/**
 * Cómo se presenta un registro cuando no tiene vista propia. Vive aquí (y no en el
 * componente) para que abrirlo desde la lista del update set y abrirlo desde el modelo
 * den exactamente el mismo título y la misma etiqueta.
 */
export function genericView(record) {
  const info = tableInfo(record.table)
  const deleted = record.placeholder && record.action === 'DELETE'
  return {
    view: 'generic',
    info,
    title: record.placeholder
      ? (record.source.targetName || record.fields.target_name || displayName(record))
      : displayName(record),
    kindLabel: deleted ? 'Eliminado' : info.label,
    deleted
  }
}

/* ---------------------------------------------------------------- helpers */

export function displayName(r) {
  const f = r.fields || {}
  return (
    f.label || f.name || f.sys_name || f.column_label || f.element ||
    f.short_description || f.title || (r.table + ' · ' + (r.sysId || '').slice(0, 8))
  )
}

export function visibleFields(record, showSystem = false) {
  return Object.entries(record.fields)
    .filter(([k, v]) => (showSystem || !SYSTEM_FIELDS.has(k)) && String(v).trim() !== '')
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([name, value]) => ({ name, value }))
}

const FIELD_ORDER = ['name', 'label', 'short_description', 'description', 'type', 'table', 'active', 'order', 'sys_id']
function rank(name) {
  const i = FIELD_ORDER.indexOf(name)
  return i === -1 ? 50 : i
}

export function looksLikeScript(name, value) {
  if (typeof value !== 'string') return false
  if (value.length < 40) return false
  if (/script|code|source|template/i.test(name) && value.includes('\n')) return true
  return /\n/.test(value) && /(function\s|=>|var\s|let\s|const\s|gs\.|current\.|if\s*\()/.test(value)
}

export function tryJson(value) {
  if (typeof value !== 'string') return null
  const t = value.trim()
  if (!(t.startsWith('{') || t.startsWith('['))) return null
  try {
    const parsed = JSON.parse(t)
    if (parsed && typeof parsed === 'object') return parsed
  } catch (e) { /* no era JSON */ }
  return null
}

export function refLabel(sysId, model) {
  const r = model.bySysId.get(String(sysId).trim())
  if (!r) return null
  return { record: r, label: displayName(r), table: r.table }
}

function num(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/* -------------------------------------------------------- inputs / values */

// Inputs de un nodo: sys_variable_value apuntando al registro + campo "values" en JSON.
export function inputsFor(record, model) {
  const out = []
  const seen = new Set()

  for (const { record: child } of uniqueRefs(model, record.sysId)) {
    // mapeos de inputs de un step: sys_element_mapping.id -> field / value
    if (child.table === 'sys_element_mapping') {
      if (child.fields.id !== record.sysId) continue
      const name = child.fields.field || child.fields.name || 'mapping'
      if (seen.has(name)) continue
      out.push({ name, value: child.fields.value ?? '', origin: 'sys_element_mapping', record: child })
      seen.add(name)
      continue
    }
    if (child.table !== 'sys_variable_value') continue
    if (child.fields.document_key && child.fields.document_key !== record.sysId) continue
    const varRef = refLabel(child.fields.variable, model)
    const name = varRef
      ? (varRef.record.fields.element || varRef.record.fields.column_label || varRef.label)
      : unresolvedName(child.fields.variable)
    out.push({
      name,
      value: child.fields.value ?? '',
      origin: 'sys_variable_value',
      // sin la definición no hay nombre estable: el sys_id se regenera al duplicar
      unresolved: !varRef,
      record: child
    })
    seen.add(name)
  }

  // `values`, `inputs`, `trigger_inputs`, `subflow_inputs`… todos guardan lo mismo con
  // distinto nombre según el tipo de nodo, así que se busca por forma en todos los campos.
  for (const raw of Object.values(record.fields)) {
    for (const item of valueEntries(raw)) {
      if (seen.has(item.name)) continue
      out.push({ ...item, origin: 'values', record: null })
      seen.add(item.name)
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

// Un input siempre se identifica a sí mismo y trae un valor; con eso basta para
// distinguir una lista de inputs de cualquier otro JSON guardado en un campo.
function isInputShaped(item) {
  return !!item && typeof item === 'object' && !Array.isArray(item) &&
    (typeof item.name === 'string' || typeof item.label === 'string') &&
    ('value' in item || 'displayValue' in item)
}

/**
 * El campo `values` de un nodo no tiene una única forma: unas veces es una lista de inputs,
 * otras un objeto que envuelve esa lista junto a colecciones internas del motor
 * (dynamicInputs, outputsToAssign…). Se normaliza todo a pares nombre/valor y se descartan
 * las colecciones vacías, que sólo son ruido en pantalla.
 */
/**
 * ¿Este campo es el que guarda los inputs del paso? Sirve para no comparar dos veces lo
 * mismo: los inputs ya se comparan uno a uno, con sus nombres legibles.
 */
export function carriesInputs(raw) {
  return valueEntries(raw).length > 0
}

function valueEntries(raw) {
  if (typeof raw !== 'string' || raw.length < 2 || !/^[[{]/.test(raw.trim())) return []
  const json = tryJson(raw)
  if (!json || typeof json !== 'object') return []

  if (Array.isArray(json)) {
    if (!json.every(isInputShaped)) return []
    const out = []
    for (const item of json) {
      if (!item || typeof item !== 'object') continue
      const name = (item.parameter && item.parameter.label) || item.label || item.name
      const value = item.displayValue || item.value
      if (!name || value == null || value === '') continue
      out.push({ name, value: typeof value === 'string' ? value : JSON.stringify(value, null, 2) })
    }
    return out
  }

  const out = []
  for (const [name, value] of Object.entries(json)) {
    if (value == null || value === '') continue
    if (Array.isArray(value)) {
      if (!value.length) continue
      // una lista de inputs anidada se despliega en vez de mostrarse como JSON crudo
      const nested = valueEntries(JSON.stringify(value))
      if (nested.length) out.push(...nested)
      else out.push({ name, value: JSON.stringify(value, null, 2) })
      continue
    }
    out.push({ name, value: typeof value === 'string' ? value : JSON.stringify(value, null, 2) })
  }
  return out
}

// La definición de la variable (var_dictionary) vive en el step type y no viaja en
// el export de la action: mostramos un nombre legible en vez del sys_id crudo.
function unresolvedName(id) {
  const v = (id || '').trim()
  if (!v) return 'variable'
  return isSysId(v) ? 'variable · ' + v.slice(0, 8) : v
}

// refs puede repetir un registro si lo apunta por más de un campo.
function uniqueRefs(model, sysId) {
  const out = []
  const seen = new Set()
  for (const entry of model.refs.get(sysId) || []) {
    if (seen.has(entry.record.id)) continue
    seen.add(entry.record.id)
    out.push(entry)
  }
  return out
}

function childrenOf(record, model, tables) {
  return uniqueRefs(model, record.sysId)
    .filter(({ record: r }) => tables.includes(r.table))
    .map(({ record: r }) => r)
}

/* ------------------------------------------------------------------ flows */

/**
 * Evidencia para cuando un flow o una action se ven vacíos. Sin esto el mensaje de
 * "no se encontraron pasos" es indistinguible de un export incompleto, de un enlace por
 * un campo que no conocemos y de un bug nuestro.
 */
function diagnose(record, model) {
  const refs = {}
  for (const { record: r, field } of model.refs.get(record.sysId) || []) {
    const key = r.table + ' · ' + field
    refs[key] = (refs[key] || 0) + 1
  }
  const tables = {}
  for (const r of model.records) tables[r.table] = (tables[r.table] || 0) + 1
  return {
    refs: Object.entries(refs).sort((a, b) => b[1] - a[1]),
    tables: Object.entries(tables).sort((a, b) => b[1] - a[1]),
    total: model.records.length
  }
}

function buildFlow(flow, model) {
  const consumed = new Set([flow.id])
  const isSub = (flow.fields.type || '').toLowerCase().includes('subflow')

  // Los nodos se reconocen por su forma, no por su tabla: cualquier registro que apunte
  // al flow y lleve un `order` es un paso de la secuencia. Así funciona igual con las
  // tablas clásicas (sys_hub_action_instance) que con las versionadas (…_v2) o futuras.
  const linked = model.records.filter(
    (r) => r !== flow && (r.fields.flow === flow.sysId || r.fields.parent_flow === flow.sysId)
  )
  const all = linked.filter((r) => !isTriggerish(r) && 'order' in r.fields)
  const triggers = linked
    .filter(isTriggerish)
    .map((r) => {
      consumed.add(r.id)
      return {
        record: r,
        title: displayName(r),
        // "record_create" / "scheduled" / "inbound_email": el cuándo del disparador
        typeName: humanize(r.fields.trigger_type || r.fields.type || ''),
        inputs: collectInputs(r, model, consumed)
      }
    })

  const nodeMap = new Map()
  for (const r of all) {
    consumed.add(r.id)
    const node = makeNode(r, model, consumed)
    nodeMap.set(r.sysId, node)
    // el anidamiento puede venir por un id de UI propio del flow en vez del sys_id
    if (r.fields.ui_id) nodeMap.set(r.fields.ui_id, node)
  }

  const tree = []
  for (const node of new Set(nodeMap.values())) {
    const parentId = firstRef(node.record.fields, [
      'parent_ui_id', 'parent', 'parent_instance', 'block', 'flow_block'
    ])
    const parent = parentId && parentId !== flow.sysId ? nodeMap.get(parentId) : null
    if (parent && parent !== node) parent.children.push(node)
    else tree.push(node)
  }
  sortTree(tree)
  resolvePills(tree)

  const inputs = childrenOf(flow, model, ['sys_hub_flow_input'])
  const outputs = childrenOf(flow, model, ['sys_hub_flow_output'])
  for (const r of [...inputs, ...outputs]) consumed.add(r.id)

  expandConsumed(consumed, model)

  const relatedFlow = {}
  for (const r of model.records) {
    if (r.fields.flow === flow.sysId) relatedFlow[r.table] = (relatedFlow[r.table] || 0) + 1
  }

  return {
    ...flow,
    view: 'flow',
    related: relatedFlow,
    diagnostics: diagnose(flow, model),
    kindLabel: isSub ? 'Subflow' : 'Flow',
    triggers,
    tree,
    nodeCount: all.length,
    flowInputs: inputs.map((r) => ({ record: r, title: displayName(r) })),
    flowOutputs: outputs.map((r) => ({ record: r, title: displayName(r) })),
    consumedIds: [...consumed]
  }
}

// Acepta tanto sys_ids como los identificadores con guiones que usa el editor de flows.
/**
 * Los valores de un input referencian la salida de otro paso por su id de UI
 * ({{5ff054f4-….v_customer_order}}). En el editor eso se ve con el nombre del paso, así
 * que se hace la misma sustitución para que el valor se pueda leer.
 */
function resolvePills(tree) {
  const names = new Map()
  const collect = (nodes) => {
    for (const n of nodes) {
      const ui = n.record.fields.ui_id
      if (ui) names.set(ui, n.typeName || n.title)
      collect(n.children)
    }
  }
  collect(tree)
  if (!names.size) return

  const apply = (nodes) => {
    for (const n of nodes) {
      for (const input of n.inputs) {
        if (typeof input.value !== 'string' || !input.value.includes('{{')) continue
        input.value = input.value.replace(/\{\{([0-9a-f-]{32,36})/gi, (m, id) =>
          names.has(id) ? '{{' + names.get(id) : m
        )
      }
      apply(n.children)
    }
  }
  apply(tree)
}

function firstRef(fields, names) {
  for (const n of names) {
    const v = (fields[n] || '').trim()
    if (isSysId(v) || /^[0-9a-f-]{32,36}$/i.test(v)) return v
  }
  return ''
}

// snake_case → texto legible, para los valores que ServiceNow guarda como código interno.
function humanize(value) {
  if (!value) return ''
  const text = value.replace(/[_-]+/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Un disparador es lo que apunta al flow desde una tabla de triggers, sea cual sea su nombre.
function isTriggerish(record) {
  return /trigger/i.test(record.table)
}

const KIND_LABEL = { subflow: 'Subflow', logic: 'Flow logic', step: 'Step', action: 'Action' }

/**
 * Un nodo que llama a otro flujo se distingue porque referencia un subflow; el nombre de la
 * tabla sirve de respaldo. Se decide una sola vez aquí para que el detalle y el diagrama
 * pinten lo mismo.
 */
function nodeKind(record) {
  if (record.fields.subflow || (record.displays && record.displays.subflow)) return 'subflow'
  if (/sub_?flow/i.test(record.table)) return 'subflow'
  if (/logic|block/i.test(record.table)) return 'logic'
  if (/^sys_hub_step/i.test(record.table)) return 'step'
  return 'action'
}

const TYPE_FIELDS = ['action_type', 'logic_definition', 'flow_logic', 'subflow', 'step_type', 'type']

/**
 * El nombre del tipo de paso ("Update Record", "If") vive en un registro que no viaja en
 * el export. ServiceNow lo deja en el atributo display_value del campo de referencia, así
 * que se usa eso antes de intentar resolver el sys_id contra el propio XML.
 */
function typeLabel(record, model) {
  for (const f of TYPE_FIELDS) {
    if (record.displays && record.displays[f]) return record.displays[f]
  }
  const ref = refLabel(firstRef(record.fields, TYPE_FIELDS), model)
  return ref ? ref.label : ''
}

function makeNode(record, model, consumed) {
  const type = typeLabel(record, model)
  const inputs = collectInputs(record, model, consumed)
  const named = record.fields.label || record.fields.name
  const kind = nodeKind(record)
  return {
    record,
    sysId: record.sysId,
    // el comentario es la etiqueta que el desarrollador le puso al paso en el editor
    title: named || type || record.fields.comment || displayName(record),
    typeName: named && type ? type : record.fields.comment || '',
    kind,
    kindLabel: KIND_LABEL[kind],
    isSubflow: kind === 'subflow',
    table: record.table,
    order: num(record.fields.order),
    isLogic: kind === 'logic',
    inputs,
    children: []
  }
}

function collectInputs(record, model, consumed) {
  const inputs = inputsFor(record, model)
  for (const i of inputs) if (i.record) consumed.add(i.record.id)
  return inputs
}

function sortTree(nodes) {
  nodes.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  for (const n of nodes) sortTree(n.children)
}

/* ---------------------------------------------------------------- actions */

function buildAction(action, model) {
  const consumed = new Set([action.id])

  // Cualquier tabla de steps que apunte a la action (sys_hub_step, sys_hub_step_ext,
  // sys_hub_action_step…) y, como respaldo, los steps sueltos del XML si la action es única.
  let stepRecords = uniqueRefs(model, action.sysId)
    .filter(({ record: r }) => /step/i.test(r.table))
    .map(({ record: r }) => r)

  if (!stepRecords.length) {
    const loose = model.records.filter((r) => /^sys_hub_step/i.test(r.table))
    const actions = model.records.filter((r) => r.table.startsWith('sys_hub_action_type'))
    if (loose.length && actions.length === 1) stepRecords = loose
  }

  const stepMap = new Map()
  for (const r of stepRecords) {
    consumed.add(r.id)
    stepMap.set(r.sysId, makeNode(r, model, consumed))
  }
  const steps = []
  for (const node of stepMap.values()) {
    const parentId = firstRef(node.record.fields, ['parent', 'parent_step', 'block'])
    const parent = parentId ? stepMap.get(parentId) : null
    if (parent && parent !== node) parent.children.push(node)
    else steps.push(node)
  }
  sortTree(steps)

  const ios = uniqueRefs(model, action.sysId)
    .filter(({ record: r }) => /input|output/.test(r.table) || r.table === 'var_dictionary')
    .map(({ record: r, field }) => ({ record: r, field }))
  for (const io of ios) consumed.add(io.record.id)

  const inputs = ios.filter((io) => /input/.test(io.record.table) || /input/i.test(io.record.fields.name || ''))
  const outputs = ios.filter((io) => /output/.test(io.record.table) || /output/i.test(io.record.fields.name || ''))
  const other = ios.filter((io) => !inputs.includes(io) && !outputs.includes(io))

  expandConsumed(consumed, model)

  const related = {}
  for (const { record: r } of uniqueRefs(model, action.sysId)) {
    related[r.table] = (related[r.table] || 0) + 1
  }

  return {
    ...action,
    view: 'action',
    related,
    diagnostics: diagnose(action, model),
    kindLabel: 'Action',
    steps,
    stepCount: stepMap.size,
    actionInputs: inputs.map((io) => io.record),
    actionOutputs: outputs.map((io) => io.record),
    actionVars: other.map((io) => io.record),
    consumedIds: [...consumed]
  }
}

/* ------------------------------------------------- encoded queries */

const QUERY_OP = /^(.+?)(>=|<=|!=|=|>|<|ISNOTEMPTY|ISEMPTY|NOT LIKE|NOTLIKE|LIKE|STARTSWITH|ENDSWITH|NOT IN|NOTIN|IN|BETWEEN|ANYTHING|SAMEAS|NSAMEAS|DYNAMIC|VALCHANGES|CHANGESFROM|CHANGESTO)(.*)$/

/**
 * Una condición de ServiceNow viaja como una sola línea con todo pegado
 * (`state=1^short_description=algo^ORactive=true`). Se parte en condiciones para poder
 * mostrar una por línea, que es como se lee en el constructor de condiciones.
 */
export function parseQuery(text) {
  if (typeof text !== 'string' || !text.includes('^') || text.includes('\n')) return null

  const out = []
  for (const part of text.split('^')) {
    if (!part) continue
    // Los operadores van SIEMPRE en mayúscula y los nombres de columna en minúscula: es lo
    // único que distingue `^ORactive=true` (un "o") de `^order_line_item=…` (una columna).
    let join = ''
    let body = part
    const order = /^ORDERBY(DESC)?(.*)$/.exec(part)
    if (order) { out.push({ join: '', field: order[2], op: '', value: order[1] ? 'orden descendente' : 'orden ascendente' }); continue }
    if (part === 'EQ') continue
    if (/^OR(?=\S)/.test(part)) { join = 'OR'; body = part.slice(2) }
    else if (/^NQ(?=\S)/.test(part)) { join = 'NQ'; body = part.slice(2) }

    const m = QUERY_OP.exec(body)
    if (!m) return null
    out.push({ join, field: m[1], op: m[2], value: m[3] })
  }
  // con una sola condición no hay nada que desplegar: se muestra tal cual
  return out.length > 1 ? out : null
}
