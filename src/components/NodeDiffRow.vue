<script setup>
import { computed } from 'vue'
import DiffValue from './DiffValue.vue'
import { useCollapseTarget } from '../lib/collapse.js'
import { toggleIgnored } from '../lib/ignored.js'

const props = defineProps({ row: Object, model: Object })
const open = useCollapseTarget(props.row.status !== 'equal' && props.row.status !== 'moved')

const changed = computed(() => props.row.inputs.filter((i) => i.status !== 'equal'))
const fieldChanges = computed(() => props.row.fields || [])
const shown = computed(() => (open.value ? props.row.inputs : []))
const label = { equal: 'sin cambios', moved: 'renumerado', mod: 'modificado', add: 'agregado', del: 'eliminado' }
</script>

<template>
  <div class="ndr" :class="row.status">
    <div class="head" @click="open = !open">
      <span class="st">{{ label[row.status] }}</span>
      <div class="cols">
        <div class="col">
          <template v-if="row.a">
            <span class="num">{{ row.a.number }}</span>
            <span class="nm">{{ row.a.title }}</span>
            <span class="muted ty">{{ row.a.typeName || row.a.record.fields.name || '' }}</span>
          </template>
          <span v-else class="muted">—</span>
        </div>
        <div class="col">
          <template v-if="row.b">
            <span class="num">{{ row.b.number }}</span>
            <span class="nm">{{ row.b.title }}</span>
            <span class="muted ty">{{ row.b.typeName || row.b.record.fields.name || '' }}</span>
          </template>
          <span v-else class="muted">—</span>
        </div>
      </div>
      <span class="muted toggle">
        <span v-if="row.matchedByName" class="chip tiny" title="Los sys_id no coinciden; se emparejó por nombre">≈ por nombre</span>
        <span v-if="fieldChanges.length" class="cnt">{{ fieldChanges.length }} campo(s)</span>
        <span v-if="changed.length" class="cnt">{{ changed.length }} input(s)</span>
        {{ open ? '▾' : '▸' }}
      </span>
    </div>

    <div v-if="open && fieldChanges.length" class="inputs">
      <div class="section muted">Campos del step</div>
      <div v-for="f in fieldChanges" :key="'f' + f.name" class="irow" :class="f.status">
        <span class="k">
          {{ f.name }}
          <button class="ign" title="No contar este campo como cambio" @click.stop="toggleIgnored(f.name)">ignorar</button>
        </span>
        <DiffValue :name="f.name" :left="f.left" :right="f.right" :status="f.status" :model="model" />
      </div>
    </div>

    <div v-if="open && row.inputs.length" class="inputs">
      <div v-if="fieldChanges.length" class="section muted">Inputs</div>
      <div v-for="i in shown" :key="i.name" class="irow" :class="i.status">
        <span class="k">{{ i.name }}</span>
        <DiffValue :name="i.name" :left="i.left" :right="i.right" :status="i.status" :model="model" />
      </div>
    </div>
    <div v-else-if="open" class="muted empty">Sin inputs.</div>
    <p v-if="open && row.ignored" class="muted note">
      {{ row.ignored }} campo(s) no se cuentan como cambio: auditoría (quién y cuándo tocó
      el registro) o identificadores internos que ServiceNow regenera al publicar.
    </p>
  </div>
</template>

<style scoped>
.ndr { border: 1px solid var(--line); border-radius: 10px; margin-bottom: 8px; background: var(--bg-2); overflow: hidden; }
.ndr.mod { border-left: 3px solid var(--logic); }
.ndr.add { border-left: 3px solid var(--ok); }
.ndr.del { border-left: 3px solid var(--danger); }
.ndr.equal, .ndr.moved { opacity: .72; }
.head { display: flex; align-items: center; gap: 10px; padding: 9px 12px; cursor: pointer; }
.head:hover { background: var(--bg-3); }
.st {
  font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted);
  min-width: 82px;
}
.ndr.mod .st { color: var(--logic); }
.ndr.add .st { color: var(--ok); }
.ndr.del .st { color: var(--danger); }
.cols { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; min-width: 0; }
.col { display: flex; gap: 6px; align-items: baseline; min-width: 0; }
.num { font-family: ui-monospace, monospace; font-size: 11px; color: var(--muted); }
.nm { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ty { font-size: 11.5px; }
.toggle { display: flex; gap: 8px; align-items: center; font-size: 11.5px; }
.inputs { padding: 4px 12px 12px; display: flex; flex-direction: column; gap: 6px; }
.irow { display: grid; grid-template-columns: 150px 1fr; gap: 10px; align-items: start; }
.irow .k { font-family: ui-monospace, monospace; font-size: 12.5px; color: var(--muted); word-break: break-word; }
.irow.equal { opacity: .6; }
/* un diff línea a línea ocupa todo el ancho y deja la etiqueta arriba */
.irow:has(.dl) { grid-template-columns: 1fr; gap: 4px; }
.empty { padding: 0 12px 10px; font-size: 12.5px; }
.note { margin: 0; padding: 0 12px 10px; font-size: 11.5px; line-height: 1.45; }
.ign {
  margin-left: 8px; padding: 0 6px; font-size: 10px; line-height: 16px;
  text-transform: uppercase; letter-spacing: .05em;
  color: var(--muted); border: 1px solid var(--line); border-radius: 999px; background: none;
}
.ign:hover { color: var(--accent); border-color: var(--accent); }
.section { font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; }
.chip.tiny { font-size: 10px; padding: 0 6px; }
@media (max-width: 900px) { .irow { grid-template-columns: 1fr; } .cols { grid-template-columns: 1fr; } }
</style>
