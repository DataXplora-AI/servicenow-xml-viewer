<script setup>
import { ref, computed } from 'vue'
import { diffLines } from '../lib/diff.js'
import { highlightLines, detectLanguage } from '../lib/highlight.js'

const props = defineProps({
  left: { type: String, default: '' },
  right: { type: String, default: '' },
  label: { type: String, default: '' }
})

const collapsed = ref(false)
const rows = computed(() => diffLines(props.left, props.right))

// Se colorea cada lado entero y después se corta por línea: así un comentario de bloque o
// un string multilínea siguen bien pintados aunque el diff muestre las líneas sueltas.
const language = computed(() => detectLanguage(props.left || props.right))
const leftLines = computed(() => highlightLines(props.left, language.value))
const rightLines = computed(() => highlightLines(props.right, language.value))
const noTokens = []
const lineOf = (side, no) => (no ? side[no - 1] || noTokens : noTokens)
const stats = computed(() => ({
  add: rows.value.filter((r) => r.type === 'add' || r.type === 'mod').length,
  del: rows.value.filter((r) => r.type === 'del' || r.type === 'mod').length
}))
</script>

<template>
  <div class="dl">
    <div class="bar">
      <span class="muted">{{ label || 'texto' }} · {{ language }}</span>
      <span class="right">
        <span class="plus">+{{ stats.add }}</span>
        <span class="minus">−{{ stats.del }}</span>
        <button class="ghost tiny" @click="collapsed = !collapsed">{{ collapsed ? 'Mostrar' : 'Ocultar' }}</button>
      </span>
    </div>
    <div v-if="!collapsed" class="grid">
      <div class="side">
        <div v-for="(r, i) in rows" :key="'l' + i" class="ln" :class="r.type === 'add' ? 'blank' : r.type === 'equal' ? '' : 'del'">
          <span class="no">{{ r.leftNo ?? '' }}</span>
          <code><template v-for="(t, k) in lineOf(leftLines, r.leftNo)" :key="k"><span v-if="t.type !== 'plain'" :class="'t-' + t.type">{{ t.text }}</span><template v-else>{{ t.text }}</template></template></code>
        </div>
      </div>
      <div class="side">
        <div v-for="(r, i) in rows" :key="'r' + i" class="ln" :class="r.type === 'del' ? 'blank' : r.type === 'equal' ? '' : 'add'">
          <span class="no">{{ r.rightNo ?? '' }}</span>
          <code><template v-for="(t, k) in lineOf(rightLines, r.rightNo)" :key="k"><span v-if="t.type !== 'plain'" :class="'t-' + t.type">{{ t.text }}</span><template v-else>{{ t.text }}</template></template></code>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dl { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--code-bg); }
.bar {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 4px 8px; background: var(--bg-3); border-bottom: 1px solid var(--line); font-size: 12px;
}
.right { display: flex; gap: 8px; align-items: center; }
.plus { color: var(--ok); font-family: ui-monospace, monospace; }
.minus { color: var(--danger); font-family: ui-monospace, monospace; }
.tiny { padding: 2px 8px; font-size: 12px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; max-height: 460px; overflow: auto; }
.side { min-width: 0; border-right: 1px solid var(--line); }
.side:last-child { border-right: none; }
/* Cada línea es una fila independiente: el navegador puede saltarse el layout de las que
   están fuera de pantalla. Sin esto, un script de 500 líneas son miles de <span> que se
   recalculan enteros en cada frame al redimensionar la ventana, y se nota.
   contain-intrinsic-size reserva el alto para que la barra de scroll no salte, y el valor
   "auto" hace que recuerde el alto real de las filas ya mostradas. */
.ln {
  display: grid; grid-template-columns: 38px 1fr; gap: 6px; font-size: 12.5px; line-height: 1.55;
  content-visibility: auto; contain-intrinsic-size: auto 1.55em;
}
.ln code { white-space: pre-wrap; word-break: break-word; padding-right: 6px; }
.no { text-align: right; color: var(--code-gutter); user-select: none; font-family: ui-monospace, monospace; font-size: 11px; padding-top: 1px; }
.add { background: var(--ok-bg); }
.del { background: var(--danger-bg); }
.blank { background: rgba(26, 35, 50, .03); }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
</style>
