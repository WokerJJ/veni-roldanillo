import type { Ref } from 'vue';
import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * La hora del momento, que se pone al día sola mientras viva el componente:
 * cada `intervalMs` y cuando la pestaña vuelve del fondo (ahí el navegador
 * frena los temporizadores). Para lo que cambia con el reloj sin volver a
 * pedir nada, como «abierto ahora».
 */
export function useNow(intervalMs = 30_000): Readonly<Ref<Date>> {
    const now = ref(new Date());
    let timer: ReturnType<typeof setInterval> | undefined;

    const tick = (): void => {
        now.value = new Date();
    };

    const onVisible = (): void => {
        if (document.visibilityState === 'visible') {
            tick();
        }
    };

    onMounted(() => {
        tick();
        timer = setInterval(tick, intervalMs);
        document.addEventListener('visibilitychange', onVisible);
    });

    onBeforeUnmount(() => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
    });

    return now;
}
