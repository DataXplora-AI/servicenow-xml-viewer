<script setup>
import { computed } from 'vue'
import DiffLines from './DiffLines.vue'
import ValueCell from './ValueCell.vue'

const props = defineProps({
  name: String,
  left: { type: [String, Number], default: undefined },
  right: { type: [String, Number], default: undefined },
  status: String,
  model: Object
})

const big = computed(() => {
  const s = (v) => String(v ?? '')
  return s(props.left).includes('\n') || s(props.right).includes('\n') ||
    s(props.left).length > 200 || s(props.right).length > 200
})
</script>

<template>
  <DiffLines
    v-if="big && status === 'changed'"
    :left="String(left ?? '')"
    :right="String(right ?? '')"
    :label="name"
  />
  <div v-else class="two" :class="status">
    <div class="cell left">
      <span v-if="left === undefined" class="muted none">—</span>
      <ValueCell v-else :name="name" :value="left" :model="model" />
    </div>
    <div class="cell right">
      <span v-if="right === undefined" class="muted none">—</span>
      <ValueCell v-else :name="name" :value="right" :model="model" />
    </div>
  </div>
</template>

<style scoped>
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cell { min-width: 0; padding: 4px 8px; border-radius: 6px; }
.two.changed .left, .two.removed .left { background: var(--danger-bg); }
.two.changed .right, .two.added .right { background: var(--ok-bg); }
.none { font-size: 12px; }
@media (max-width: 900px) { .two { grid-template-columns: 1fr; } }
</style>
