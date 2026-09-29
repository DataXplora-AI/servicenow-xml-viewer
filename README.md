# ServiceNow XML Viewer

Herramienta local (Vue 3 + Vite) para leer XML de ServiceNow —update sets completos o el XML
de un registro suelto— y mostrarlo en un formato legible.

## Uso

```bash
npm install
npm run dev
```

Luego abre http://localhost:5183, pega el XML (o arrastra el archivo) y pulsa **Procesar XML**.

La interfaz sigue el tema del sistema; el botón de la esquina superior derecha alterna entre
seguir al sistema, claro y oscuro.

Todo el procesamiento ocurre en el navegador: no hay backend, ni base de datos, ni autenticación.

## Qué muestra

- **Detección automática** del formato: `<unload>` con varios `<sys_update_xml>` (update set),
  `<record_update>` suelto o un export directo de la tabla.
- **Update sets**: nombre, descripción y estado del set, y el listado de todos los registros
  que toca —con su tabla, tipo, autor, fecha y si fue alta/modificación o borrado—, agrupable
  por tipo o por autor. Cada fila abre el registro con su vista completa: si es una action,
  sus steps; si es un flow, su diagrama.
- **Flows y subflows** (`sys_hub_flow`): trigger con su tabla y condición, acciones en orden,
  ramas anidadas (If, For Each…) e inputs de cada acción con sus pills de datos `{{...}}`.
- **Diagrama del flow**: vista vertical del orden de ejecución con los bloques anidados.
- **Actions** (`sys_hub_action_type_definition`): inputs, outputs y cada step con sus valores;
  los scripts se muestran completos y se pueden copiar.
- **Colores de sintaxis y numeración de líneas** en todo el código: JavaScript (con los
  globales de ServiceNow —`gs`, `current`, `inputs`, `GlideRecord`…— resaltados aparte),
  JSON y XML, tanto en la vista de detalle como en el diff línea a línea. Los números no
  se copian con el código. Sin dependencias: el resaltador es `src/lib/highlight.js`.
- **Cualquier otra tabla**: tabla de campos legible, con scripts y JSON formateados y
  referencias por `sys_id` navegables cuando el registro apuntado viene en el mismo XML.

## Estructura

```
src/lib/xml.js      extracción de registros desde el XML (incluye payloads escapados)
src/lib/model.js    índice por sys_id, relaciones y construcción de flows/actions
src/lib/tables.js   catálogo de tablas conocidas
src/lib/sample.js   update set de ejemplo (solo para pruebas, no se carga desde la interfaz)
src/components/     UI (detalle, steps recursivos, diagrama, campos, código)
```

## Notas

- Los `Script Include` y demás scripts se muestran en la vista genérica de campos, con el
  código completo formateado.
- Si pegas solo el registro del flow, la app lo indica: para ver los pasos necesita los
  registros relacionados (`sys_hub_action_instance`, `sys_hub_flow_logic`, `sys_variable_value`),
  que vienen en el update set completo.
- Los registros relacionados que no se pudieron enganchar a un flow o action aparecen en
  **Otros registros**, en la barra lateral.

## Comparación de dos XML

Dos caminos:

- En la pantalla inicial, marca **Cargar dos XML y compararlos de inmediato** y pega ambos.
- Con un XML ya cargado, pulsa **Comparar con otro XML** y pega o sube el segundo.

La comparación empareja los registros por `sys_id` (o por tabla + nombre si no lo hay) y muestra:

- Barra lateral con el estado de cada registro: modificado, nuevo, eliminado, sin cambios,
  con el conteo de campos e hijos afectados y el filtro **Solo con cambios**.
- Pestaña **Pasos**: los steps/acciones alineados lado a lado, con los inputs que cambiaron
  resaltados (rojo = XML A, verde = XML B) y los pasos agregados o eliminados marcados.
- Pestaña **Campos**: diff campo a campo; los scripts y textos largos se muestran línea a línea,
  al estilo de un PR. Los campos de auditoría (`sys_updated_on`, `sys_mod_count`…) se marcan
  como *ruido* para distinguirlos de los cambios reales.
- Pestaña **Relacionados**: registros hijos agregados, eliminados o modificados.
- **Intercambiar** invierte los lados A/B; **Salir de comparación** vuelve al modo lectura.

### Emparejamiento cuando los `sys_id` no coinciden

Dos exports de la misma action tomados de instancias distintas no comparten `sys_id`.
La comparación resuelve eso en cascada:

1. por `sys_id`;
2. los registros que quedan sueltos, por tabla + nombre (se marcan con `≈ emparejado por nombre`);
3. los steps sobrantes, por nombre + tipo, y en último caso por posición.

Si aun así la pestaña **Pasos** queda vacía, ahí mismo aparece un diagnóstico con las tablas
relacionadas que sí venían en cada XML y cuántos registros hay de cada una: eso dice si el
export simplemente no traía los steps o si están en una tabla que la app todavía no reconoce.
