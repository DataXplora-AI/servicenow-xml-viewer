<script setup>
import { computed } from 'vue'
import DiagramNode from './DiagramNode.vue'
import DiagramDetail from './DiagramDetail.vue'

const props = defineProps({
  flow: Object,
  model: { type: Object, required: true },
  selected: { type: String, default: '' }
})
const emit = defineEmits(['select', 'open'])

// El diagrama numera los pasos según su posición; el panel muestra el mismo número
// para que se vea de dónde salió lo que se está mirando.
const found = computed(() => {
  const walk = (nodes, prefix) => {
    for (let i = 0; i < nodes.length; i++) {
      const number = prefix ? prefix + '.' + (i + 1) : String(i + 1)
      if (nodes[i].sysId === props.selected) return { node: nodes[i], number }
      const deeper = walk(nodes[i].children, number)
      if (deeper) return deeper
    }
    return null
  }
  return props.selected ? walk(props.flow.tree, '') : null
})
</script>

<template>
  <div class="split">
  <div class="diagram">
    <div v-for="t in flow.triggers" :key="t.record.sysId" class="trigger">
      <div class="badge">TRIGGER</div>
      <div class="tname">{{ t.title }}</div>
      <ul v-if="t.inputs.length" class="tins muted small">
        <li v-for="i in t.inputs.slice(0, 4)" :key="i.name">
          <span class="ik">{{ i.name }}:</span> {{ i.value }}
        </li>
      </ul>
    </div>

    <template v-for="(n, i) in flow.tree" :key="n.sysId || i">
      <div class="arrow">↓</div>
      <DiagramNode :node="n" :index="i + 1" :selected="selected" @select="emit('select', $event)" />
    </template>

    <div v-if="!flow.tree.length" class="muted empty">
      No se encontraron action instances en este XML. Si pegaste solo el registro del flow,
      carga el update set completo para ver los pasos.
    </div>
    <div v-else class="arrow end">■ fin</div>
  </div>

  <DiagramDetail
    :node="found && found.node"
    :number="found ? found.number : ''"
    :model="model"
    @open="emit('open', $event)"
    @close="emit('select', '')"
  />
  </div>
</template>

<style scoped>
.split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 400px);
  gap: 18px;
  align-items: start;
}
.diagram { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
@media (max-width: 1100px) {
  .split { grid-template-columns: 1fr; }
}
.trigger {
  border: 1px solid var(--accent-2); border-radius: 10px; padding: 10px 12px;
  background: var(--accent-2-soft);
}
.badge {
  font-size: 10px; letter-spacing: .1em; color: var(--accent-2); font-weight: 700;
}
.tname { font-weight: 600; margin-top: 2px; }
.small { font-size: 12px; }
.tins { margin: 4px 0 0; padding-left: 16px; display: grid; gap: 1px; }
.ik { font-family: ui-monospace, monospace; }
.arrow { color: var(--muted); text-align: center; font-size: 13px; }
.arrow.end { margin-top: 6px; font-size: 11px; }
.empty { padding: 14px; border: 1px dashed var(--line); border-radius: 10px; }
</style>
