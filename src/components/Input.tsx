import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

export const CONTROL_CLASSES =
  "bg-elevated border border-strong rounded-control px-3 py-2 text-body placeholder-muted focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = "", ...props },
  ref,
) {
  return <input ref={ref} className={`${CONTROL_CLASSES} ${className}`} {...props} />;
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className = "", ...props },
  ref,
) {
  return <textarea ref={ref} className={`${CONTROL_CLASSES} leading-relaxed ${className}`} {...props} />;
});

export default Input;
