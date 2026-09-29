<script setup>
import { ref, computed } from 'vue'
import ValueCell from './ValueCell.vue'
import FieldTable from './FieldTable.vue'
import { useCollapseTarget } from '../lib/collapse.js'

const props = defineProps({
  node: Object,
  model: Object,
  prefix: { type: String, default: '' },
  index: { type: Number, default: 1 }
})
const emit = defineEmits(['open'])

const showRaw = ref(false)
const open = useCollapseTarget(true)
const number = computed(() => (props.prefix ? props.prefix + '.' + props.index : String(props.index)))
const extra = computed(() => {
  const f = props.node.record.fields
  const keys = ['condition', 'table', 'script', 'run_as', 'wait_for', 'timeout']
  return keys
    .filter((k) => (f[k] || '').trim() !== '')
    .map((k) => ({ name: k, value: f[k] }))
})
</script>

<template>
  <div class="node" :class="[node.kind, { closed: !open }]">
    <div class="head" @click="open = !open">
      <span class="caret">{{ open ? '▾' : '▸' }}</span>
      <span class="num">{{ number }}</span>
      <div class="titles">
        <div class="title">{{ node.title }}</div>
        <div class="sub muted">
          <span class="chip" :class="node.kind">{{ node.kindLabel }}</span>
          <span v-if="node.typeName">{{ node.typeName }}</span>
          <span v-else-if="node.record.fields.name && node.record.fields.name !== node.title">{{ node.record.fields.name }}</span>
        </div>
      </div>
      <button class="ghost tiny" @click.stop="showRaw = !showRaw; open = true">
        {{ showRaw ? 'Ocultar campos' : 'Campos' }}
      </button>
    </div>

    <template v-if="open">
    <div v-if="extra.length" class="rows">
      <div v-for="e in extra" :key="e.name" class="row">
        <span class="k">{{ e.name }}</span>
        <span class="v"><ValueCell :name="e.name" :value="e.value" :model="model" @open="emit('open', $event)" /></span>
      </div>
    </div>

    <div v-if="node.inputs.length" class="rows">
      <div class="section muted">Inputs</div>
      <div v-for="i in node.inputs" :key="i.name" class="row">
        <span class="k">{{ i.name }}</span>
        <span class="v"><ValueCell :name="i.name" :value="i.value" :model="model" @open="emit('open', $event)" /></span>
      </div>
    </div>

    <div v-else-if="!extra.length" class="empty muted">Sin inputs registrados en el XML.</div>

    <div v-if="showRaw" class="raw">
      <FieldTable :record="node.record" :model="model" @open="emit('open', $event)" />
    </div>

    </template>

    <div v-if="open && node.children.length" class="children">
      <NodeCard
        v-for="(c, i) in node.children"
        :key="c.sysId || i"
        :node="c"
        :model="model"
        :prefix="number"
        :index="i + 1"
        @open="emit('open', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.node {
  /* las filas se adaptan al ancho de la tarjeta, no al de la ventana: a seis niveles de
     anidamiento el espacio útil es una fracción de la pantalla */
  container-type: inline-size;
  border: 1px solid var(--line);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius);
  background: var(--bg-2);
  padding: 12px 14px;
  margin-bottom: 10px;
}

/* el anidamiento llega a seis o siete niveles: cada uno debe costar poco espacio
   horizontal o el contenido termina en una columna de una palabra de ancho */
.node .node { padding: 10px 11px; }
.node.logic { border-left-color: var(--logic); background: var(--bg-3); }
/* un subflujo es otro flujo entero corriendo dentro de este: conviene verlo de lejos */
.node.subflow { border-left-color: var(--subflow); background: var(--subflow-bg); }
.chip.subflow { color: var(--subflow); background: var(--subflow-bg); }
.chip.logic { color: var(--logic); background: var(--warn-bg); }
.head { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; }
.caret { color: var(--muted); font-size: 11px; line-height: 24px; }
.node.closed { padding-bottom: 10px; }
.num {
  min-width: 30px; height: 24px; padding: 0 6px; border-radius: 6px;
  background: var(--bg-3); border: 1px solid var(--line);
  display: inline-flex; align-items: center; justify-content: center;
  font-family: ui-monospace, monospace; font-size: 12px; color: var(--muted);
}
.titles { flex: 1; min-width: 0; }
.title { font-weight: 600; }
.sub { display: flex; gap: 8px; align-items: center; font-size: 12px; margin-top: 2px; flex-wrap: wrap; }
.tiny { padding: 2px 8px; font-size: 12px; }
.rows { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.section { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; }
.row { display: grid; grid-template-columns: minmax(0, 180px) minmax(0, 1fr); gap: 12px; align-items: start; }
.k { font-family: ui-monospace, monospace; font-size: 12.5px; color: var(--muted); word-break: break-word; }
.v { min-width: 0; }
.empty { margin-top: 8px; font-size: 12.5px; }
.raw { margin-top: 12px; border-top: 1px dashed var(--line); padding-top: 10px; }
.children { margin: 10px 0 0 0; padding-left: 10px; border-left: 2px dashed var(--line); }
@container (max-width: 560px) { .row { grid-template-columns: 1fr; gap: 2px; } }
@media (max-width: 760px) { .row { grid-template-columns: 1fr; gap: 2px; } }
</style>
