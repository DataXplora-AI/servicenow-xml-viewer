<script setup>
import { computed } from 'vue'

const props = defineProps({
  node: Object,
  prefix: { type: String, default: '' },
  index: { type: Number, default: 1 },
  selected: { type: String, default: '' }
})
const emit = defineEmits(['select'])
const number = computed(() => (props.prefix ? props.prefix + '.' + props.index : String(props.index)))
const inputPreview = computed(() => props.node.inputs.slice(0, 3))
</script>

<template>
  <div class="wrap">
    <div
      class="box"
      :class="[node.kind, { active: selected === node.sysId }]"
      @click="emit('select', node.sysId)"
    >
      <div class="top">
        <span class="num">{{ number }}</span>
        <span class="name">{{ node.title }}</span>
      </div>
      <div class="type">
        <span class="kind">{{ node.kindLabel }}</span>
        <span class="muted">{{ node.typeName || (node.record.fields.name !== node.title ? node.record.fields.name : '') }}</span>
      </div>
      <ul v-if="inputPreview.length" class="ins">
        <li v-for="i in inputPreview" :key="i.name">
          <span class="ik">{{ i.name }}</span>
        </li>
        <li v-if="node.inputs.length > 3" class="muted">+{{ node.inputs.length - 3 }} más</li>
      </ul>
    </div>

    <template v-if="node.children.length">
      <div class="branch-line"></div>
      <div class="branch">
        <div class="branch-label muted">contenido de «{{ node.title }}»</div>
        <DiagramNode
          v-for="(c, i) in node.children"
          :key="c.sysId || i"
          :node="c"
          :prefix="number"
          :index="i + 1"
          :selected="selected"
          @select="emit('select', $event)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.wrap { display: flex; flex-direction: column; align-items: stretch; }
.box {
  border: 1px solid var(--line);
  border-top: 3px solid var(--accent);
  border-radius: 10px;
  background: var(--bg-2);
  padding: 10px 12px;
  cursor: pointer;
  transition: border-color .15s, transform .15s;
}
.box:hover { transform: translateY(-1px); }
.box.logic { border-top-color: var(--logic); }
.box.subflow { border-top-color: var(--subflow); background: var(--subflow-bg); }
.box.logic .kind { color: var(--logic); }
.box.subflow .kind { color: var(--subflow); }
.kind {
  font-size: 10px; text-transform: uppercase; letter-spacing: .07em;
  color: var(--accent); margin-right: 6px;
}
.box.active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--ring); }
.top { display: flex; gap: 8px; align-items: center; }
.num { font-family: ui-monospace, monospace; font-size: 11px; color: var(--muted); }
.name { font-weight: 600; font-size: 13.5px; }
.type { font-size: 12px; margin-top: 3px; display: flex; gap: 2px; align-items: baseline; flex-wrap: wrap; }
.ins { margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 4px; }
.ins li { font-size: 11px; border: 1px solid var(--line); border-radius: 999px; padding: 0 7px; color: var(--muted); }
.ik { font-family: ui-monospace, monospace; }
.branch-line { width: 2px; height: 14px; background: var(--line); margin-left: 22px; }
.branch {
  margin-left: 22px; padding: 10px 10px 4px; border: 1px dashed var(--line);
  border-radius: 10px; display: flex; flex-direction: column; gap: 10px;
}
.branch-label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
</style>
