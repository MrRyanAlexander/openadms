// A record added or changed in a dialog over the screen (ARCHITECTURE §14): its fields as the screen
// lists them, each labelled from the translation file, a pick-list's values picked, never typed
// (invariant 6); sent as the screen shapes its body; what the API refused said at the top of the
// dialog in its own words, and nothing closed until the API has saved it. React Aria's modal: the
// focus is held inside while it is open and goes back to the button that opened it; Escape closes
// it, saving nothing.
import { Banner, Button, TextEntry } from '@open-adms/look';
import { useState, type ReactNode } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';

import type { NotAnswered } from '../api.ts';
import { trouble } from '../reading.tsx';
import { words } from '../words.ts';
import {
  CheckField,
  ChecksField,
  DateEntry,
  SelectField,
  TextBlock,
  type Option,
} from './fields.tsx';

// One field of the form, by the kind of value it holds.
export type FieldSpec =
  | {
      readonly kind: 'text' | 'long';
      readonly key: string;
      readonly label: string;
      readonly hint?: string;
      readonly required?: boolean;
      readonly longest?: number;
    }
  | {
      readonly kind: 'whole' | 'decimal';
      readonly key: string;
      readonly label: string;
      readonly hint?: string;
      readonly required?: boolean;
    }
  | {
      readonly kind: 'date';
      readonly key: string;
      readonly label: string;
      readonly hint?: string;
      readonly required?: boolean;
    }
  | {
      readonly kind: 'pick';
      readonly key: string;
      readonly label: string;
      readonly options: readonly Option[];
      readonly hint?: string;
      readonly required?: boolean;
    }
  | {
      readonly kind: 'picks';
      readonly key: string;
      readonly label: string;
      readonly options: readonly Option[];
      readonly hint?: string;
    }
  | { readonly kind: 'check'; readonly key: string; readonly label: string; readonly hint?: string }
  | { readonly kind: 'heading'; readonly key: string; readonly label: string };

// What a form holds: each field's value by its key, as the person entered it.
export type Values = Readonly<Record<string, string | boolean | readonly string[] | null>>;

export const text = (values: Values, key: string): string => {
  const value = values[key];
  return typeof value === 'string' ? value.trim() : '';
};
export const optional = (values: Values, key: string): string | undefined => {
  const value = text(values, key);
  return value === '' ? undefined : value;
};
export const nullable = (values: Values, key: string): string | null =>
  optional(values, key) ?? null;
export const checked = (values: Values, key: string): boolean => values[key] === true;
export const picks = (values: Values, key: string): string[] => {
  const value = values[key];
  return Array.isArray(value) ? [...(value as readonly string[])] : [];
};
export const picked = (values: Values, key: string): string | null => {
  const value = values[key];
  return typeof value === 'string' && value !== '' ? value : null;
};
// A whole number or a decimal as typed, or none; a value that isn't one is the server's to refuse.
export const numberOf = (values: Values, key: string): number | null => {
  const value = text(values, key);
  return value === '' ? null : Number(value);
};

export function FieldsOf({
  fields,
  values,
  onChange,
}: {
  readonly fields: readonly FieldSpec[];
  readonly values: Values;
  readonly onChange: (key: string, value: string | boolean | readonly string[] | null) => void;
}) {
  return (
    <>
      {fields.map((field) => {
        const value = values[field.key];
        switch (field.kind) {
          case 'heading':
            return (
              <h3 key={field.key} className="form-heading">
                {field.label}
              </h3>
            );
          case 'long':
            return (
              <TextBlock
                key={field.key}
                label={field.label}
                value={typeof value === 'string' ? value : ''}
                onChange={(next) => {
                  onChange(field.key, next);
                }}
                {...(field.hint === undefined ? {} : { hint: field.hint })}
                {...(field.longest === undefined ? {} : { longest: field.longest })}
              />
            );
          case 'text':
          case 'whole':
          case 'decimal':
            return (
              <TextEntry
                key={field.key}
                label={field.label}
                value={typeof value === 'string' ? value : ''}
                onChange={(next) => {
                  onChange(field.key, next);
                }}
                {...(field.hint === undefined ? {} : { hint: field.hint })}
                required={field.required === true}
                whole={field.kind === 'whole'}
                decimal={field.kind === 'decimal'}
                {...(field.kind === 'text' && field.longest !== undefined
                  ? { longest: field.longest }
                  : {})}
              />
            );
          case 'date':
            return (
              <DateEntry
                key={field.key}
                label={field.label}
                value={typeof value === 'string' ? value : ''}
                onChange={(next) => {
                  onChange(field.key, next);
                }}
                hint={field.hint}
                required={field.required === true}
              />
            );
          case 'pick':
            return (
              <SelectField
                key={field.key}
                label={field.label}
                options={field.options}
                value={typeof value === 'string' && value !== '' ? value : null}
                onChange={(next) => {
                  onChange(field.key, next);
                }}
                hint={field.hint}
                required={field.required === true}
              />
            );
          case 'picks':
            return (
              <ChecksField
                key={field.key}
                label={field.label}
                options={field.options}
                value={Array.isArray(value) ? (value as readonly string[]) : []}
                onChange={(next) => {
                  onChange(field.key, next);
                }}
                hint={field.hint}
              />
            );
          case 'check':
            return (
              <CheckField
                key={field.key}
                label={field.label}
                value={value === true}
                onChange={(next) => {
                  onChange(field.key, next);
                }}
                {...(field.hint === undefined ? {} : { hint: field.hint })}
              />
            );
        }
      })}
    </>
  );
}

// The dialog, open while the screen says so. `save` sends the values and answers what it came to:
// nothing (saved; the dialog closes) or why not.
export function FormDialog({
  title,
  fields,
  initial,
  save,
  onClose,
  saveLabel = words.common.save,
  onValues,
  children,
}: {
  readonly title: string;
  readonly fields: readonly FieldSpec[];
  readonly initial: Values;
  readonly save: (values: Values) => Promise<NotAnswered | null>;
  readonly onClose: () => void;
  readonly saveLabel?: string;
  // Told the values as they change (a preview of the change reads them).
  readonly onValues?: (values: Values) => void;
  readonly children?: ReactNode;
}) {
  const [values, setValues] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  return (
    <ModalOverlay
      className="dialog-overlay"
      isOpen
      isDismissable={!busy}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal className="dialog-modal">
        <Dialog className="dialog">
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              setFailed(null);
              void save(values).then((outcome) => {
                setBusy(false);
                if (outcome === null) onClose();
                else setFailed(outcome);
              });
            }}
          >
            <Heading slot="title" className="dialog-title">
              {title}
            </Heading>
            {failed === null ? null : (
              <Banner tone="problem" announced>
                <p>{trouble(failed)}</p>
              </Banner>
            )}
            {children}
            <FieldsOf
              fields={fields}
              values={values}
              onChange={(key, value) => {
                const next = { ...values, [key]: value };
                setValues(next);
                onValues?.(next);
              }}
            />
            <div className="form-actions">
              <Button main type="submit" busy={busy}>
                {busy ? words.common.saving : saveLabel}
              </Button>
              <Button busy={busy} onPress={onClose}>
                {words.common.cancel}
              </Button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
