<script setup>
import { ref, computed, watch } from 'vue'
import DiffValue from './DiffValue.vue'
import NodeDiffRow from './NodeDiffRow.vue'
import NodeDiffSplit from './NodeDiffSplit.vue'
import { diffNodes, diffFields, realChanges } from '../lib/diff.js'
import { displayName } from '../lib/model.js'
import { provideCollapse } from '../lib/collapse.js'
import { toggleIgnored } from '../lib/ignored.js'

const props = defineProps({
  entry: Object,
  modelA: Object,
  modelB: Object,
  labelA: { type: String, default: 'XML A' },
  labelB: { type: String, default: 'XML B' },
  candidates: { type: Array, default: () => [] }
})
const emit = defineEmits(['pair', 'unpair'])
const pairTo = ref('')

const { collapseAll, expandAll } = provideCollapse()

const hasNodes = computed(() => {
  const v = (props.entry.a || props.entry.b || {}).view
  return v === 'flow' || v === 'action'
})

const tab = ref(hasNodes.value ? 'pasos' : 'campos')
const onlyChanges = ref(true)
// En un flujo lo que se compara es la secuencia, y eso sólo se lee en paralelo.
const split = ref(true)
watch(() => props.entry, () => { tab.value = hasNodes.value ? 'pasos' : 'campos' })
const models = computed(() => ({ a: props.modelA, b: props.modelB }))
const nodeRows = computed(() =>
  hasNodes.value ? diffNodes(props.entry.a, props.entry.b, models.value) : []
)
const UNCHANGED = new Set(['equal', 'moved'])
const visibleNodeRows = computed(() =>
  onlyChanges.value ? nodeRows.value.filter((r) => !UNCHANGED.has(r.status)) : nodeRows.value
)
const fieldRows = computed(() =>
  props.entry.fieldDiff.filter((f) => (onlyChanges.value ? f.status !== 'equal' : true))
)
const childRows = computed(() => {
  const rows = props.entry.children.rows || []
  return (onlyChanges.value ? rows.filter((r) => r.status !== 'equal') : rows).map((r) => {
    const ref_ = r.a || r.b
    return {
      ...r,
      title: displayName(ref_),
      table: ref_.table,
      changes: realChanges(diffFields(r.a, r.b, models.value))
    }
  })
})

const nodeStats = computed(() => ({
  mod: nodeRows.value.filter((r) => r.status === 'mod').length,
  add: nodeRows.value.filter((r) => r.status === 'add').length,
  del: nodeRows.value.filter((r) => r.status === 'del').length
}))

const statusLabel = { changed: 'modificado', added: 'solo en B', removed: 'solo en A', equal: 'sin cambios' }
const matchLabel = {
  name: '≈ emparejado por nombre',
  loose: '≈ emparejado por descarte',
  manual: '≈ emparejado a mano'
}
const matchHelp = {
  name: 'Los sys_id no coinciden entre los dos XML; se emparejó por nombre',
  loose: 'Era el único registro de su tipo sin pareja en cada lado, así que se compararon entre sí',
  manual: 'Los emparejaste tú'
}

// Diagnóstico: qué tablas relacionadas trae cada lado. Sirve cuando no aparecen steps.
const relatedTables = computed(() => {
  const ra = (props.entry.a && props.entry.a.related) || {}
  const rb = (props.entry.b && props.entry.b.related) || {}
  const names = [...new Set([...Object.keys(ra), ...Object.keys(rb)])].sort()
  return names.map((t) => ({ table: t, a: ra[t] || 0, b: rb[t] || 0 }))
})
const nodeCounts = computed(() => ({
  a: flattenCount(props.entry.a),
  b: flattenCount(props.entry.b)
}))
function flattenCount(item) {
  if (!item) return 0
  return item.view === 'flow' ? (item.nodeCount || 0) : (item.stepCount || 0)
}
</script>

<template>
  <div class="rd">
    <header>
      <div class="chips">
        <span class="chip" :class="entry.status">{{ statusLabel[entry.status] }}</span>
        <span class="chip">{{ entry.kindLabel }}</span>
        <span class="chip">{{ entry.table }}</span>
        <span v-if="entry.match" class="chip" :title="matchHelp[entry.match]">{{ matchLabel[entry.match] }}</span>
        <button v-if="entry.match === 'manual' || entry.match === 'loose'" class="ghost tiny" @click="emit('unpair')">
          Deshacer emparejado
        </button>
      </div>
      <h1>{{ entry.title }}</h1>
      <div class="bar">
        <nav>
          <button v-if="hasNodes" class="ghost" :class="{ on: tab === 'pasos' }" @click="tab = 'pasos'">
            Pasos
            <span v-if="nodeStats.mod + nodeStats.add + nodeStats.del" class="badge">
              {{ nodeStats.mod + nodeStats.add + nodeStats.del }}
            </span>
          </button>
          <button class="ghost" :class="{ on: tab === 'campos' }" @click="tab = 'campos'">
            Campos
            <span v-if="entry.changeCount" class="badge">{{ entry.changeCount }}</span>
          </button>
          <button v-if="entry.children.rows.length" class="ghost" :class="{ on: tab === 'rel' }" @click="tab = 'rel'">
            Relacionados
            <span v-if="entry.children.added + entry.children.removed + entry.children.changed" class="badge">
              {{ entry.children.added + entry.children.removed + entry.children.changed }}
            </span>
          </button>
        </nav>
        <div class="right">
          <template v-if="tab === 'pasos'">
            <div class="seg">
              <button class="ghost tiny" :class="{ on: split }" @click="split = true">Lado a lado</button>
              <button class="ghost tiny" :class="{ on: !split }" @click="split = false">Lista</button>
            </div>
            <button class="ghost tiny" @click="collapseAll()">Colapsar todo</button>
            <button class="ghost tiny" @click="expandAll()">Expandir todo</button>
          </template>
          <label class="toggle">
            <input type="checkbox" v-model="onlyChanges" />
            Solo cambios
          </label>
        </div>
      </div>
      <div v-if="(entry.status === 'added' || entry.status === 'removed') && candidates.length" class="pairbox">
        <span class="muted">
          Este registro sólo está en {{ entry.status === 'removed' ? labelA : labelB }}.
          Si en {{ entry.status === 'removed' ? labelB : labelA }} es otro registro con otro nombre
          (una copia, un renombrado), empareja los dos para verlos lado a lado:
        </span>
        <select v-model="pairTo">
          <option value="">Comparar con…</option>
          <option v-for="c in candidates" :key="c.key" :value="c.key">{{ c.title }} · {{ c.table }}</option>
        </select>
        <button class="ghost tiny" :disabled="!pairTo" @click="emit('pair', pairTo)">Comparar</button>
      </div>
      <div class="sides">
        <span class="side a">◂ {{ labelA }}</span>
        <span class="side b">{{ labelB }} ▸</span>
      </div>
    </header>

    <section v-if="tab === 'pasos'">
      <div v-if="!visibleNodeRows.length" class="muted empty">
        <template v-if="nodeRows.length">Los pasos son idénticos en ambos XML.</template>
        <template v-else>
          <p class="m0">
            No se detectaron pasos en estos XML
            (A: {{ nodeCounts.a }} · B: {{ nodeCounts.b }}).
            Suele pasar cuando el export no incluye los registros hijos de la action.
          </p>
          <div v-if="relatedTables.length" class="diag">
            <div class="dhead">Registros relacionados encontrados (A / B)</div>
            <div v-for="t in relatedTables" :key="t.table" class="drow">
              <code>{{ t.table }}</code><span>{{ t.a }} / {{ t.b }}</span>
            </div>
          </div>
          <p v-else class="m0">El XML no trae ningún registro que apunte a esta action.</p>
        </template>
      </div>
      <NodeDiffSplit
        v-else-if="split"
        :rows="nodeRows"
        :only-changes="onlyChanges"
        :model="modelB || modelA"
      />
      <NodeDiffRow v-else v-for="(r, i) in visibleNodeRows" :key="i" :row="r" :model="modelB || modelA" />
    </section>

    <section v-else-if="tab === 'campos'">
      <div v-if="!fieldRows.length" class="muted empty">Sin diferencias en los campos.</div>
      <div v-for="f in fieldRows" :key="f.name" class="frow" :class="f.status">
        <div class="fname">
          <span class="k">{{ f.name }}</span>
          <span v-if="f.noisy && f.status !== 'equal'" class="chip tiny">ruido</span>
          <button
            v-if="f.status !== 'equal' && !f.noisy"
            class="ign" title="No contar este campo como cambio"
            @click="toggleIgnored(f.name)"
          >ignorar</button>
        </div>
        <DiffValue
          :name="f.name" :left="f.left" :right="f.right" :status="f.status"
          :model="modelB || modelA"
        />
      </div>
    </section>

    <section v-else>
      <div v-if="!childRows.length" class="muted empty">Sin cambios en los registros relacionados.</div>
      <div v-for="(c, i) in childRows" :key="i" class="crow" :class="c.status">
        <span class="cst">{{ statusLabel[c.status] }}</span>
        <span class="ctitle">{{ c.title }}</span>
        <span class="chip">{{ c.table }}</span>
        <span class="muted cfields">
          {{ c.changes.length ? c.changes.map((x) => x.name).join(', ') : '' }}
        </span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.rd { padding: 20px 24px 60px; overflow: auto; height: 100%; }
header { border-bottom: 1px solid var(--line); padding-bottom: 10px; margin-bottom: 16px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip.changed { color: var(--logic); border-color: var(--logic); }
.chip.added { color: var(--ok); border-color: var(--ok); }
.chip.removed { color: var(--danger); border-color: var(--danger); }
.chip.tiny { font-size: 10px; }
h1 { font-size: 20px; margin: 8px 0 10px; }
.bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
nav { display: flex; gap: 6px; }
nav .on { border-color: var(--accent); color: var(--accent); }
.badge {
  display: inline-block; margin-left: 6px; background: var(--bg); border-radius: 999px;
  padding: 0 6px; font-size: 11px; color: var(--muted);
}
.right { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.seg { display: flex; gap: 4px; }
.seg .on { border-color: var(--accent); color: var(--accent); }
.tiny { padding: 2px 8px; font-size: 12px; }
.toggle { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; color: var(--muted); }
.ign {
  padding: 0 6px; font-size: 10px; line-height: 16px;
  text-transform: uppercase; letter-spacing: .05em;
  color: var(--muted); border: 1px solid var(--line); border-radius: 999px; background: none;
}
.ign:hover { color: var(--accent); border-color: var(--accent); }
.pairbox {
  display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
  margin-top: 10px; padding: 10px 12px; font-size: 12.5px;
  border: 1px dashed var(--line); border-radius: 10px; background: var(--bg-2);
}
.pairbox select {
  padding: 4px 8px; font-size: 12px; max-width: 320px;
  border: 1px solid var(--line); border-radius: 8px; background: var(--bg-3); color: inherit;
}
.sides { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; font-size: 11px; }
.side { color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
.side.b { text-align: right; }
.frow { display: grid; grid-template-columns: 170px 1fr; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--line); align-items: start; }
.frow.equal { opacity: .6; }
.frow:has(.dl) { grid-template-columns: 1fr; gap: 4px; }
.fname { display: flex; gap: 6px; flex-wrap: wrap; }
.k { font-family: ui-monospace, monospace; font-size: 12.5px; color: var(--muted); word-break: break-word; }
.crow { display: flex; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
.cst { min-width: 90px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.crow.changed .cst { color: var(--logic); }
.crow.added .cst { color: var(--ok); }
.crow.removed .cst { color: var(--danger); }
.ctitle { font-weight: 500; }
.cfields { font-family: ui-monospace, monospace; font-size: 11.5px; }
.empty { padding: 16px; border: 1px dashed var(--line); border-radius: 10px; }
.m0 { margin: 0 0 10px; }
.diag { border-top: 1px solid var(--line); padding-top: 8px; }
.dhead { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
.drow { display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; padding: 2px 0; }
.drow code { font-size: 12px; }
@media (max-width: 900px) { .frow { grid-template-columns: 1fr; } }
</style>
