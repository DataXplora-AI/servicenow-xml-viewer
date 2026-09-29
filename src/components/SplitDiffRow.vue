<script setup>
import { computed } from 'vue'
import DiffValue from './DiffValue.vue'
import { useCollapseTarget } from '../lib/collapse.js'
import { toggleIgnored } from '../lib/ignored.js'

const props = defineProps({ row: Object, depth: Number, model: Object })

const open = useCollapseTarget(false)
const indent = computed(() => ({ marginLeft: props.depth * 14 + 'px' }))
const changes = computed(
  () => (props.row.fields || []).length + props.row.inputs.filter((i) => i.status !== 'equal').length
)
</script>

<template>
  <!-- La fila vive en el grid del padre: display:contents deja que cada panel sea una
       celda y que el detalle ocupe las dos columnas. -->
  <div class="line">
    <div class="pane left" @click="open = !open">
      <div v-if="row.a" class="card" :class="[row.a.kind, row.status]" :style="indent">
        <div class="top">
          <span class="num">{{ row.a.number }}</span>
          <span class="nm">{{ row.a.title }}</span>
        </div>
        <div class="meta">
          <span class="kind">{{ row.a.kindLabel }}</span>
          <span class="muted">{{ row.a.typeName }}</span>
        </div>
      </div>
      <div v-else class="hole"><span>no existe en A</span></div>
    </div>

    <div class="pane right" @click="open = !open">
      <div v-if="row.b" class="card" :class="[row.b.kind, row.status]" :style="indent">
        <div class="top">
          <span class="num">{{ row.b.number }}</span>
          <span class="nm">{{ row.b.title }}</span>
          <span v-if="changes" class="cnt">{{ changes }}</span>
          <span class="caret">{{ open ? '▾' : '▸' }}</span>
        </div>
        <div class="meta">
          <span class="kind">{{ row.b.kindLabel }}</span>
          <span class="muted">{{ row.b.typeName }}</span>
        </div>
      </div>
      <div v-else class="hole"><span>no existe en B</span></div>
    </div>

    <div v-if="open" class="detail">
      <template v-if="(row.fields || []).length">
        <div class="section muted">Campos</div>
        <div v-for="f in row.fields" :key="'f' + f.name" class="irow" :class="f.status">
          <span class="k">
            {{ f.name }}
            <button class="ign" title="No contar este campo como cambio" @click.stop="toggleIgnored(f.name)">ignorar</button>
          </span>
          <DiffValue :name="f.name" :left="f.left" :right="f.right" :status="f.status" :model="model" />
        </div>
      </template>
      <template v-if="row.inputs.length">
        <div class="section muted">Inputs</div>
        <div v-for="i in row.inputs" :key="i.name" class="irow" :class="i.status">
          <span class="k">{{ i.name }}</span>
          <DiffValue :name="i.name" :left="i.left" :right="i.right" :status="i.status" :model="model" />
        </div>
      </template>
      <div v-if="!row.inputs.length && !(row.fields || []).length" class="muted small">
        Sin inputs registrados en el XML.
      </div>
      <p v-if="row.ignored" class="muted note">
        {{ row.ignored }} campo(s) no se cuentan como cambio: auditoría (quién y cuándo tocó
        el registro) o identificadores internos que ServiceNow regenera al publicar.
      </p>
    </div>
  </div>
</template>

<style scoped>
.line { display: contents; }
.pane { min-width: 0; padding: 3px 0; cursor: pointer; }
.detail {
  grid-column: 1 / -1;
  padding: 8px 12px 12px;
  border: 1px solid var(--line);
  border-top: none;
  border-radius: 0 0 10px 10px;
  background: var(--bg-2);
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 6px;
}

.card {
  border: 1px solid var(--line);
  border-left: 3px solid var(--accent);
  border-radius: 8px;
  background: var(--bg-2);
  padding: 7px 10px;
  height: 100%;
}
.card.logic { border-left-color: var(--logic); }
.card.subflow { border-left-color: var(--subflow); }
.card.equal, .card.moved { opacity: .55; }
/* el estado del par manda sobre el tipo de nodo: es lo que se viene a mirar */
.card.mod { background: var(--warn-bg); }
.left .card.del { background: var(--danger-bg); border-left-color: var(--danger); }
.right .card.add { background: var(--ok-bg); border-left-color: var(--ok); }

/* El hueco marca que el paso no existe de ese lado. Si no se ve, la columna parece
   vacía y la comparación deja de leerse como dos lados. */
.hole {
  height: 100%;
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--muted);
  border-radius: 8px;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: .07em;
  color: var(--muted);
  background: repeating-linear-gradient(
    -45deg, transparent, transparent 5px, rgba(90, 116, 145, .12) 5px, rgba(90, 116, 145, .12) 10px
  );
}

.top { display: flex; gap: 7px; align-items: baseline; min-width: 0; }
.num { font-family: ui-monospace, monospace; font-size: 11px; color: var(--muted); }
.nm { font-weight: 600; font-size: 13px; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cnt {
  margin-left: auto; font-size: 10.5px; color: var(--logic);
  border: 1px solid var(--logic); border-radius: 999px; padding: 0 6px;
}
.caret { color: var(--muted); font-size: 10px; }
.meta { display: flex; gap: 6px; font-size: 11.5px; margin-top: 1px; min-width: 0; }
.meta .muted { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kind { font-size: 9.5px; text-transform: uppercase; letter-spacing: .07em; color: var(--accent); }
.card.logic .kind { color: var(--logic); }
.card.subflow .kind { color: var(--subflow); }

.irow { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 10px; align-items: start; }
.irow .k { font-family: ui-monospace, monospace; font-size: 12.5px; color: var(--muted); word-break: break-word; }
.irow.equal { opacity: .6; }
.irow:has(.dl) { grid-template-columns: 1fr; gap: 4px; }
.ign {
  margin-left: 8px; padding: 0 6px; font-size: 10px; line-height: 16px;
  text-transform: uppercase; letter-spacing: .05em;
  color: var(--muted); border: 1px solid var(--line); border-radius: 999px; background: none;
}
.ign:hover { color: var(--accent); border-color: var(--accent); }
.section { font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; }
.small { font-size: 12.5px; }
.note { margin: 2px 0 0; font-size: 11.5px; line-height: 1.45; }

/* Dos columnas es el punto de esta vista: se mantienen mucho más abajo que el resto
   del layout, y el hueco nunca se esconde. */
@media (max-width: 620px) {
  .irow { grid-template-columns: 1fr; }
}
</style>
