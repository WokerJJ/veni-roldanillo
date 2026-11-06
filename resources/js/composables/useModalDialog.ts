import type { Ref } from 'vue';
import { onBeforeUnmount, onMounted } from 'vue';

export interface ModalDialogOptions {
    /** La persona lo cerró (Escape o un cierre del navegador): quien lo abrió lo saca de la plantilla. */
    onDismiss: () => void;
}

/**
 * Un <dialog> modal que vive mientras está en la plantilla (#126, EVA-048).
 * Al montarse se abre con showModal() (el navegador encierra el foco y deja
 * inerte lo de abajo) o, sin showModal(), con el atributo `open`; al
 * desmontarse se cierra.
 *
 * Quien lo abrió es la fuente de verdad (su `v-if`), pero el navegador puede
 * cerrarlo por su cuenta: Escape sin `cancel` (Chrome lo salta sin un gesto
 * reciente) o un `close()` de otro código. Por eso Escape se cancela y avisa
 * con `onDismiss`, y el `close` nativo también avisa (EVA-047): si no, el
 * componente seguiría montado con el diálogo cerrado y no se podría reabrir.
 * Los escuchas se quitan antes del cierre del desmontaje, que no es de la
 * persona.
 *
 * El foco lo pone cada componente en su propio onMounted, que corre después.
 */
export function useModalDialog(dialog: Readonly<Ref<HTMLDialogElement | null>>, { onDismiss }: ModalDialogOptions): void {
    function onCancel(event: Event): void {
        event.preventDefault();
        onDismiss();
    }

    onMounted(() => {
        const element = dialog.value;

        if (element === null) {
            return;
        }

        element.addEventListener('cancel', onCancel);
        element.addEventListener('close', onDismiss);

        if (typeof element.showModal === 'function') {
            element.showModal();
        } else {
            element.setAttribute('open', '');
        }
    });

    onBeforeUnmount(() => {
        const element = dialog.value;

        if (element === null) {
            return;
        }

        element.removeEventListener('cancel', onCancel);
        element.removeEventListener('close', onDismiss);

        if (element.open && typeof element.close === 'function') {
            element.close();
        }
    });
}
