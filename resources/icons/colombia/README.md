# Íconos · colombia-icons

Estos SVG son una copia de [colombia-icons](https://github.com/Mteheran/colombia-icons), de Miguel Teheran, con licencia MIT (ver [`LICENSE`](LICENSE), el archivo original del repositorio). La decisión y sus razones están en el [ADR 0011](../../../docs/adr/0011-iconos-colombia-icons.md).

- **Versión:** la que dice [`manifest.json`](manifest.json) (tag y commit). Solo están los íconos que el manifiesto menciona, no el set completo.
- **No se editan a mano.** Cada archivo es una copia del de origen y su sha256 está en el manifiesto: las pruebas fallan si un archivo y el manifiesto dejan de coincidir. Eso prueba coherencia, no procedencia; que cada copia sea idéntica a la del origen lo prueba `npm run icons:verify`.

## Agregar un ícono

1. Buscalo en el [repositorio de colombia-icons](https://github.com/Mteheran/colombia-icons/tree/main/icons/svg) y anotá su ruta (`icons/svg/<categoría>/<nombre>.svg`).
2. Agregalo a `icons` en `manifest.json`, solo con la ruta:

   ```json
   "sombrero-vueltiao": { "path": "icons/svg/cultura/sombrero-vueltiao.svg" }
   ```

3. `npm run icons:sync` lo descarga, lo valida y completa su sha256.

Desde ahí `<Icon name="sombrero-vueltiao" />` compila: el tipo del nombre sale del manifiesto.

## Cambiar de versión

Cambiá `tag` en `manifest.json` y ejecutá `npm run icons:sync -- --update`. El comando informa qué cambió (el commit anterior y el nuevo, los archivos distintos, los nuevos y los quitados): revisá en el PR el diff de esos SVG.

Si el comando dice que el commit cambió y no cambiaste el tag, el tag se movió en el origen: no lo aceptes sin revisar allá qué cambió.

## Verificar

- `npm run icons:check` compara esta carpeta con el manifiesto, sin red y sin escribir. Corre también dentro de `npm test`. Dice que la carpeta y el manifiesto coinciden entre sí, no de dónde salieron los archivos.
- `npm run icons:verify` descarga cada archivo desde el commit del manifiesto y lo compara con el de esta carpeta, sin escribir. Falla si alguno difiere, aunque su sha256 coincida con el manifiesto. Necesita la red: corre cada semana en `security.yml` y conviene ejecutarlo al revisar un PR que toque los íconos.
