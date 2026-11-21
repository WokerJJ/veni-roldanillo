/*
| El borrador de una ficha del modo Campo (ADR 0048): su forma, sus reglas por
| paso y cómo se vuelve el cuerpo que recibe `PUT /campo/api/submissions/{uuid}`.
| Las reglas repiten las del servidor (StoreFieldSubmissionRequest y
| WeeklyHours) para avisar en el local, sin señal; el servidor las vuelve a
| revisar siempre.
*/

export type OwnerRole = 'owner' | 'manager';
export type LocationSource = 'device' | 'map';

export interface HourSlot {
    weekday: number;
    opens: string;
    closes: string;
}

export interface Candidate {
    kind: 'restaurant' | 'submission';
    id: number | string;
    restaurant_id: number | null;
    name: string;
    status: string;
    distance_m: number;
    similarity: number;
    from_osm: boolean;
}

export interface MenuDish {
    name_es: string;
    name_en: string | null;
    /** Pesos enteros; null mientras no se ha puesto. */
    price: number | null;
    is_alcohol: boolean;
    /** De qué presentación del catálogo salió, si salió de ahí. */
    catalog_variant_id: number | null;
}

export interface MenuSection {
    name_es: string;
    name_en: string | null;
    dishes: MenuDish[];
}

/** Los límites de la carta: los mismos del servidor (FieldMenu). */
export const MENU_LIMITS = { sections: 12, dishesPerSection: 60, dishes: 300, price: 9_999_999 } as const;

export interface Draft {
    uuid: string;
    createdAt: string;
    updatedAt: string;
    /** El paso en que quedó, para seguir desde ahí. */
    step: number;
    /** `ready`: se terminó y espera señal. `error`: el servidor la rechazó. */
    state: 'editing' | 'ready' | 'error';
    /** Los campos que el servidor marcó mal, para pintarlos. */
    serverErrors: string[];
    /** La nota con que administración la devolvió. */
    returnNote: string | null;
    name: string;
    categoryIds: number[];
    address: string;
    reference: string;
    phone: string;
    whatsapp: string;
    delivery: boolean | null;
    paymentMethods: string[];
    hours: HourSlot[];
    menu: MenuSection[];
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    locationSource: LocationSource | null;
    ownerName: string;
    ownerRole: OwnerRole;
    ownerPhone: string;
    purposeExplained: boolean;
    restaurantId: number | null;
    distinctFrom: number[];
    /** Lo que encontró la última búsqueda de duplicados; null si no se hizo. */
    duplicates: Candidate[] | null;
}

/** Los pasos, en orden. */
export const STEPS = ['basics', 'place', 'duplicates', 'contact', 'hours', 'menu', 'catalog', 'owner', 'review'] as const;
export type StepName = (typeof STEPS)[number];

/** Alrededor de Roldanillo: lo mismo que acepta el servidor. */
export const BOUNDS = { lat: [4.3, 4.5], lng: [-76.25, -76.05] } as const;
export const GOOD_ACCURACY_M = 50;

export function newDraft(uuid: string, now: Date = new Date()): Draft {
    const stamp = now.toISOString();

    return {
        uuid,
        createdAt: stamp,
        updatedAt: stamp,
        step: 0,
        state: 'editing',
        serverErrors: [],
        returnNote: null,
        name: '',
        categoryIds: [],
        address: '',
        reference: '',
        phone: '',
        whatsapp: '',
        delivery: null,
        paymentMethods: [],
        hours: [],
        menu: [],
        latitude: null,
        longitude: null,
        accuracy: null,
        locationSource: null,
        ownerName: '',
        ownerRole: 'owner',
        ownerPhone: '',
        purposeExplained: false,
        restaurantId: null,
        distinctFrom: [],
        duplicates: null,
    };
}

/** Un celular colombiano como lo guarda el servidor: 57 + diez dígitos; null si no lo es. */
export function normalizeMobile(value: string): string | null {
    let digits = value.replace(/[\s+\-.()]/g, '');

    if (/^3\d{9}$/.test(digits)) {
        digits = `57${digits}`;
    }

    return /^573\d{9}$/.test(digits) ? digits : null;
}

function minutes(time: string): number | null {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);

    return match?.[1] === undefined || match[2] === undefined ? null : Number(match[1]) * 60 + Number(match[2]);
}

const DAY = 1440;
const WEEK = 7 * DAY;

/**
 * Las franjas no se cruzan ni abren y cierran a la misma hora. La semana es
 * circular (más que el EXCLUDE de la base, que mira solo cada día): la noche que
 * pasa la medianoche no pisa la madrugada del día siguiente, y la del sábado
 * tampoco la del domingo. La misma regla que WeeklyHours.php en el servidor.
 */
export function hoursAreValid(slots: readonly HourSlot[]): boolean {
    const ranges: [number, number][] = [];

    for (const slot of slots) {
        const opens = minutes(slot.opens);
        const closes = minutes(slot.closes);

        if (opens === null || closes === null || opens === closes) {
            return false;
        }

        // Minutos desde el domingo 00:00 (weekday 0).
        const start = slot.weekday * DAY + opens;
        ranges.push([start, start + (closes < opens ? closes + DAY : closes) - opens]);
    }

    ranges.sort((a, b) => a[0] - b[0]);

    for (let i = 1; i < ranges.length; i++) {
        const previous = ranges[i - 1];
        const current = ranges[i];

        if (previous && current && current[0] < previous[1]) {
            return false;
        }
    }

    // El cierre de la última franja de la semana no pasa de la apertura de la primera.
    const first = ranges[0];
    const last = ranges[ranges.length - 1];

    return first === undefined || last === undefined || last[1] <= first[0] + WEEK;
}

export type Errors = Record<string, string>;

/** Una ficha publicada parecida que no se marcó «otro negocio»: no se crea otra igual. */
export function publishedDuplicates(draft: Draft): Candidate[] {
    return (draft.duplicates ?? []).filter(
        (candidate) =>
            candidate.kind === 'restaurant' &&
            candidate.restaurant_id !== null &&
            candidate.restaurant_id !== draft.restaurantId &&
            (candidate.status === 'unclaimed' || candidate.status === 'claimed') &&
            !draft.distinctFrom.includes(candidate.restaurant_id),
    );
}

/**
 * Lo que impide guardar la carta (el código de su texto en `errors.*`), o null:
 * un plato sin nombre o sin precio, nombres repetidos dentro de su lugar, una
 * sección sin nombre o demasiados platos. Las mismas reglas del servidor.
 */
export function menuProblem(menu: readonly MenuSection[]): string | null {
    let total = 0;
    const sections = new Set<string>();

    if (menu.length > MENU_LIMITS.sections) {
        return 'menu_too_many';
    }

    for (const section of menu) {
        const key = section.name_es.trim().replace(/\s+/g, ' ').toLowerCase();

        if (section.dishes.length === 0) {
            continue;
        }

        if (key === '') {
            return 'menu_section';
        }

        if (sections.has(key)) {
            return 'menu_duplicate_section';
        }

        sections.add(key);

        if (section.dishes.length > MENU_LIMITS.dishesPerSection) {
            return 'menu_too_many';
        }

        const dishes = new Set<string>();

        for (const dish of section.dishes) {
            total++;
            const name = dish.name_es.trim().replace(/\s+/g, ' ').toLowerCase();

            if (name === '' || dish.price === null || !Number.isInteger(dish.price) || dish.price < 0 || dish.price > MENU_LIMITS.price) {
                return 'menu_dish';
            }

            if (dishes.has(name)) {
                return 'menu_duplicate_dish';
            }

            dishes.add(name);
        }
    }

    return total > MENU_LIMITS.dishes ? 'menu_too_many' : null;
}

/** Cuántos platos tiene la carta, sin contar secciones vacías. */
export function dishCount(menu: readonly MenuSection[]): number {
    return menu.reduce((total, section) => total + section.dishes.length, 0);
}

/** Un plato al que le falta el nombre o el precio (un precio de 0 cuenta como puesto). */
export function isDishIncomplete(dish: MenuDish): boolean {
    return dish.name_es.trim() === '' || dish.price === null;
}

/** Cuántos platos de la carta no tienen precio. */
export function unpricedCount(menu: readonly MenuSection[]): number {
    return menu.reduce((total, section) => total + section.dishes.filter((dish) => dish.price === null).length, 0);
}

/** Los errores de un paso, por campo, con la clave de su texto en `errors.*`. */
export function validateStep(draft: Draft, step: StepName): Errors {
    const errors: Errors = {};

    if (step === 'basics') {
        if (draft.name.trim().length < 2) {
            errors.name = draft.name.trim() === '' ? 'required' : 'too_short';
        }

        if (draft.categoryIds.length < 1) {
            errors.categories = 'categories';
        }
    }

    if (step === 'place') {
        if (draft.address.trim().length < 3) {
            errors.address = draft.address.trim() === '' ? 'required' : 'too_short';
        }

        if (draft.latitude === null || draft.longitude === null) {
            errors.location = 'location';
        } else if (draft.latitude < BOUNDS.lat[0] || draft.latitude > BOUNDS.lat[1] || draft.longitude < BOUNDS.lng[0] || draft.longitude > BOUNDS.lng[1]) {
            errors.location = 'invalid';
        }
    }

    if (step === 'duplicates' && publishedDuplicates(draft).length > 0) {
        errors.duplicates = 'invalid';
    }

    if (step === 'contact') {
        if (draft.whatsapp.trim() !== '' && normalizeMobile(draft.whatsapp) === null) {
            errors.whatsapp = 'whatsapp';
        }

        if (draft.phone.trim() !== '' && !/^[0-9]{7,12}$/.test(draft.phone.replace(/[\s+\-.()]/g, ''))) {
            errors.phone = 'phone';
        }

        if (draft.delivery === null) {
            errors.delivery = 'required';
        }
    }

    if (step === 'hours' && !hoursAreValid(draft.hours)) {
        errors.hours = 'hours';
    }

    if (step === 'menu' || step === 'catalog') {
        const problem = menuProblem(draft.menu);

        if (problem !== null) {
            errors.menu = problem;
        }
    }

    if (step === 'owner') {
        if (draft.ownerName.trim().length < 2) {
            errors.ownerName = draft.ownerName.trim() === '' ? 'required' : 'too_short';
        }

        if (normalizeMobile(draft.ownerPhone) === null) {
            errors.ownerPhone = 'whatsapp';
        }

        if (!draft.purposeExplained) {
            errors.purpose = 'purpose';
        }
    }

    return errors;
}

/** El primer paso con errores, para poder guardar la ficha. */
export function firstInvalidStep(draft: Draft): StepName | null {
    return STEPS.find((step) => step !== 'review' && Object.keys(validateStep(draft, step)).length > 0) ?? null;
}

export interface BodyDish {
    name_es: string;
    name_en: string | null;
    price: number;
    is_alcohol: boolean;
    catalog_variant_id: number | null;
}

export interface BodySection {
    name_es: string;
    name_en: string | null;
    dishes: BodyDish[];
}

export interface SubmissionBody {
    name: string;
    category_ids: number[];
    address: string;
    reference: string | null;
    phone: string | null;
    whatsapp: string | null;
    delivery: boolean;
    payment_methods: string[];
    hours: HourSlot[];
    menu: BodySection[];
    latitude: number;
    longitude: number;
    location_source: LocationSource;
    owner_name: string;
    owner_role: OwnerRole;
    owner_phone: string;
    captured_at: string;
    restaurant_id: number | null;
    distinct_from: number[];
}

/** La carta como la recibe el servidor: sin secciones vacías, nombres recortados y el inglés vacío como null. */
function menuBody(menu: readonly MenuSection[]): BodySection[] {
    const blank = (value: string | null): string | null => (value === null || value.trim() === '' ? null : value.trim());

    return menu
        .filter((section) => section.dishes.length > 0)
        .map((section) => ({
            name_es: section.name_es.trim(),
            name_en: blank(section.name_en),
            dishes: section.dishes.map((dish) => ({
                name_es: dish.name_es.trim(),
                name_en: blank(dish.name_en),
                price: dish.price ?? 0,
                is_alcohol: dish.is_alcohol,
                catalog_variant_id: dish.catalog_variant_id,
            })),
        }));
}

/** El cuerpo del envío. Lanza si el borrador no está completo: se valida antes. */
export function toBody(draft: Draft): SubmissionBody {
    const ownerPhone = normalizeMobile(draft.ownerPhone);

    if (draft.latitude === null || draft.longitude === null || draft.delivery === null || ownerPhone === null) {
        throw new Error('El borrador no está completo.');
    }

    const blank = (value: string): string | null => (value.trim() === '' ? null : value.trim());

    return {
        name: draft.name.trim(),
        category_ids: draft.categoryIds,
        address: draft.address.trim(),
        reference: blank(draft.reference),
        phone: blank(draft.phone) === null ? null : draft.phone.replace(/[\s+\-.()]/g, ''),
        whatsapp: blank(draft.whatsapp) === null ? null : normalizeMobile(draft.whatsapp),
        delivery: draft.delivery,
        payment_methods: draft.paymentMethods,
        hours: draft.hours,
        menu: menuBody(draft.menu),
        latitude: draft.latitude,
        longitude: draft.longitude,
        location_source: draft.locationSource ?? 'device',
        owner_name: draft.ownerName.trim(),
        owner_role: draft.ownerRole,
        owner_phone: ownerPhone,
        captured_at: draft.createdAt,
        restaurant_id: draft.restaurantId,
        distinct_from: draft.distinctFrom,
    };
}

/** Lo que el servidor devuelve de una captura devuelta, para corregirla como borrador. */
export type ReturnedContent = Omit<SubmissionBody, 'captured_at' | 'menu'> & { menu?: BodySection[] };

export function draftFromReturned(uuid: string, content: ReturnedContent, note: string | null, now: Date = new Date()): Draft {
    return {
        ...newDraft(uuid, now),
        step: STEPS.indexOf('review'),
        returnNote: note,
        name: content.name,
        categoryIds: content.category_ids,
        address: content.address,
        reference: content.reference ?? '',
        phone: content.phone ?? '',
        whatsapp: content.whatsapp ?? '',
        delivery: content.delivery,
        paymentMethods: content.payment_methods,
        hours: content.hours,
        menu: content.menu ?? [],
        latitude: content.latitude,
        longitude: content.longitude,
        locationSource: content.location_source,
        ownerName: content.owner_name,
        ownerRole: content.owner_role,
        ownerPhone: content.owner_phone,
        // Lo explicó en la primera visita: la devolución no lo pide otra vez.
        purposeExplained: true,
        restaurantId: content.restaurant_id,
        distinctFrom: content.distinct_from,
    };
}
