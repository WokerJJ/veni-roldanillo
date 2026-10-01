# Íconos · colombia-icons

Estos SVG son una copia de [colombia-icons](https://github.com/Mteheran/colombia-icons), de Miguel Teheran, con licencia MIT (ver [`LICENSE`](LICENSE), el archivo original del repositorio). La decisión y sus razones están en el [ADR 0011](../../../docs/adr/0011-iconos-colombia-icons.md).

- **Versión:** la que dice [`manifest.json`](manifest.json) (tag y commit). Solo están los íconos que el manifiesto menciona, no el set completo.
- **No se editan a mano.** Cada archivo es idéntico al del repositorio de origen y su sha256 está en el manifiesto; las pruebas fallan si cambia.

## Agregar un ícono

1. Buscalo en el [repositorio de colombia-icons](https://github.com/Mteheran/colombia-icons/tree/main/icons/svg) y anotá su ruta (`icons/svg/<categoría>/<nombre>.svg`).
2. Agregalo a `icons` en `manifest.json`, solo con la ruta:

   ```json
   "sombrero-vueltiao": { "path": "icons/svg/cultura/sombrero-vueltiao.svg" }
   ```

3. `npm run icons:sync` lo descarga, lo valida y completa su sha256.

Desde ahí `<Icon name="sombrero-vueltiao" />` compila: el tipo del nombre sale del manifiesto.

## Cambiar de versión

Cambiá `tag` en `manifest.json` y ejecutá `npm run icons:sync -- --update`. Revisá en el PR el diff de los SVG que cambiaron.

## Verificar

`npm run icons:check` compara esta carpeta con el manifiesto, sin red y sin escribir. Corre también dentro de `npm test`.
