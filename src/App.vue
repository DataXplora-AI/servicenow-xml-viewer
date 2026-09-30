<script setup>
import { ref, computed, shallowRef } from 'vue'
import RecordDetail from './components/RecordDetail.vue'
import RecordDiff from './components/RecordDiff.vue'
import UpdateSetView from './components/UpdateSetView.vue'
import BrandLogo from './components/BrandLogo.vue'
import { buildModel, genericView } from './lib/model.js'
import { ignoredFields, toggleIgnored, clearIgnored } from './lib/ignored.js'
import { buildComparison } from './lib/diff.js'
import { themePref, resolvedTheme, cycleTheme, themeLabel } from './lib/theme.js'
import { readXmlFile, assertXmlText } from './lib/validate.js'

/* ---------------------------------------------------------------- estado */
const xmlA = ref('')
const xmlB = ref('')
const modelA = shallowRef(null)
const modelB = shallowRef(null)
const nameA = ref('XML A')
const nameB = ref('XML B')
const error = ref('')

const dual = ref(false)          // pantalla inicial con dos paneles
const compareModal = ref(false)  // modal para cargar el segundo XML
const dragging = ref('')
// Leer y parsear un update set real toma un momento: sin señal, soltar el archivo
// parece no haber hecho nada. Guarda qué lado está ocupado ('a', 'b' o '').
const loading = ref('')

const selectedId = ref('')
const adHoc = shallowRef(null)
const selectedKey = ref('')
const filter = ref('')
const onlyChanges = ref(true)
const showOthers = ref(false)

const comparing = computed(() => !!(modelA.value && modelB.value))

// Campos que no se descomprimieron por pasarse del tope. Se avisa: el campo se queda en
// base64 y sin explicación parece un fallo del visor y no un archivo fuera de lo normal.
const inflateWarning = computed(() => {
  const list = [
    ...((modelA.value && modelA.value.inflateSkipped) || []),
    ...((modelB.value && modelB.value.inflateSkipped) || [])
  ]
  if (!list.length) return ''
  const names = [...new Set(list.map((s) => s.field))].slice(0, 3).join(', ')
  return `${list.length} campo(s) comprimido(s) se dejaron sin expandir porque ${list[0].reason} (${names}).`
})

/* --------------------------------------------------------- update set */
// Un update set no es un registro más: es la lista de lo que se tocó. Cuando el XML lo
// trae, esa lista es la pantalla de entrada y cada fila abre la vista normal del registro.
const updateSet = computed(() => (modelA.value ? modelA.value.updateSet : null))
const showSet = ref(false)
const filteredEntries = computed(() =>
  updateSet.value ? matches(updateSet.value.entries, (e) => [e.title, e.table, e.type, e.updatedBy]) : []
)

function openEntry(entry) {
  showSet.value = false
  if (entry.root) { adHoc.value = null; selectedId.value = entry.root.id; return }
  if (entry.record) openRecord(entry.record)
}

/* ------------------------------------------------------------- explorar */
const roots = computed(() => (modelA.value ? modelA.value.roots : []))
const filteredRoots = computed(() => matches(roots.value, (r) => [r.title, r.table]))
const current = computed(() => adHoc.value || roots.value.find((r) => r.id === selectedId.value) || null)

function matches(list, fields) {
  const q = filter.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((item) => fields(item).some((v) => String(v || '').toLowerCase().includes(q)))
}

/* ------------------------------------------------------------ comparar */
// Emparejados a mano, { claveEnA: claveEnB }. Se reinician al cambiar de XML.
const forcedPairs = ref({})

const comparison = computed(() =>
  comparing.value ? buildComparison(modelA.value, modelB.value, forcedPairs.value) : null
)

/**
 * Cuál de los dos XML se tocó después. Es la pregunta que uno se hace al comparar dos
 * exports parecidos, y el dato ya viene en los registros (sys_updated_on).
 */
const newerSide = computed(() => {
  if (!comparing.value) return ''
  const a = modelA.value.updatedAt || ''
  const b = modelB.value.updatedAt || ''
  if (!a || !b || a === b) return ''
  return a > b ? 'a' : 'b'
})

function updatedTitle(side) {
  const model = side === 'a' ? modelA.value : modelB.value
  const when = model && model.updatedAt
  return when ? 'Última modificación en este XML: ' + when : 'Sin fecha de modificación en el XML'
}

// Candidatos para emparejar a mano: lo que quedó sin pareja del otro lado.
const unpaired = computed(() => {
  const all = comparison.value ? [...comparison.value.main, ...comparison.value.others] : []
  return {
    a: all.filter((e) => e.status === 'removed'),
    b: all.filter((e) => e.status === 'added')
  }
})

function pairWith(entry, otherKey) {
  const next = { ...forcedPairs.value }
  if (entry.status === 'removed') next[entry.key] = otherKey
  else next[otherKey] = entry.key
  forcedPairs.value = next
  selectedKey.value = entry.status === 'removed' ? entry.key : otherKey
}

function unpair(entry) {
  const next = { ...forcedPairs.value }
  delete next[entry.key]
  forcedPairs.value = next
}
const cmpMain = computed(() => visibleEntries(comparison.value ? comparison.value.main : []))
const cmpOthers = computed(() => visibleEntries(comparison.value ? comparison.value.others : []))
const cmpCurrent = computed(() => {
  if (!comparison.value) return null
  const all = [...comparison.value.main, ...comparison.value.others]
  return all.find((e) => e.key === selectedKey.value) || cmpMain.value[0] || cmpOthers.value[0] || null
})
const totals = computed(() => {
  if (!comparison.value) return null
  const all = [...comparison.value.main, ...comparison.value.others]
  return {
    changed: all.filter((e) => e.status === 'changed').length,
    added: all.filter((e) => e.status === 'added').length,
    removed: all.filter((e) => e.status === 'removed').length,
    equal: all.filter((e) => e.status === 'equal').length
  }
})

function visibleEntries(list) {
  const base = onlyChanges.value ? list.filter((e) => e.status !== 'equal') : list
  return matches(base, (e) => [e.title, e.table])
}

/* ------------------------------------------------------------- acciones */
async function parse(text, which) {
  const model = await buildModel(text)
  if (which === 'a') {
    modelA.value = model
    adHoc.value = null
    showSet.value = !!model.updateSet
    selectedId.value = model.roots[0] ? model.roots[0].id : ''
    if (!model.updateSet && !model.roots.length && model.orphans.length) {
      showOthers.value = true
      openRecord(model.orphans[0])
    }
  } else {
    modelB.value = model
  }
  forcedPairs.value = {}
  return model
}

async function analyze() {
  error.value = ''
  if (!xmlA.value.trim()) { error.value = 'Falta el XML principal.'; return }
  loading.value = 'a'
  try {
    assertXmlText(xmlA.value, nameA.value)
    if (dual.value && xmlB.value.trim()) assertXmlText(xmlB.value, nameB.value)
    await parse(xmlA.value, 'a')
    if (dual.value && xmlB.value.trim()) await parse(xmlB.value, 'b')
    selectedKey.value = ''
  } catch (e) {
    modelA.value = null
    modelB.value = null
    error.value = e.message
  } finally {
    loading.value = ''
  }
}

async function compareNow() {
  error.value = ''
  if (!xmlB.value.trim()) { error.value = 'Pega o sube el XML con el que quieres comparar.'; return }
  loading.value = 'b'
  try {
    assertXmlText(xmlB.value, nameB.value)
    await parse(xmlB.value, 'b')
    selectedKey.value = ''
    compareModal.value = false
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = ''
  }
}

function exitCompare() {
  forcedPairs.value = {}
  modelB.value = null
  xmlB.value = ''
  nameB.value = 'XML B'
  selectedKey.value = ''
}

function swapSides() {
  const [xa, xb] = [xmlA.value, xmlB.value]
  const [na, nb] = [nameA.value, nameB.value]
  xmlA.value = xb; xmlB.value = xa
  nameA.value = nb; nameB.value = na
  const [ma, mb] = [modelA.value, modelB.value]
  modelA.value = mb; modelB.value = ma
  adHoc.value = null
  selectedId.value = modelA.value.roots[0] ? modelA.value.roots[0].id : ''
}

function openRecord(record) {
  showSet.value = false
  const root = roots.value.find((r) => r.id === record.id)
  if (root) { adHoc.value = null; selectedId.value = root.id; return }
  adHoc.value = { ...record, ...genericView(record) }
}

function select(item) { adHoc.value = null; showSet.value = false; selectedId.value = item.id }

async function readFile(file, which) {
  if (!file) return
  error.value = ''
  loading.value = which
  try {
    const text = await readXmlFile(file)
    if (which === 'a') { xmlA.value = text; nameA.value = file.name }
    else { xmlB.value = text; nameB.value = file.name }
    if (which === 'a') { await parse(text, 'a'); selectedKey.value = '' }
    else if (modelA.value) { await parse(text, 'b'); selectedKey.value = ''; compareModal.value = false }
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = ''
  }
}

// Soltar un archivo solo lo carga en el cuadro de texto: el usuario todavía puede
// editarlo o soltar el segundo antes de procesar. El spinner cubre la lectura, que
// con un update set grande no es instantánea.
async function onDrop(e, which) {
  dragging.value = ''
  const file = e.dataTransfer.files && e.dataTransfer.files[0]
  if (!file) return
  error.value = ''
  loading.value = which
  try {
    const text = await readXmlFile(file)
    if (which === 'a') { xmlA.value = text; nameA.value = file.name }
    else { xmlB.value = text; nameB.value = file.name; dual.value = true }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = ''
  }
}

function reset() {
  xmlA.value = ''; xmlB.value = ''
  modelA.value = null; modelB.value = null
  nameA.value = 'XML A'; nameB.value = 'XML B'
  adHoc.value = null; selectedId.value = ''; selectedKey.value = ''
  error.value = ''; dual.value = false; showSet.value = false
  loading.value = ''
  forcedPairs.value = {}
}

const ignoredList = computed(() => [...ignoredFields.value].sort())

const statusDot = { changed: '●', added: '+', removed: '−', equal: '·' }
</script>

<template>
  <div class="app">
    <header class="top">
      <button class="brand" type="button" title="Volver al inicio" @click="reset">
        <BrandLogo :size="30" />
        <span class="t">ServiceNow XML Viewer</span>
      </button>
      <div class="acts">
        <template v-if="comparing">
          <span class="sidename" :class="{ newer: newerSide === 'a' }">
            <input v-model="nameA" :title="updatedTitle('a')" spellcheck="false" />
            <em v-if="newerSide === 'a'" :title="updatedTitle('a')">más reciente</em>
          </span>
          <span class="muted">vs</span>
          <span class="sidename" :class="{ newer: newerSide === 'b' }">
            <input v-model="nameB" :title="updatedTitle('b')" spellcheck="false" />
            <em v-if="newerSide === 'b'" :title="updatedTitle('b')">más reciente</em>
          </span>
          <button class="ghost" @click="swapSides">Intercambiar</button>
          <button class="ghost" @click="exitCompare">Salir de comparación</button>
        </template>
        <template v-else>
          <label class="filebtn">
            Subir XML
            <input type="file" accept=".xml,text/xml" @change="readFile($event.target.files[0], 'a')" />
          </label>
          <button v-if="modelA" class="primary" @click="compareModal = true">Comparar con otro XML</button>
        </template>
        <button v-if="modelA" class="ghost" @click="reset">Limpiar</button>
        <button class="ghost theme" :title="themeLabel[themePref]" @click="cycleTheme">
          <span aria-hidden="true">{{ themePref === 'auto' ? '◐' : resolvedTheme === 'dark' ? '☾' : '☀' }}</span>
          <span class="sr">{{ themeLabel[themePref] }}</span>
        </button>
      </div>
    </header>

    <!-- ------------------------------------------------ pantalla inicial -->
    <main v-if="!modelA" class="intro">
      <div class="introhead">
        <label class="toggle">
          <input type="checkbox" v-model="dual" />
          Cargar dos XML y compararlos de inmediato
        </label>
      </div>

      <div class="panes" :class="{ two: dual }">
        <div
          class="drop"
          :class="{ over: dragging === 'a' }"
          @dragover.prevent="dragging = 'a'"
          @dragleave="dragging = ''"
          @drop.prevent="onDrop($event, 'a')"
        >
          <div class="plabel">
            <span>{{ dual ? 'XML A · versión base' : 'XML' }}</span>
            <label class="filebtn tiny">
              Subir
              <input type="file" accept=".xml,text/xml" @change="readFile($event.target.files[0], 'a')" />
            </label>
          </div>
          <div class="field">
            <textarea
              v-model="xmlA"
              spellcheck="false"
              placeholder="Pega aquí el XML: un update set completo (&lt;unload&gt; con varios &lt;sys_update_xml&gt;) o el XML de un solo registro (&lt;record_update&gt;)…"
            ></textarea>
            <div v-if="loading === 'a'" class="busy">
              <span class="spinner"></span>
              <span>Leyendo el archivo…</span>
            </div>
          </div>
        </div>

        <div
          v-if="dual"
          class="drop"
          :class="{ over: dragging === 'b' }"
          @dragover.prevent="dragging = 'b'"
          @dragleave="dragging = ''"
          @drop.prevent="onDrop($event, 'b')"
        >
          <div class="plabel">
            <span>XML B · versión a comparar</span>
            <label class="filebtn tiny">
              Subir
              <input type="file" accept=".xml,text/xml" @change="readFile($event.target.files[0], 'b')" />
            </label>
          </div>
          <div class="field">
            <textarea v-model="xmlB" spellcheck="false" placeholder="Pega aquí el segundo XML…"></textarea>
            <div v-if="loading === 'b'" class="busy">
              <span class="spinner"></span>
              <span>Leyendo el archivo…</span>
            </div>
          </div>
        </div>
      </div>

      <div class="introacts">
        <button class="primary" :disabled="!xmlA.trim() || !!loading" @click="analyze">
          {{ loading ? 'Procesando…' : dual ? 'Comparar XML' : 'Procesar XML' }}
        </button>
        <span class="muted dhint">o arrastra archivos .xml sobre las zonas de texto</span>
        <span v-if="error" class="err">{{ error }}</span>
      </div>

      <ul class="tips muted">
        <li>Detecta automáticamente si es un update set o un registro suelto.</li>
        <li>Flows y subflows: trigger, acciones en orden, ramas anidadas e inputs de cada una.</li>
        <li>Actions: inputs, outputs y cada step con sus valores; los scripts se muestran completos.</li>
        <li>Comparación lado a lado de dos versiones, con diff línea a línea en los scripts.</li>
        <li>Todo se procesa en tu navegador: no se sube nada a ningún servidor.</li>
      </ul>
    </main>

    <!-- ------------------------------------------------------ resultados -->
    <p v-if="inflateWarning" class="warnbar">⚠ {{ inflateWarning }}</p>
    <main v-if="modelA" class="work">
      <aside>
        <input v-model="filter" class="search" placeholder="Filtrar registros…" />

        <template v-if="comparing">
          <label class="toggle small">
            <input type="checkbox" v-model="onlyChanges" />
            Solo con cambios
          </label>
          <div class="legend muted">
            <span class="changed">● {{ totals.changed }} modificados</span>
            <span class="added">+ {{ totals.added }} nuevos</span>
            <span class="removed">− {{ totals.removed }} eliminados</span>
          </div>
          <!-- vive aquí y no en el detalle: al ignorar un campo el registro puede dejar de
               tener cambios y desaparecer de la lista, y hay que poder deshacerlo igual -->
          <div v-if="ignoredList.length" class="ignored">
            <div class="muted ihead">No se cuentan como cambio</div>
            <button
              v-for="n in ignoredList" :key="n" class="tag"
              title="Volver a contarlo como cambio" @click="toggleIgnored(n)"
            >{{ n }} <span class="x">×</span></button>
            <button class="ghost tiny" @click="clearIgnored()">Restablecer</button>
          </div>
          <ul class="list">
            <li
              v-for="e in cmpMain"
              :key="e.key"
              :class="{ on: cmpCurrent && cmpCurrent.key === e.key }"
              @click="selectedKey = e.key"
            >
              <span class="ic" :class="e.status">{{ statusDot[e.status] }}</span>
              <span class="txt">
                <span class="nm">{{ e.title }}</span>
                <span class="tb muted">
                  {{ e.kindLabel }}
                  <template v-if="e.changeCount"> · {{ e.changeCount }} campos</template>
                  <template v-if="e.children.changed"> · {{ e.children.changed }} hijos</template>
                </span>
              </span>
            </li>
          </ul>
          <div v-if="!cmpMain.length" class="muted pad">Sin registros principales que mostrar.</div>

          <div v-if="cmpOthers.length" class="others">
            <button class="ghost wide" @click="showOthers = !showOthers">
              {{ showOthers ? '▾' : '▸' }} Otros registros ({{ cmpOthers.length }})
            </button>
            <ul v-if="showOthers" class="list small">
              <li
                v-for="e in cmpOthers"
                :key="e.key"
                :class="{ on: cmpCurrent && cmpCurrent.key === e.key }"
                @click="selectedKey = e.key"
              >
                <span class="ic" :class="e.status">{{ statusDot[e.status] }}</span>
                <span class="txt">
                  <span class="nm">{{ e.title }}</span>
                  <span class="tb muted">{{ e.table }}</span>
                </span>
              </li>
            </ul>
          </div>
        </template>

        <template v-else-if="updateSet && !updateSet.entriesMissing">
          <button class="ghost wide setbtn" :class="{ on: showSet }" @click="showSet = true">
            📦 {{ updateSet.name || 'Update set' }}
            <span class="n">{{ updateSet.entries.length }}</span>
          </button>
          <div class="count muted">{{ filteredEntries.length }} de {{ updateSet.entries.length }} registros tocados</div>
          <ul class="list">
            <li
              v-for="e in filteredEntries"
              :key="e.id"
              :class="{ on: !showSet && current && e.recordId === current.id }"
              @click="openEntry(e)"
            >
              <span class="ic">{{ e.info.icon }}</span>
              <span class="txt">
                <span class="nm">{{ e.title }}</span>
                <span class="tb muted">
                  {{ e.type || e.table }}
                  <template v-if="e.detail"> · {{ e.detail }}</template>
                </span>
              </span>
              <span v-if="e.action === 'DELETE'" class="del" title="Eliminado en este update set">−</span>
            </li>
          </ul>
        </template>

        <template v-else>
          <button
            v-if="updateSet"
            class="ghost wide setbtn"
            :class="{ on: showSet }"
            @click="showSet = true"
          >
            📦 {{ updateSet.name || 'Update set' }}
          </button>
          <div class="count muted">{{ filteredRoots.length }} de {{ roots.length }} registros principales</div>
          <ul class="list">
            <li
              v-for="r in filteredRoots"
              :key="r.id"
              :class="{ on: current && current.id === r.id }"
              @click="select(r)"
            >
              <span class="ic">{{ r.info.icon }}</span>
              <span class="txt">
                <span class="nm">{{ r.title }}</span>
                <span class="tb muted">{{ r.kindLabel || r.info.label }}</span>
              </span>
            </li>
          </ul>
          <div v-if="modelA.orphans.length" class="others">
            <button class="ghost wide" @click="showOthers = !showOthers">
              {{ showOthers ? '▾' : '▸' }} Otros registros ({{ modelA.orphans.length }})
            </button>
            <ul v-if="showOthers" class="list small">
              <li
                v-for="r in modelA.orphans"
                :key="r.id"
                :class="{ on: current && current.id === r.id }"
                @click="openRecord(r)"
              >
                <span class="txt">
                  <span class="nm">{{ r.fields.name || r.fields.label || r.sysId.slice(0, 10) }}</span>
                  <span class="tb muted">{{ r.table }}</span>
                </span>
              </li>
            </ul>
          </div>
        </template>
      </aside>

      <section class="pane">
        <RecordDiff
          v-if="comparing && cmpCurrent"
          :entry="cmpCurrent"
          :model-a="modelA"
          :model-b="modelB"
          :label-a="nameA"
          :label-b="nameB"
          :candidates="cmpCurrent.status === 'removed' ? unpaired.b : unpaired.a"
          @pair="pairWith(cmpCurrent, $event)"
          @unpair="unpair(cmpCurrent)"
        />
        <UpdateSetView
          v-else-if="!comparing && showSet && updateSet"
          :set="updateSet"
          @open="openEntry"
        />
        <RecordDetail v-else-if="!comparing && current" :item="current" :model="modelA" @open="openRecord" />
        <div v-else class="muted nothing">Selecciona un registro en la lista.</div>
      </section>
    </main>

    <!-- ----------------------------------------------- modal de comparar -->
    <div v-if="compareModal" class="overlay" @click.self="compareModal = false">
      <div class="modal">
        <h2>Comparar con otro XML</h2>
        <p class="muted">
          Se compara <strong>{{ nameA }}</strong> (A) contra el XML que cargues aquí (B).
        </p>
        <div
          class="drop"
          :class="{ over: dragging === 'b' }"
          @dragover.prevent="dragging = 'b'"
          @dragleave="dragging = ''"
          @drop.prevent="onDrop($event, 'b')"
        >
          <div class="field">
            <textarea v-model="xmlB" spellcheck="false" placeholder="Pega aquí el segundo XML…"></textarea>
            <div v-if="loading === 'b'" class="busy">
              <span class="spinner"></span>
              <span>Leyendo el archivo…</span>
            </div>
          </div>
        </div>
        <div class="macts">
          <label class="filebtn">
            Subir archivo
            <input type="file" accept=".xml,text/xml" @change="readFile($event.target.files[0], 'b')" />
          </label>
          <span v-if="error" class="err">{{ error }}</span>
          <span class="spacer"></span>
          <button class="ghost" @click="compareModal = false">Cancelar</button>
          <button class="primary" :disabled="!xmlB.trim() || !!loading" @click="compareNow">
            {{ loading ? 'Procesando…' : 'Comparar' }}
          </button>
        </div>
      </div>
    </div>

    <footer class="foot">
      <div class="brandfoot">
        <span class="by">
          Powered by
          <!-- en pestaña nueva: el XML cargado vive sólo en memoria y salir de la página lo pierde -->
          <a
            class="site"
            href="https://dataxplora.ai/"
            target="_blank"
            rel="noopener noreferrer"
            title="Ir a dataxplora.ai"
          >
            <BrandLogo wordmark :size="18" />
          </a>
        </span>
        <p class="tagline">Tu aliado de confianza en materia de cumplimiento y gobernanza de datos.</p>
      </div>
      <span class="local">Todo se procesa en tu navegador</span>
    </footer>
  </div>
</template>

<style scoped>
.app { display: flex; flex-direction: column; height: 100%; }
.top {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 12px 20px; border-bottom: 1px solid var(--line); background: var(--bg-2);
}
/* pie de marca: siempre visible, no compite con el contenido */
.foot {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 18px 20px; border-top: 1px solid var(--line);
  background: var(--bg-2); font-size: 11.5px; color: var(--muted);
}
.brandfoot { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.by { display: inline-flex; align-items: center; gap: 7px; }
.site { display: inline-flex; border-radius: 4px; transition: opacity .15s; }
.site:hover { opacity: .72; }
.site:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.tagline { margin: 0; font-size: 11px; line-height: 1.45; }
.local { font-size: 11px; }
@media (max-width: 560px) { .local { display: none; } }
/* el nombre hace de botón de inicio: limpia y vuelve a la pantalla de carga */
.brand {
  display: flex; gap: 10px; align-items: center;
  padding: 4px 8px 4px 4px; margin-left: -4px;
  background: none; border: 1px solid transparent; border-radius: 10px;
}
.brand:hover { border-color: var(--line); background: var(--bg-3); }
.t {
  font-family: "Space Grotesk", "Poppins", sans-serif;
  font-weight: 600; font-size: 15px; letter-spacing: -.01em;
}
.acts { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.filebtn {
  background: var(--bg-3); border: 1px solid var(--line); border-radius: 8px;
  padding: 6px 12px; cursor: pointer; font-size: 14px; white-space: nowrap;
}
.filebtn.tiny { padding: 2px 8px; font-size: 12px; }
.filebtn:hover { border-color: var(--accent); }
.filebtn input { display: none; }

/* sin flex:1 la portada mide lo que mide su contenido y el pie sube hasta la
   mitad de la pantalla, con el resto en blanco */
.intro {
  flex: 1; min-height: 0;
  padding: 24px 20px; max-width: 1100px; width: 100%; margin: 0 auto; overflow: auto;
}
.introhead { margin-bottom: 12px; }
.toggle { display: inline-flex; gap: 8px; align-items: center; font-size: 13px; color: var(--muted); }
.toggle.small { font-size: 12px; margin: 10px 2px 6px; }
.panes { display: grid; grid-template-columns: 1fr; gap: 14px; }
.panes.two { grid-template-columns: 1fr 1fr; }
.drop { border: 1px dashed var(--line); border-radius: 12px; padding: 10px; background: var(--bg-2); }
.drop.over { border-color: var(--accent); background: var(--accent-soft); }
.plabel { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--muted); padding: 0 4px 8px; }
textarea {
  width: 100%; min-height: 300px; resize: vertical; background: var(--code-bg); color: var(--text);
  border: 1px solid var(--line); border-radius: 8px; padding: 12px;
  font-family: ui-monospace, monospace; font-size: 12.5px; line-height: 1.5;
}
.introacts { display: flex; gap: 12px; align-items: center; margin-top: 14px; flex-wrap: wrap; }
.dhint { font-size: 12px; }

/* el velo cubre solo el cuadro de texto: el resto de la pantalla sigue usable */
.field { position: relative; }
.busy {
  position: absolute; inset: 0; border-radius: 8px;
  display: flex; flex-direction: column; gap: 10px;
  align-items: center; justify-content: center;
  background: var(--scrim); font-size: 12.5px; color: var(--muted);
}
.spinner {
  width: 22px; height: 22px; border-radius: 50%;
  border: 2px solid var(--line); border-top-color: var(--accent);
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
/* quien pide menos movimiento ve un pulso en vez de un giro */
@media (prefers-reduced-motion: reduce) {
  .spinner { animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .35; } }
}

/* franja de aviso: no es un error que impida trabajar, pero tampoco se esconde */
.warnbar {
  margin: 0; padding: 9px 20px; font-size: 12.5px;
  color: var(--logic); background: var(--warn-bg);
  border-bottom: 1px solid var(--line);
}

.theme { padding: 6px 10px; line-height: 1; font-size: 15px; }
.sr {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap;
}
.err { color: var(--danger); }
.tips { margin-top: 20px; font-size: 13px; line-height: 1.8; }

.work { flex: 1; display: grid; grid-template-columns: 310px 1fr; min-height: 0; }
aside { border-right: 1px solid var(--line); background: var(--bg-2); overflow: auto; padding: 12px; }
.search {
  width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--line);
  border-radius: 8px; padding: 7px 10px; font: inherit;
}
.setbtn { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.setbtn.on { border-color: var(--accent); color: var(--accent); }
.setbtn .n { margin-left: auto; background: var(--bg-3); border-radius: 999px; padding: 0 7px; font-size: 11px; }
.list .del { color: var(--danger); font-weight: 700; }
.count { font-size: 11.5px; margin: 8px 2px; }
.sidename { display: inline-flex; gap: 6px; align-items: center; }
.sidename input {
  width: 13ch; padding: 3px 9px; font-size: 12px;
  border: 1px solid var(--line); border-radius: 999px;
  background: var(--bg-3); color: var(--fg, inherit);
}
.sidename input:focus { outline: none; border-color: var(--accent); width: 20ch; }
.sidename.newer input { border-color: var(--accent-2); }
.sidename em {
  font-style: normal; font-size: 10px; text-transform: uppercase;
  letter-spacing: .06em; color: var(--accent-2);
}
.ignored { margin: 8px 0 4px; display: flex; gap: 5px; flex-wrap: wrap; align-items: center; }
.ihead { width: 100%; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; }
.tag {
  font-family: ui-monospace, monospace; font-size: 11px; padding: 1px 8px;
  border: 1px solid var(--line); border-radius: 999px; color: var(--muted); background: var(--bg-3);
}
.tag:hover { color: var(--danger); border-color: var(--danger); }
.tag .x { opacity: .7; }
.legend { display: flex; gap: 10px; font-size: 11px; margin: 0 2px 8px; flex-wrap: wrap; }
.legend .changed { color: var(--logic); }
.legend .added { color: var(--ok); }
.legend .removed { color: var(--danger); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.list li {
  display: flex; gap: 8px; align-items: center; padding: 8px 10px;
  border-radius: 8px; cursor: pointer; border: 1px solid transparent;
}
.list li:hover { background: var(--bg-3); }
.list li.on { background: var(--accent-soft); border-color: var(--accent); }
.ic { width: 18px; text-align: center; font-family: ui-monospace, monospace; }
.ic.changed { color: var(--logic); }
.ic.added { color: var(--ok); }
.ic.removed { color: var(--danger); }
.ic.equal { color: var(--muted); }
.txt { display: flex; flex-direction: column; min-width: 0; }
.nm { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tb { font-size: 11px; }
.list.small .nm { font-family: ui-monospace, monospace; font-size: 12px; }
.others { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 10px; }
.wide { width: 100%; text-align: left; }
.pad { padding: 10px 2px; font-size: 12.5px; }
.pane { min-width: 0; overflow: hidden; }
.nothing { padding: 30px; }

.overlay {
  position: fixed; inset: 0; background: rgba(26, 35, 50, .45);
  display: grid; place-items: center; padding: 20px; z-index: 20;
}
.modal {
  background: var(--bg); border: 1px solid var(--line); border-radius: 14px;
  box-shadow: 0 18px 50px rgba(26, 35, 50, .18);
  padding: 20px; width: min(820px, 100%);
}
.modal h2 { margin: 0 0 4px; font-size: 17px; }
.modal p { margin: 0 0 12px; font-size: 13px; }
.modal textarea { min-height: 260px; }
.macts { display: flex; gap: 10px; align-items: center; margin-top: 12px; }
.spacer { flex: 1; }
@media (max-width: 900px) {
  .work { grid-template-columns: 1fr; }
  aside { max-height: 240px; }
  .panes.two { grid-template-columns: 1fr; }
}
</style>
