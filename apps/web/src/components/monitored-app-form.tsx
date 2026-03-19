import type { Ref } from 'react';
import { useId, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { localeSchema, normalizeGooglePlayUrl, regionSchema } from '@playwatch/shared';

const monitoredAppFormSchema = z.object({
  sourceUrl: z
    .string()
    .trim()
    .url('Enter a valid Google Play URL.')
    .superRefine((value, context) => {
      try {
        normalizeGooglePlayUrl(value);
      } catch (error) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: error instanceof Error ? error.message : 'Only Google Play listing URLs are supported.'
        });
      }
    }),
  region: regionSchema,
  locale: localeSchema,
  captureFrequencyMinutes: z.number().int().min(5).max(1440),
  isActive: z.boolean()
});

export type MonitoredAppFormValues = z.infer<typeof monitoredAppFormSchema>;

export function MonitoredAppForm(props: {
  title: string;
  description: string;
  submitLabel: string;
  submitPendingLabel: string;
  helperText?: string;
  defaultValues: MonitoredAppFormValues;
  showStatusField?: boolean;
  className?: string;
  sourceUrlInputRef?: Ref<HTMLInputElement>;
  onSubmit: (values: MonitoredAppFormValues) => Promise<void>;
}) {
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const sectionTitleId = useId();
  const form = useForm<MonitoredAppFormValues>({
    resolver: zodResolver(monitoredAppFormSchema),
    defaultValues: props.defaultValues
  });
  const isSubmitting = form.formState.isSubmitting;
  const isActive = form.watch('isActive');
  const sourceUrlRegistration = form.register('sourceUrl');

  return (
    <section
      aria-labelledby={sectionTitleId}
      className={['surface-panel rounded-[30px] px-6 py-6 sm:px-7', props.className ?? ''].join(' ').trim()}
    >
      <form
        className="flex flex-col gap-6"
        onSubmit={form.handleSubmit(async (values) => {
          setSubmissionError(null);

          try {
            await props.onSubmit(values);
          } catch (error) {
            setSubmissionError(error instanceof Error ? error.message : 'Unexpected form error.');
          }
        })}
        >
        <header className="space-y-2">
          <p id={sectionTitleId} className="section-title">{props.title}</p>
          <p className="muted-copy max-w-2xl">{props.description}</p>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="field-stack">
            <label htmlFor={`${props.title}-source-url`} className="field-label">
              Google Play URL
            </label>
            <input
              id={`${props.title}-source-url`}
              className="input-control"
              placeholder="https://play.google.com/store/apps/details?id=com.example.app"
              {...sourceUrlRegistration}
              ref={(element) => {
                sourceUrlRegistration.ref(element);

                if (!props.sourceUrlInputRef) {
                  return;
                }

                if (typeof props.sourceUrlInputRef === 'function') {
                  props.sourceUrlInputRef(element);
                  return;
                }

                props.sourceUrlInputRef.current = element;
              }}
            />
            {form.formState.errors.sourceUrl ? (
              <p className="field-error">{form.formState.errors.sourceUrl.message}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="field-stack">
              <label htmlFor={`${props.title}-region`} className="field-label">
                Region
              </label>
              <input
                id={`${props.title}-region`}
                className="input-control"
                autoCapitalize="characters"
                {...form.register('region')}
              />
              {form.formState.errors.region ? <p className="field-error">{form.formState.errors.region.message}</p> : null}
            </div>

            <div className="field-stack">
              <label htmlFor={`${props.title}-locale`} className="field-label">
                Locale
              </label>
              <input
                id={`${props.title}-locale`}
                className="input-control"
                autoCapitalize="none"
                {...form.register('locale')}
              />
              {form.formState.errors.locale ? <p className="field-error">{form.formState.errors.locale.message}</p> : null}
            </div>

            <div className="field-stack">
              <label htmlFor={`${props.title}-frequency`} className="field-label">
                Frequency
              </label>
              <select
                id={`${props.title}-frequency`}
                aria-label="Capture frequency"
                className="select-control"
                value={`${form.watch('captureFrequencyMinutes')}`}
                onChange={(event) =>
                  form.setValue('captureFrequencyMinutes', Number(event.target.value), { shouldValidate: true })
                }
              >
                <option value="5">Every 5 min</option>
                <option value="15">Every 15 min</option>
                <option value="30">Every 30 min</option>
                <option value="60">Every hour</option>
                <option value="180">Every 3 hours</option>
              </select>
            </div>
          </div>
        </div>

        {props.showStatusField ? (
          <section className="status-row">
            <div className="space-y-1">
              <p className="text-sm font-semibold">Monitoring status</p>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                Pause an app without losing its screenshot history.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className={`badge-pill ${isActive ? 'badge-success' : 'badge-neutral'}`}>
                {isActive ? 'Active' : 'Paused'}
              </span>
              <button
                type="button"
                role="switch"
                aria-label="Monitoring status"
                aria-checked={isActive}
                onClick={() => form.setValue('isActive', !isActive, { shouldDirty: true })}
                className={[
                  'relative h-7 w-[52px] rounded-full transition outline-none',
                  'focus-visible:ring-4 focus-visible:ring-cyan-400/30',
                  isActive ? 'bg-cyan-500' : 'bg-slate-400/40 dark:bg-slate-600'
                ].join(' ')}
              >
                <span
                  aria-hidden="true"
                  className={[
                    'block size-5 rounded-full bg-white shadow-lg transition will-change-transform',
                    isActive ? 'translate-x-[28px]' : 'translate-x-[2px]'
                  ].join(' ')}
                />
              </button>
            </div>
          </section>
        ) : null}

        {submissionError ? <p role="alert" className="field-error text-sm">{submissionError}</p> : null}

        <footer className="flex flex-col gap-3 border-t border-[color:var(--surface-border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            {props.helperText ?? 'First screenshot is scheduled immediately after creation.'}
          </p>
          <button
            type="submit"
            disabled={isSubmitting}
            className={[
              'button-primary min-w-[160px]',
              isSubmitting ? 'cursor-wait opacity-80' : ''
            ].join(' ')}
          >
            {isSubmitting ? props.submitPendingLabel : props.submitLabel}
          </button>
        </footer>
      </form>
    </section>
  );
}
