<script setup lang="ts">
import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';
import { useTheme } from '@/composables/useTheme';

const { t } = useI18n();
const { isDark, toggleTheme } = useTheme();
</script>

<template>
    <!-- Botón de alternar: el nombre es fijo y aria-pressed indica el estado. -->
    <button
        type="button"
        class="inline-flex min-h-touch min-w-touch items-center justify-center rounded-full text-ink transition-colors hover:bg-surface"
        :aria-pressed="isDark"
        :aria-label="t('theme.dark_mode')"
        @click="toggleTheme"
    >
        <!-- Decorativo: el nombre ya lo da el botón. -->
        <Icon :name="isDark ? 'luna' : 'sol'" />
    </button>
</template>
