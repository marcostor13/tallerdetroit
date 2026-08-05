---
name: Industrial Precision
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#58413f'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f1f1'
  outline: '#8c716e'
  outline-variant: '#e0bfbb'
  surface-tint: '#ad312c'
  primary: '#821012'
  on-primary: '#ffffff'
  primary-container: '#a32a26'
  on-primary-container: '#ffbeb7'
  inverse-primary: '#ffb4ac'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e4e2e1'
  on-secondary-container: '#656464'
  tertiary: '#00465b'
  on-tertiary: '#ffffff'
  tertiary-container: '#005f7a'
  on-tertiary-container: '#92d7f6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad6'
  primary-fixed-dim: '#ffb4ac'
  on-primary-fixed: '#410002'
  on-primary-fixed-variant: '#8b1818'
  secondary-fixed: '#e4e2e1'
  secondary-fixed-dim: '#c8c6c6'
  on-secondary-fixed: '#1b1c1c'
  on-secondary-fixed-variant: '#474747'
  tertiary-fixed: '#bde9ff'
  tertiary-fixed-dim: '#8bd0ef'
  on-tertiary-fixed: '#001f2a'
  on-tertiary-fixed-variant: '#004d64'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
  white: '#FFFFFF'
  gray-medium: '#7A7A7A'
  border-subtle: '#E5E5E5'
typography:
  headline-xl:
    fontFamily: Montserrat
    fontSize: 64px
    fontWeight: '700'
    lineHeight: 72px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Montserrat
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-md:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  section-gap: 120px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 20px
---

## Brand & Style

This design system embodies the "Industrial Precision" of high-end corporate engineering. The aesthetic is rooted in **Minimalism** with a **Corporate Modern** execution, prioritizing clarity, structural integrity, and technical sophistication. 

The visual narrative is "The White Laboratory"—an environment of extreme cleanliness where engineering excellence is staged. It utilizes generous whitespace to signal premium positioning, moving away from cluttered industrial tropes toward a refined, gallery-like presentation of power systems and technical data. The emotional response should be one of absolute reliability, immense scale, and Swiss-like precision.

## Colors

The palette is anchored by a high-ratio of **White (#FFFFFF)** to ensure a sterile, high-end engineering feel. 

- **Primary Red (#A32A26):** Reserved for high-impact brand moments, primary actions, and critical status indicators. It should be used sparingly as a "laser-focused" accent.
- **Secondary Dark Grey (#333333):** Used for primary typography and structural elements to provide a grounded, heavy-duty contrast to the white space.
- **Neutral Grey (#F5F5F5):** Applied to subtle section backgrounds or "staged" containers to create soft depth without introducing visual noise.
- **Medium Grey (#7A7A7A):** Dedicated to secondary information and meta-data.

## Typography

The typographic system contrasts bold, geometric headers with highly legible, technical body and label text.

- **Headlines (Montserrat):** Used for brand statements and section titles. The heavy weight reflects the "power" aspect of the brand.
- **Body (Hanken Grotesk):** A sharp, contemporary grotesque that provides a professional and neutral tone for long-form content and descriptions.
- **Technical Labels (JetBrains Mono):** Introduced for specifications, serial numbers, and micro-copy. The monospaced nature reinforces the engineering and data-driven personality of the platform.

## Layout & Spacing

This design system utilizes a **12-column fixed grid** for desktop, centered within the viewport. To maintain the premium "staged" feel, vertical spacing between major sections is intentionally aggressive (120px+).

- **Grid:** 12 columns with 24px gutters.
- **Fluidity:** On tablet (under 1024px), the grid transitions to 8 columns. On mobile (under 640px), it transitions to 4 columns.
- **Rhythm:** All internal component spacing follows an 8px base grid to ensure mathematical consistency across the UI.
- **Alignment:** Technical data points and product specs should be strictly aligned to the grid to mirror blue-print precision.

## Elevation & Depth

To maintain a "clean" and "staged" look, depth is conveyed through **Tonal Layering** and **Subtle Outlines** rather than heavy shadows.

- **The Stage:** Elements sit on the white background (#FFFFFF) or a very light grey (#F5F5F5) surface.
- **Borders:** Use 1px solid borders in `border-subtle` (#E5E5E5) to define areas. Avoid borders where whitespace can provide the separation.
- **Shadows:** Only one level of elevation is used for interactive floating elements (like dropdowns). Use a "Technical Shadow": `0px 4px 20px rgba(0, 0, 0, 0.05)`, which is nearly imperceptible but provides enough lift to indicate hierarchy.

## Shapes

The shape language is **Soft (0.25rem)**. While a technical brand often leans toward sharp corners, a slight radius prevents the UI from feeling "dated" or "brutalist," instead making it feel like a modern, high-precision instrument.

- **Standard Radius:** 4px (Soft) for buttons, inputs, and small cards.
- **Large Radius:** 8px for primary containers or hero image modules.
- **Product Imagery:** Should always be rectangular with the standard 4px radius, never circular.

## Components

- **Buttons:** Primary buttons use a solid Red (#A32A26) background with white Montserrat text in all-caps. Secondary buttons use a #333333 1px border with no fill.
- **Input Fields:** Minimalist design with a 1px #E5E5E5 border that shifts to #333333 on focus. Labels use JetBrains Mono for a "data-entry" feel.
- **Chips/Badges:** Use JetBrains Mono text. Backgrounds are light grey (#F5F5F5) with dark grey text, unless indicating a critical status (Red).
- **Cards:** White background with a 1px #E5E5E5 border. No shadow. The "staged" look is achieved by placing cards on a #F5F5F5 section background.
- **Progress/Data Bars:** Use a flat primary red for the fill and a light grey track. Avoid rounded ends on the bars themselves to maintain the architectural feel.
- **Lists:** Technical specs lists should use a subtle dotted leader line between the attribute and the value to evoke engineering manuals.