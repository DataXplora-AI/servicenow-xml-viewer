<script setup>
import { ref, computed } from 'vue'

const props = defineProps({ set: Object })
const emit = defineEmits(['open'])

const filter = ref('')
const groupBy = ref('none')

const ACTION_LABEL = { INSERT_OR_UPDATE: 'insert / update', DELETE: 'eliminado' }
const actionClass = (a) => (a === 'DELETE' ? 'del' : 'upd')

const visible = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return props.set.entries
  return props.set.entries.filter((e) =>
    [e.title, e.table, e.type, e.updatedBy].some((v) => String(v || '').toLowerCase().includes(q))
  )
})

// Agrupar por tipo es lo que más ayuda en un update set grande: "¿qué business rules
// toqué?" es una pregunta más frecuente que el orden cronológico de captura.
const groups = computed(() => {
  if (groupBy.value === 'none') return [{ key: '', items: visible.value }]
  const map = new Map()
  for (const e of visible.value) {
    const key = (groupBy.value === 'type' ? (e.type || e.table) : e.updatedBy) || '—'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(e)
  }
  return [...map.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([key, items]) => ({ key, items }))
})

const notComplete = computed(() =>
  !!props.set.state && !/complet/i.test(props.set.state)
)

const stats = computed(() => {
  const e = props.set.entries
  const byType = new Map()
  for (const x of e) {
    const k = x.type || x.table || '—'
    byType.set(k, (byType.get(k) || 0) + 1)
  }
  return {
    total: e.length,
    deleted: e.filter((x) => x.action === 'DELETE').length,
    rich: e.filter((x) => x.view === 'action' || x.view === 'flow').length,
    types: [...byType.entries()].sort((a, b) => b[1] - a[1])
  }
})
</script>

<template>
  <div class="us">
    <header>
      <div class="kind">
        <span class="chip strong">Update set</span>
        <span v-if="set.state" class="chip">{{ set.state }}</span>
        <span v-if="set.application" class="chip">{{ set.application }}</span>
      </div>
      <h1>{{ set.name || 'Update set sin nombre' }}</h1>
      <p v-if="set.description" class="muted desc">{{ set.description }}</p>
      <p v-if="!set.entriesMissing" class="muted meta">
        {{ stats.total }} registro(s) tocado(s)
        <template v-if="stats.deleted"> · {{ stats.deleted }} eliminado(s)</template>
        <template v-if="stats.rich"> · {{ stats.rich }} flow/action con detalle</template>
        <template v-if="set.createdBy"> · creado por {{ set.createdBy }}</template>
        <template v-if="set.createdOn"> · {{ set.createdOn }}</template>
      </p>
      <p v-else class="muted meta">
        <template v-if="set.createdBy">creado por {{ set.createdBy }}</template>
        <template v-if="set.createdOn"> · {{ set.createdOn }}</template>
      </p>
    </header>

    <!-- Export incompleto: la cabecera sin las entradas -->
    <div v-if="set.entriesMissing" class="missing">
      <h2 class="mh">Este XML no trae los registros del update set</h2>
      <p>
        Sólo contiene la fila del update set, que es lo que produce <em>Export &gt; XML</em>
        sobre el registro. Los registros que el set toca viven en la tabla
        <code>sys_update_xml</code> y hay que exportarlos aparte.
      </p>
      <div class="ways">
        <div class="way">
          <div class="wt">Opción A · exportar el update set completo</div>
          <ol>
            <li>Abre el update set en <em>System Update Sets → Local Update Sets</em>.</li>
            <li>
              Márcalo como <strong>Complete</strong>.
              <template v-if="notComplete">
                El tuyo está en <code>{{ set.state }}</code>, y el botón de exportar sólo
                aparece cuando el set está completo.
              </template>
            </li>
            <li>Pulsa <strong>Export to XML</strong>.</li>
          </ol>
        </div>
        <div class="way">
          <div class="wt">Opción B · sin completar el set</div>
          <ol>
            <li>En el formulario del update set, baja a la related list <strong>Customer Updates</strong>.</li>
            <li>Selecciona todas las filas.</li>
            <li>Clic derecho en la cabecera → <strong>Export → XML</strong>.</li>
          </ol>
        </div>
      </div>
      <p class="muted last">
        El resultado empieza con <code>&lt;unload&gt;</code> y contiene un
        <code>&lt;sys_update_xml&gt;</code> por registro tocado. Ese es el que hay que pegar aquí.
        También puedes pegar el XML de un solo registro, como ya hiciste con la action.
      </p>
    </div>

    <div v-if="!set.entriesMissing" class="types">
      <span v-for="[name, n] in stats.types" :key="name" class="chip">{{ name }} · {{ n }}</span>
    </div>

    <div v-if="!set.entriesMissing" class="bar">
      <input v-model="filter" class="search" placeholder="Filtrar por nombre, tabla, tipo o autor…" />
      <div class="grp">
        <span class="muted lbl">Agrupar</span>
        <button class="ghost tiny" :class="{ on: groupBy === 'none' }" @click="groupBy = 'none'">No</button>
        <button class="ghost tiny" :class="{ on: groupBy === 'type' }" @click="groupBy = 'type'">Tipo</button>
        <button class="ghost tiny" :class="{ on: groupBy === 'author' }" @click="groupBy = 'author'">Autor</button>
      </div>
    </div>

    <div v-if="!visible.length && !set.entriesMissing" class="muted empty">
      Ningún registro coincide con el filtro.
    </div>

    <section v-for="g in groups" :key="g.key || 'all'">
      <h2 v-if="g.key">{{ g.key }} <span class="n">{{ g.items.length }}</span></h2>
      <button
        v-for="e in g.items"
        :key="e.id"
        class="row"
        :class="{ rich: e.view === 'action' || e.view === 'flow' }"
        @click="emit('open', e)"
      >
        <span class="icon">{{ e.info.icon }}</span>
        <span class="main">
          <span class="title">{{ e.title }}</span>
          <span class="sub muted">
            <code>{{ e.table }}</code>
            <template v-if="e.type"> · {{ e.type }}</template>
            <template v-if="e.detail"> · {{ e.detail }}</template>
            <template v-if="e.relatedCount"> · {{ e.relatedCount }} registro(s) relacionado(s)</template>
          </span>
        </span>
        <span class="who muted">
          <span>{{ e.updatedBy }}</span>
          <span class="when">{{ e.updatedOn }}</span>
        </span>
        <span class="act" :class="actionClass(e.action)">{{ ACTION_LABEL[e.action] || e.action }}</span>
      </button>
    </section>
  </div>
</template>

<style scoped>
.us { padding: 22px 26px 60px; overflow: auto; height: 100%; }
header { border-bottom: 1px solid var(--line); padding-bottom: 12px; margin-bottom: 14px; }
.kind { display: flex; gap: 6px; flex-wrap: wrap; }
.chip.strong { background: var(--accent); color: var(--on-accent); border-color: transparent; font-weight: 600; }
h1 { font-size: 21px; margin: 8px 0 4px; }
.desc { margin: 0 0 6px; max-width: 70ch; }
.meta { margin: 0; font-size: 12.5px; }
.types { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
.bar { display: flex; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; }
.search {
  flex: 1; min-width: 220px; background: var(--bg-2); border: 1px solid var(--line);
  border-radius: 8px; padding: 7px 10px; color: inherit; font-size: 13px;
}
.grp { display: flex; gap: 5px; align-items: center; }
.lbl { font-size: 11.5px; }
.tiny { padding: 2px 9px; font-size: 12px; }
.grp .on { border-color: var(--accent); color: var(--accent); }
h2 {
  font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted);
  margin: 18px 0 8px; display: flex; gap: 8px; align-items: center;
}
h2 .n { background: var(--bg-3); border: 1px solid var(--line); border-radius: 999px; padding: 0 7px; }
.row {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
  background: var(--bg-2); border: 1px solid var(--line); border-left: 3px solid var(--line);
  border-radius: 10px; padding: 9px 12px; margin-bottom: 6px; cursor: pointer; color: inherit;
}
.row:hover { background: var(--bg-3); border-color: var(--accent); }
.row.rich { border-left-color: var(--accent); }
.icon { font-size: 15px; width: 20px; text-align: center; }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.title { font-weight: 600; font-size: 13.5px; }
.sub { font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub code { font-size: 11.5px; }
.who { display: flex; flex-direction: column; text-align: right; font-size: 11.5px; white-space: nowrap; }
.when { font-family: ui-monospace, monospace; font-size: 11px; }
.act {
  font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
  border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; white-space: nowrap;
}
.act.del { color: var(--danger); border-color: var(--danger); }
.empty { padding: 16px; border: 1px dashed var(--line); border-radius: 10px; }
.missing {
  border: 1px solid var(--logic); border-radius: 12px;
  background: var(--warn-bg); padding: 16px 18px; margin-bottom: 18px;
}
.mh { font-size: 14px; text-transform: none; letter-spacing: 0; color: var(--text); margin: 0 0 8px; }
.missing p { margin: 0 0 12px; font-size: 13px; max-width: 78ch; }
.missing .last { margin: 12px 0 0; font-size: 12.5px; }
.ways { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.way { background: var(--bg-2); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; }
.wt { font-weight: 600; font-size: 12.5px; margin-bottom: 8px; }
.way ol { margin: 0; padding-left: 18px; }
.way li { font-size: 12.5px; margin-bottom: 5px; line-height: 1.5; }
@media (max-width: 900px) { .ways { grid-template-columns: 1fr; } }
@media (max-width: 760px) { .who { display: none; } }
</style>
