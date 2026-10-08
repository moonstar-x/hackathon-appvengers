import { useId, useState } from 'react';
import { isValidCi, normalizeCi } from '@club/shared';
export function CiField({
  value,
  onChange,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const invalid = (touched || value.length >= 10) && !isValidCi(normalizeCi(value));
  return (
    <div className="field">
      <label htmlFor={id}>Cédula</label>
      <input
        id={id}
        name="ci"
        inputMode="numeric"
        autoComplete="off"
        maxLength={14}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          setTouched(true);
          onBlur?.();
        }}
        aria-invalid={invalid}
        aria-describedby={id + '-help'}
        placeholder="Tu cédula de 10 dígitos"
      />
      <small id={id + '-help'} className={invalid ? 'field-error' : 'muted'}>
        {invalid ? 'Revisa tu número de cédula' : 'Solo necesitas tu cédula ecuatoriana.'}
      </small>
    </div>
  );
}
