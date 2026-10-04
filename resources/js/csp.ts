/**
 * Nonce de la política de seguridad de contenido de esta página (ADR 0014).
 *
 * Lo deja la vista raíz (resources/views/app.blade.php) en
 * `<meta property="csp-nonce">`, el mismo lugar del que lo lee Vite. Inertia
 * lo necesita para el `<style>` de su barra de progreso: sin él, la CSP lo
 * bloquearía.
 *
 * Se lee de la propiedad `nonce` y no del atributo: con la CSP activa el
 * navegador vacía el atributo para que no se pueda leer desde CSS, y la
 * propiedad conserva el valor.
 */
export function cspNonce(root: ParentNode = document): string | undefined {
    const meta = root.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]');
    const nonce = meta?.nonce || meta?.getAttribute('nonce');

    return nonce || undefined;
}
