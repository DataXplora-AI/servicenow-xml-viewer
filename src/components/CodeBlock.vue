<script setup>
import { ref, computed } from 'vue'
import { highlightLines, detectLanguage } from '../lib/highlight.js'

const props = defineProps({
  code: String,
  label: { type: String, default: '' },
  lang: { type: String, default: '' }
})
const copied = ref(false)
const collapsed = ref(false)
const language = computed(() => props.lang || detectLanguage(props.code))
const rows = computed(() => highlightLines(props.code, language.value))
const lines = computed(() => rows.value.length)
// el canalón crece con la cantidad de dígitos para que el código no se mueva de sitio
const gutter = computed(() => Math.max(2, String(lines.value).length) + 'ch')

async function copy() {
  try {
    await navigator.clipboard.writeText(props.code || '')
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch (e) { /* clipboard bloqueado */ }
}
</script>

<template>
  <div class="code">
    <div class="bar">
      <span class="muted">{{ label || 'script' }} · {{ language }} · {{ lines }} líneas</span>
      <span class="actions">
        <button class="ghost tiny" @click="collapsed = !collapsed">{{ collapsed ? 'Mostrar' : 'Ocultar' }}</button>
        <button class="ghost tiny" @click="copy">{{ copied ? 'Copiado' : 'Copiar' }}</button>
      </span>
    </div>
    <pre v-if="!collapsed" :style="{ '--gutter': gutter }"><code><span v-for="(row, i) in rows" :key="i" class="ln"><span class="no">{{ i + 1 }}</span><span class="src"><template v-for="(t, k) in row" :key="k"><span v-if="t.type !== 'plain'" :class="'t-' + t.type">{{ t.text }}</span><template v-else>{{ t.text }}</template></template></span></span></code></pre>
  </div>
</template>

<style scoped>
.code { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--code-bg); }
.bar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 4px 8px; background: var(--bg-3); border-bottom: 1px solid var(--line); font-size: 12px;
}
.actions { display: flex; gap: 6px; }
.tiny { padding: 2px 8px; font-size: 12px; }
pre { margin: 0; padding: 10px 0; overflow: auto; max-height: 460px; font-size: 12.5px; line-height: 1.55; }
/* Cada línea es una fila independiente: el navegador puede saltarse el layout de las que
   están fuera de pantalla. Sin esto, un script de 500 líneas son miles de <span> que se
   recalculan enteros en cada frame al redimensionar la ventana, y se nota.
   contain-intrinsic-size reserva el alto para que la barra de scroll no salte, y el valor
   "auto" hace que recuerde el alto real de las filas ya mostradas. */
.ln {
  display: grid; grid-template-columns: var(--gutter) 1fr; gap: 12px; min-height: 1.55em;
  content-visibility: auto; contain-intrinsic-size: auto 1.55em;
}
.ln:hover { background: var(--hover); }
/* no seleccionable: copiar el bloque a mano no debe arrastrar los números */
.no {
  position: sticky; left: 0; z-index: 1;
  text-align: right; color: var(--code-gutter); user-select: none;
  background: var(--code-bg); padding-left: 12px; font-size: 11px;
}
.src { padding-right: 12px; }
</style>
