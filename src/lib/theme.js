import { ref, watch } from 'vue'

/**
 * Tema de la interfaz. Tres preferencias posibles —'auto', 'light' y 'dark'— pero en el
 * DOM solo se escribe el tema resuelto: el CSS define la paleta oscura una sola vez y no
 * necesita repetirla dentro de una media query.
 *
 * 'auto' sigue al sistema en vivo: si el usuario cambia el aspecto del sistema operativo
 * con la app abierta, la app cambia con él.
 */
const KEY = 'dxv-theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

function stored() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export const themePref = ref(stored())

/** El tema que se está viendo ahora mismo, ya resuelto contra el sistema. */
export const resolvedTheme = ref('light')

function apply() {
  const theme = themePref.value === 'auto' ? (media.matches ? 'dark' : 'light') : themePref.value
  resolvedTheme.value = theme
  document.documentElement.dataset.theme = theme
}

watch(themePref, (v) => {
  try {
    if (v === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, v)
  } catch {
    /* sin almacenamiento la preferencia dura lo que la pestaña */
  }
  apply()
})

media.addEventListener('change', () => {
  if (themePref.value === 'auto') apply()
})

apply()

/** Auto → claro → oscuro → auto. Un solo botón, sin menú. */
export function cycleTheme() {
  themePref.value = themePref.value === 'auto' ? 'light' : themePref.value === 'light' ? 'dark' : 'auto'
}

export const themeLabel = {
  auto: 'Tema: el del sistema',
  light: 'Tema: claro',
  dark: 'Tema: oscuro'
}
