<script setup>
import { computed } from 'vue'
import { resolvedTheme } from '../lib/theme.js'

/**
 * Marca DataXplora.
 *
 * El símbolo es terracota sobre transparente y se lee igual en los dos temas, así que no
 * cambia. El logotipo completo sí: lleva el nombre en gris oscuro, que sobre fondo oscuro
 * desaparece, y para eso está la versión invertida.
 *
 * Depende del tema ya resuelto —no de `prefers-color-scheme`— para que siga al botón de la
 * cabecera cuando alguien fija claro u oscuro a mano.
 */
const props = defineProps({
  wordmark: { type: Boolean, default: false },
  size: { type: Number, default: 32 }
})

// proporciones reales de los archivos, para reservar el hueco y que no salte el layout
const RATIO = { symbol: 288 / 286, wordmark: 1430 / 286 }

const src = computed(() => {
  if (!props.wordmark) return '/dataxplora-symbol.png'
  return resolvedTheme.value === 'dark' ? '/dataxplora-logo-inverted.png' : '/dataxplora-logo.png'
})

const width = computed(() =>
  Math.round(props.size * (props.wordmark ? RATIO.wordmark : RATIO.symbol))
)
</script>

<template>
  <img class="brandmark" :src="src" :width="width" :height="size" alt="DataXplora" />
</template>

<style scoped>
.brandmark { display: block; }
</style>
