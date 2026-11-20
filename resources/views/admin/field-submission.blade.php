{{--
    Lo capturado en el local, para revisarlo en /admin (ADR 0048). Solo
    lectura. Todo sale escapado: el contenido lo escribe una persona en un
    teléfono.
--}}
<dl class="grid gap-3 text-sm">
    @foreach ($rows as $label => $value)
        <div>
            <dt class="font-medium text-gray-500 dark:text-gray-400">{{ $label }}</dt>
            <dd class="mt-0.5 break-words text-gray-950 dark:text-white">
                @if (is_array($value))
                    @foreach ($value as $line)
                        <div>{{ $line }}</div>
                    @endforeach
                @elseif (is_array($link ?? null) && ($link['label'] ?? null) === $label)
                    <a class="underline" href="{{ $link['href'] }}" target="_blank" rel="noopener noreferrer">{{ $value }}</a>
                @else
                    {{ $value }}
                @endif
            </dd>
        </div>
    @endforeach
</dl>
