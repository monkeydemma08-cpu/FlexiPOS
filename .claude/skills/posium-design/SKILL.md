---
name: posium-design
description: >-
  Sistema de diseño de POSIUM (POS y facturación electrónica para República
  Dominicana). Úsalo SIEMPRE que generes cualquier cosa visual para este
  proyecto: pantallas o componentes de la app (admin, caja, POS, KDS, mesera,
  bar, delivery, menú público), reportes o documentos para clientes (facturas,
  cotizaciones, reportes de ventas, PDFs), y gráficas o dashboards (ventas,
  KPIs, inventario). Aplícalo aunque el usuario no diga "diseño" ni "marca":
  si el resultado se ve, debe verse como POSIUM. Contiene los tokens de color,
  tipografía, radios, sombras y las recetas de componentes .kanm-*, más un
  bloque de tokens listo para copiar en artefactos independientes (reportes y
  gráficas que no cargan el CSS de la app).
---

# Sistema de diseño POSIUM

POSIUM es un POS + facturación electrónica (e-CF DGII) para negocios dominicanos:
colmados, cafeterías, restaurantes, foodtrucks. La estética es **limpia,
confiable y moderna**: azul corporativo, superficies blancas, sombras azuladas
suaves, esquinas redondeadas generosas. Nada estridente — transmite **orden y
control**.

La marca migró de "KANM" (rosa) a "POSIUM" (azul). Por eso en el código los
tokens viejos `--kanm-pink*` apuntan al azul actual y los componentes se llaman
`.kanm-*`. **No introduzcas rosa ni el nombre KANM en nada visible al usuario.**

## Fuente de verdad

El CSS real manda. Antes de crear UI de la app, **lee y reutiliza**:

- `public/css/styles.css` — tokens `:root` + componentes globales `.kanm-*`
- `public/css/admin-shell.css` — layout del panel admin
- `public/css/caja-shell.css` — módulo de caja
- `public/css/kds-shell.css` — cocina/bar/mesera (KDS)
- `public/css/menu-publico.css` — menú público / QR
- `public/css/posium-factura.css`, `factura-ticket.css` — facturas/tickets

Para pantallas de la app: **no reinventes estilos**, usa las clases `.kanm-*`
existentes y las variables CSS. Para artefactos independientes (un reporte HTML,
una gráfica, un PDF que no carga el CSS de la app), usa el bloque de tokens de
abajo.

## Tokens de color

```css
--color-primario:   #255bc7;  /* azul POSIUM — acciones, headers, marca */
--color-secundario: #7b8fb8;  /* azul grisáceo — acentos secundarios */
--color-texto:      #24344a;  /* texto principal (azul muy oscuro, no negro) */

/* Estados */
--kanm-success: #3cb179;  /* verde — éxito, pagado, activo */
--kanm-error:   #d93050;  /* rojo — error, vencido */
--kanm-warning: #f7b733;  /* ámbar — pendiente, alerta */
--peligro:      #ff4b4b;  /* rojo botón peligro (eliminar) */

/* Grises / superficies */
--kanm-gray-100: #f3f6fb;  /* fondo de página */
--kanm-gray-200: #e6ebf4;  /* bordes, divisores */
--kanm-gray-600: #5d6779;  /* texto secundario / labels */
--kanm-gray-900: #1f2d45;  /* títulos fuertes */
--surface:       #ffffff;  /* tarjetas, paneles */
```

**Tintes de marca** (fondos suaves, hovers, badges): tiñe el primario con
`color-mix`, no inventes colores nuevos. Ej: `color-mix(in srgb, var(--color-primario) 12%, #ffffff)`.

**Regla de uso del color:** el azul primario es para acciones y jerarquía, no
para rellenar áreas grandes. El lienzo es blanco/gris-100. Los estados
(verde/rojo/ámbar) solo para significado (pagado/vencido/pendiente), nunca
decorativos.

## Tipografía

Dos sistemas según el contexto — respétalos:

| Contexto | Fuentes | Carga |
|---|---|---|
| **App / producto** (admin, caja, POS, KDS, facturas) | **Poppins** (300–700) | `https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap` |
| **Landing / marketing** (index, páginas de venta) | **Manrope** (cuerpo) + **Playfair Display** (títulos display) | `family=Manrope:wght@300..700&family=Playfair+Display:wght@500;600;700` |

- Cuerpo y UI: pesos 400–500. Botones y labels: **600**. Títulos: 600–700.
- Texto principal en `--color-texto` (#24344a), secundario en `--kanm-gray-600`.
- En la landing, Playfair Display solo para titulares grandes (hero, secciones);
  todo lo demás en Manrope. No uses Playfair en la app.

## Forma: radios, sombras, espaciado

```css
--kanm-radius-lg: 20px;   /* tarjetas, paneles, modales */
/* botones: 16px · badges/píldoras: 999px · inputs: 12–14px */

--kanm-shadow: 0 16px 40px color-mix(in srgb, var(--color-primario) 18%, transparent);
/* sombra de marca: siempre AZULADA y difusa, nunca gris/negra dura */
```

- Espaciado en múltiplos de 4px (gap 16px es el estándar dentro de tarjetas).
- Contenedores responsivos: `padding: clamp(20px, 3vw, 32px)`.
- Transiciones sutiles: `transform .15s ease, box-shadow .2s ease`. Los botones
  suben ligeramente en hover (`translateY(-1px)`), no rebotan.

## Recetas de componentes (`.kanm-*`)

Copia estas formas cuando construyas UI nueva; son las reales del proyecto.

**Botón** — gradiente diagonal del primario, texto blanco, sombra azulada:
```css
.kanm-button {
  border: none; border-radius: 16px; padding: 12px 20px;
  font-weight: 600; font-size: 1rem; cursor: pointer; color: #fff;
  background: linear-gradient(135deg, var(--color-primario),
    color-mix(in srgb, var(--color-primario) 85%, transparent));
  box-shadow: 0 10px 24px color-mix(in srgb, var(--color-primario) 28%, transparent);
  transition: transform .15s ease, box-shadow .2s ease, opacity .2s ease;
}
.kanm-button:hover { transform: translateY(-1px); }
.kanm-button.danger { background: linear-gradient(135deg, #ff4b4b, #d93050); }
.kanm-button.ghost  { background: transparent; color: var(--color-primario);
                      box-shadow: none; border: 1px solid var(--kanm-gray-200); }
```

**Tarjeta** — superficie blanca, esquinas 20px, sombra azulada, contenido en columna:
```css
.kanm-card {
  background: #fff; border-radius: 20px;
  padding: clamp(20px, 3vw, 32px); box-shadow: var(--kanm-shadow);
  display: flex; flex-direction: column; gap: 16px;
}
```

**Badge / estado** — píldora con fondo tintado del color de estado:
```css
.kanm-badge {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 6px 12px; border-radius: 999px;
  font-size: .85rem; font-weight: 600; text-transform: capitalize;
}
/* pendiente: fondo rgba(247,183,51,.18) texto #b8860b
   pagado/activo: verde  ·  vencido/error: rojo — siempre fondo al ~18% + texto oscuro del mismo tono */
```

**Tablas** (`.kanm-table`): encabezado en `--kanm-gray-100`, filas con divisor
`--kanm-gray-200`, números alineados a la derecha, moneda como `RD$1,250.00`.

## Guía por tipo de entrega

### 1. UI de la app
Lee el CSS del módulo correspondiente y reutiliza `.kanm-*`. Mantén el layout de
"shell" existente (sidebar/topbar). Fondo de página `--kanm-gray-100`, contenido
en `.kanm-card` blancas. Prioriza densidad de información clara: es un POS, la
gente lo usa rápido y bajo presión. Botones de acción grandes y legibles.

### 2. Reportes y documentos (factura, cotización, reporte de ventas, PDF)
Usa Poppins, el bloque de tokens de abajo, y el patrón factura de
`posium-factura.css` / `factura-ticket.css` como referencia. Encabezado con
datos del negocio + azul primario, cuerpo blanco, totales destacados en tarjeta.
Formato dominicano: moneda `RD$`, ITBIS como impuesto, fecha `DD/MM/AAAA`. Para
documentos imprimibles, sombras suaves y buen contraste (se imprimen).

### 3. Gráficas y dashboards
Combina esta skill con la skill `dataviz` (metodología de color/accesibilidad).
Usa esta **paleta categórica de marca** (en orden), sobre lienzo blanco:

```
#255bc7  azul primario     (serie 1 / principal)
#3cb179  verde             (serie 2)
#f7b733  ámbar             (serie 3)
#d93050  rojo              (serie 4)
#7b8fb8  azul grisáceo     (serie 5)
#8b5cf6  violeta           (serie 6, extensión)
```

- Secuencial (mapas de calor, intensidad): escala del blanco al `#255bc7`.
- KPIs / stat tiles: número grande en `--kanm-gray-900`, label en `--kanm-gray-600`,
  delta positivo en `--kanm-success`, negativo en `--kanm-error`. Envuélvelos en
  `.kanm-card`.
- Ejes y grillas en `--kanm-gray-200`, etiquetas en `--kanm-gray-600`. Nunca
  uses el azul primario para las grillas — se reserva para los datos.

## Bloque de tokens listo para copiar (artefactos independientes)

Pega esto en el `<style>` de cualquier HTML/reporte/gráfica que NO cargue el CSS
de la app, para que herede la identidad POSIUM al instante:

```css
:root{
  --color-primario:#255bc7; --color-secundario:#7b8fb8; --color-texto:#24344a;
  --success:#3cb179; --error:#d93050; --warning:#f7b733; --danger:#ff4b4b;
  --gray-100:#f3f6fb; --gray-200:#e6ebf4; --gray-600:#5d6779; --gray-900:#1f2d45;
  --surface:#fff; --radius:20px;
  --shadow:0 16px 40px color-mix(in srgb,#255bc7 18%,transparent);
  --font:'Poppins',system-ui,sans-serif;
}
body{font-family:var(--font);color:var(--color-texto);background:var(--gray-100);}
```
(No olvides el `<link>` de Poppins en el `<head>`.)

## Modo oscuro

La app es light-first. Si necesitas dark (dashboards, artefactos que lo pidan):
fondo `#1f2d45`/`#24344a`, superficies un tono más claro, texto `#f3f6fb`,
mantén el azul primario como acento (aclarándolo un poco para contraste). No
inviertas el verde/rojo/ámbar de estado — solo ajusta su luminosidad.

## Checklist antes de entregar algo visual

- ¿Fuente correcta? (Poppins app / Manrope+Playfair landing)
- ¿Azul primario solo en acciones y jerarquía, lienzo blanco/gris-100?
- ¿Sombras azuladas y difusas, esquinas redondeadas (20px tarjetas / 16px botones)?
- ¿Estados verde/rojo/ámbar usados por significado, no decoración?
- ¿Formato dominicano donde aplica (RD$, ITBIS, DD/MM/AAAA)?
- ¿Nada de rosa ni de la marca vieja "KANM"?
