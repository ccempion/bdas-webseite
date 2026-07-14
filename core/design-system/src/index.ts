/**
 * Shared design system — tokens, Tailwind preset, and primitive components.
 * The platform's single visual language.
 */

export const DESIGN_SYSTEM_VERSION = "0.0.0";

export {
  colors,
  radii,
  shadows,
  motion,
  typography,
  keyframes,
  recipes,
  type Colors,
  type Radii,
  type Shadows,
  type Motion,
  type Typography,
} from "./tokens";

export { tailwindPreset } from "./tailwind-preset";

export { cx } from "./cx";

export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "./components/Button";
export { Input, type InputProps } from "./components/Input";
export { Card, type CardProps } from "./components/Card";
export { Alert, type AlertProps, type AlertVariant } from "./components/Alert";
export { Form, Label, Field, type LabelProps, type FieldProps } from "./components/Form";
export { Section, type SectionProps } from "./components/Section";
export { FilterChip, type FilterChipProps } from "./components/FilterChip";
