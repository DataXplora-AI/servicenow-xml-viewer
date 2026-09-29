<script setup>
/**
 * PLACEHOLDER · marca provisional de DataXplora.
 *
 * Va inline y no como <img src="/logo.svg"> a propósito: un SVG cargado como imagen no ve
 * el tema de la página, así que el logotipo quedaba negro sobre negro en modo oscuro. Aquí
 * la teja usa el color de texto y el texto currentColor, y la marca funciona en los dos temas.
 *
 * Al reemplazarlo por el logotipo definitivo hay que mantener esa propiedad: o se entrega en
 * dos versiones (clara y oscura), o el trazo usa currentColor.
 */
defineProps({
  wordmark: { type: Boolean, default: false },
  size: { type: Number, default: 32 }
})
</script>

<template>
  <svg
    class="brandmark"
    :height="size"
    :viewBox="wordmark ? '0 0 150 32' : '0 0 32 32'"
    :width="wordmark ? (size * 150) / 32 : size"
    role="img"
    aria-label="DataXplora"
  >
    <rect width="32" height="32" rx="8" fill="var(--text)" />
    <path
      d="M9 10 L15 16 L9 22"
      stroke="var(--accent)"
      stroke-width="2.6"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path d="M17 22 H23" stroke="var(--bg)" stroke-width="2.6" stroke-linecap="round" />
    <text
      v-if="wordmark"
      x="41"
      y="22"
      font-family="Poppins, sans-serif"
      font-size="16"
      font-weight="600"
      fill="currentColor"
    >DataXplora</text>
  </svg>
</template>

<style scoped>
.brandmark { display: block; }
</style>
