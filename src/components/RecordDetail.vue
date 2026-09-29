<script setup>
import { ref, computed, watch } from 'vue'
import NodeCard from './NodeCard.vue'
import FieldTable from './FieldTable.vue'
import FlowDiagram from './FlowDiagram.vue'
import ValueCell from './ValueCell.vue'
import Collapsible from './Collapsible.vue'
import EmptyDiagnostics from './EmptyDiagnostics.vue'
import { displayName } from '../lib/model.js'
import { provideCollapse } from '../lib/collapse.js'

const props = defineProps({ item: Object, model: Object })
const emit = defineEmits(['open'])

const { collapseAll, expandAll } = provideCollapse()

const tab = ref('vista')
const selected = ref('')
watch(() => props.item, () => { tab.value = 'vista'; selected.value = '' })

const tabs = computed(() => {
  const t = [{ id: 'vista', label: props.item.view === 'generic' ? 'Campos' : 'Detalle' }]
  if (props.item.view === 'flow') t.push({ id: 'diagrama', label: 'Diagrama' })
  if (props.item.view !== 'generic') t.push({ id: 'campos', label: 'Campos crudos' })
  return t
})

const desc = computed(() => props.item.fields.description || props.item.fields.short_description || '')

function ioLabel(r) {
  return r.fields.label || r.fields.column_label || r.fields.element || displayName(r)
}
function ioType(r) {
  return r.fields.internal_type || r.fields.type || ''
}
</script>

<template>
  <div class="detail">
    <header>
      <div class="kind">
        <span class="chip strong">{{ item.kindLabel || item.info.label }}</span>
        <span class="chip">{{ item.table }}</span>
        <span v-if="item.fields.active" class="chip">{{ item.fields.active === 'true' ? 'activo' : 'inactivo' }}</span>
        <span v-if="item.source && item.source.updateSet" class="chip">update set</span>
      </div>
      <h1>{{ item.title }}</h1>
      <p v-if="desc" class="muted desc">{{ desc }}</p>
      <nav>
        <button v-for="t in tabs" :key="t.id" class="ghost" :class="{ on: tab === t.id }" @click="tab = t.id">
          {{ t.label }}
        </button>
        <span class="spacer" />
        <button v-if="tab === 'vista' && item.view !== 'generic'" class="ghost" @click="collapseAll()">Colapsar todo</button>
        <button v-if="tab === 'vista' && item.view !== 'generic'" class="ghost" @click="expandAll()">Expandir todo</button>
      </nav>
    </header>

    <!-- FLOW -->
    <section v-if="item.view === 'flow' && tab === 'vista'">
      <Collapsible v-if="item.flowInputs.length" title="Inputs del flow" :count="item.flowInputs.length">
        <div v-for="i in item.flowInputs" :key="i.record.id" class="io">
          <span class="ioname">{{ ioLabel(i.record) }}</span>
          <span class="chip">{{ ioType(i.record) }}</span>
          <span v-if="i.record.fields.mandatory === 'true'" class="req">obligatorio</span>
        </div>
      </Collapsible>

      <Collapsible title="Trigger" :count="item.triggers.length">
        <div v-if="!item.triggers.length" class="muted">No hay trigger en este XML.</div>
        <div v-for="t in item.triggers" :key="t.record.id" class="trigger">
          <div class="thead">
            <span class="tname">{{ t.title }}</span>
            <span v-if="t.typeName" class="chip">{{ t.typeName }}</span>
          </div>
          <div class="rows">
            <div v-for="i in t.inputs" :key="i.name" class="row">
              <span class="k">{{ i.name }}</span>
              <span class="v"><ValueCell :name="i.name" :value="i.value" :model="model" @open="emit('open', $event)" /></span>
            </div>
            <div v-if="!t.inputs.length" class="muted">Sin configuración registrada en el XML.</div>
          </div>
        </div>
      </Collapsible>

      <Collapsible title="Acciones" :count="item.nodeCount">
        <EmptyDiagnostics
          v-if="!item.tree.length"
          :diagnostics="item.diagnostics"
          what="Este XML contiene el registro del flow pero no se encontraron sus action instances."
        />
        <NodeCard
          v-for="(n, i) in item.tree"
          :key="n.sysId || i"
          :node="n"
          :model="model"
          :index="i + 1"
          @open="emit('open', $event)"
        />
      </Collapsible>

      <Collapsible v-if="item.flowOutputs.length" title="Outputs del flow" :count="item.flowOutputs.length">
        <div v-for="o in item.flowOutputs" :key="o.record.id" class="io">
          <span class="ioname">{{ ioLabel(o.record) }}</span>
          <span class="chip">{{ ioType(o.record) }}</span>
        </div>
      </Collapsible>
    </section>

    <section v-else-if="item.view === 'flow' && tab === 'diagrama'">
      <FlowDiagram
        :flow="item"
        :model="model"
        :selected="selected"
        @select="selected = $event"
        @open="emit('open', $event)"
      />
    </section>

    <!-- ACTION -->
    <section v-else-if="item.view === 'action' && tab === 'vista'">
      <div class="cols">
        <Collapsible title="Inputs" :count="item.actionInputs.length">
          <div v-if="!item.actionInputs.length" class="muted">No hay inputs en este XML.</div>
          <div v-for="r in item.actionInputs" :key="r.id" class="io">
            <span class="ioname">{{ ioLabel(r) }}</span>
            <span class="chip">{{ ioType(r) }}</span>
            <span v-if="r.fields.mandatory === 'true'" class="chip req">obligatorio</span>
          </div>
        </Collapsible>
        <Collapsible title="Outputs" :count="item.actionOutputs.length">
          <div v-if="!item.actionOutputs.length" class="muted">No hay outputs en este XML.</div>
          <div v-for="r in item.actionOutputs" :key="r.id" class="io">
            <span class="ioname">{{ ioLabel(r) }}</span>
            <span class="chip">{{ ioType(r) }}</span>
          </div>
        </Collapsible>
      </div>

      <Collapsible title="Steps" :count="item.stepCount">
        <EmptyDiagnostics
          v-if="!item.steps.length"
          :diagnostics="item.diagnostics"
          what="No se encontraron steps para esta action."
        />
        <NodeCard
          v-for="(n, i) in item.steps"
          :key="n.sysId || i"
          :node="n"
          :model="model"
          :index="i + 1"
          @open="emit('open', $event)"
        />
      </Collapsible>
    </section>

    <!-- GENÉRICO / CAMPOS CRUDOS -->
    <section v-else>
      <FieldTable :record="item" :model="model" @open="emit('open', $event)" />
    </section>
  </div>
</template>

<style scoped>
.detail { padding: 22px 26px 60px; overflow: auto; height: 100%; }
header { border-bottom: 1px solid var(--line); padding-bottom: 12px; margin-bottom: 18px; }
.kind { display: flex; gap: 6px; flex-wrap: wrap; }
.chip.strong { background: var(--accent); color: var(--on-accent); border-color: transparent; font-weight: 600; }
.chip.req { color: var(--danger); border-color: var(--danger); }
h1 { font-size: 21px; margin: 8px 0 4px; }
.desc { margin: 0 0 10px; max-width: 70ch; }
nav { display: flex; gap: 6px; align-items: center; }
.spacer { flex: 1; }
nav .on { border-color: var(--accent); color: var(--accent); }
h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 0 0 10px; }
.block { margin-bottom: 26px; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.io { display: flex; gap: 8px; align-items: center; padding: 5px 0; border-bottom: 1px solid var(--line); }
.ioname { font-family: ui-monospace, monospace; font-size: 13px; }
.trigger { border: 1px solid var(--accent-2); border-radius: 10px; padding: 12px 14px; background: var(--accent-2-soft); }
.thead { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.tname { font-weight: 600; }
.req {
  font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
  color: var(--logic);
}
.rows { display: flex; flex-direction: column; gap: 6px; }
.row { display: grid; grid-template-columns: 180px 1fr; gap: 12px; align-items: start; }
.k { font-family: ui-monospace, monospace; font-size: 12.5px; color: var(--muted); }
.warn { border: 1px dashed var(--line); border-radius: 10px; padding: 12px; }
@media (max-width: 900px) { .cols { grid-template-columns: 1fr; } .row { grid-template-columns: 1fr; } }
</style>
