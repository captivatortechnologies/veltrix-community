import React, { useEffect, useState } from 'react';
import { Mail, Send, CheckCircle, AlertTriangle } from 'lucide-react';
import {
  getEmailSettings,
  updateEmailSettings,
  sendTestEmail,
  type EmailSettingsView,
  type EmailSettingsInput,
  type EmailProviderChoice,
} from '../../services/emailSettingsService';

type FormState = EmailSettingsInput & { hasSmtpPassword: boolean; hasSesSecret: boolean };

const inputClass =
  'w-full px-3 py-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white';
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

function toForm(view: EmailSettingsView): FormState {
  return {
    provider: view.provider,
    enabled: view.enabled,
    fromAddress: view.fromAddress ?? '',
    fromName: view.fromName ?? '',
    smtpHost: view.smtpHost ?? '',
    smtpPort: view.smtpPort ?? 587,
    smtpSecure: view.smtpSecure,
    smtpUser: view.smtpUser ?? '',
    smtpPassword: '',
    sesRegion: view.sesRegion ?? '',
    sesAccessKeyId: view.sesAccessKeyId ?? '',
    sesSecretAccessKey: '',
    hasSmtpPassword: view.hasSmtpPassword,
    hasSesSecret: view.hasSesSecret,
  };
}

function toInput(form: FormState): EmailSettingsInput {
  const { hasSmtpPassword: _a, hasSesSecret: _b, ...input } = form;
  return input;
}

const EmailSettingsPage: React.FC = () => {
  const [form, setForm] = useState<FormState | null>(null);
  const [status, setStatus] = useState<EmailSettingsView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [testTo, setTestTo] = useState('');
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    getEmailSettings()
      .then((view) => {
        setForm(toForm(view));
        setStatus(view);
      })
      .catch(() => setLoadError('Failed to load email settings.'));
  }, []);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setIsSaving(true);
    setSaveErr(null);
    setSaveMsg(null);
    try {
      const view = await updateEmailSettings(toInput(form));
      setStatus(view);
      setForm(toForm(view));
      setSaveMsg('Email settings saved.');
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Failed to save email settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!form) return;
    setIsTesting(true);
    setTestErr(null);
    setTestMsg(null);
    try {
      const result = await sendTestEmail({ ...toInput(form), to: testTo });
      setTestMsg(result.message);
    } catch (err) {
      setTestErr(err instanceof Error ? err.message : 'Failed to send test email.');
    } finally {
      setIsTesting(false);
    }
  };

  if (loadError) {
    return (
      <div className="bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-300 p-4 rounded" role="alert">
        {loadError}
      </div>
    );
  }
  if (!form) {
    return <div className="text-gray-500 dark:text-gray-400">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Mail size={22} /> Email (SMTP / SES)
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Configure how your instance sends email — used for password-reset links. Settings saved here override the
          <code className="mx-1">SMTP_*</code>/<code className="mx-1">SES_*</code> environment variables.
        </p>
      </div>

      {/* Active status */}
      <div
        className={`p-4 rounded border-l-4 ${
          status?.activeProvider !== 'none'
            ? 'bg-green-50 dark:bg-green-900/30 border-green-500 text-green-800 dark:text-green-300'
            : 'bg-amber-50 dark:bg-amber-900/30 border-amber-500 text-amber-800 dark:text-amber-300'
        }`}
        role="status"
      >
        {status?.activeProvider !== 'none' ? (
          <span className="text-sm">
            Active: sending via <strong>{status?.activeProvider?.toUpperCase()}</strong> (from{' '}
            {status?.activeSource === 'db' ? 'these settings' : 'environment variables'}).
          </span>
        ) : (
          <span className="text-sm">
            No email provider is configured. Password-reset links are written to the server log until you set one up.
          </span>
        )}
      </div>

      {saveMsg && (
        <div className="bg-green-50 dark:bg-green-900/30 border-l-4 border-green-500 text-green-800 dark:text-green-300 p-3 rounded flex items-center gap-2 text-sm">
          <CheckCircle size={16} /> {saveMsg}
        </div>
      )}
      {saveErr && (
        <div className="bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-300 p-3 rounded flex items-center gap-2 text-sm">
          <AlertTriangle size={16} /> {saveErr}
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => update('enabled', e.target.checked)}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <span className="text-sm font-medium text-gray-900 dark:text-white">Enable email delivery from these settings</span>
        </label>

        <div>
          <span className={labelClass}>Provider</span>
          <div className="flex gap-4">
            {(['smtp', 'ses'] as EmailProviderChoice[]).map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="radio"
                  name="provider"
                  checked={form.provider === p}
                  onChange={() => update('provider', p)}
                />
                {p === 'smtp' ? 'SMTP' : 'Amazon SES'}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={labelClass}>From name</label>
            <input className={inputClass} value={form.fromName ?? ''} onChange={(e) => update('fromName', e.target.value)} placeholder="Veltrix" />
          </div>
          <div>
            <label className={labelClass}>From address</label>
            <input className={inputClass} type="email" value={form.fromAddress ?? ''} onChange={(e) => update('fromAddress', e.target.value)} placeholder="no-reply@example.com" />
          </div>
        </div>

        {form.provider === 'smtp' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>SMTP host</label>
              <input className={inputClass} value={form.smtpHost ?? ''} onChange={(e) => update('smtpHost', e.target.value)} placeholder="smtp.example.com" />
            </div>
            <div>
              <label className={labelClass}>Port</label>
              <input className={inputClass} type="number" value={form.smtpPort ?? 587} onChange={(e) => update('smtpPort', Number(e.target.value))} />
            </div>
            <div>
              <label className={labelClass}>Username</label>
              <input className={inputClass} value={form.smtpUser ?? ''} onChange={(e) => update('smtpUser', e.target.value)} autoComplete="off" />
            </div>
            <div>
              <label className={labelClass}>Password</label>
              <input
                className={inputClass}
                type="password"
                value={form.smtpPassword ?? ''}
                onChange={(e) => update('smtpPassword', e.target.value)}
                placeholder={form.hasSmtpPassword ? '•••••••• (unchanged)' : ''}
                autoComplete="new-password"
              />
            </div>
            <label className="flex items-center gap-2 md:col-span-2">
              <input type="checkbox" checked={form.smtpSecure ?? false} onChange={(e) => update('smtpSecure', e.target.checked)} className="h-4 w-4 rounded" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Use TLS on connect (port 465). Leave off for STARTTLS on 587.</span>
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>AWS region</label>
              <input className={inputClass} value={form.sesRegion ?? ''} onChange={(e) => update('sesRegion', e.target.value)} placeholder="us-east-1" />
            </div>
            <div className="hidden md:block" />
            <div>
              <label className={labelClass}>Access key ID <span className="text-gray-400">(optional)</span></label>
              <input className={inputClass} value={form.sesAccessKeyId ?? ''} onChange={(e) => update('sesAccessKeyId', e.target.value)} autoComplete="off" />
            </div>
            <div>
              <label className={labelClass}>Secret access key <span className="text-gray-400">(optional)</span></label>
              <input
                className={inputClass}
                type="password"
                value={form.sesSecretAccessKey ?? ''}
                onChange={(e) => update('sesSecretAccessKey', e.target.value)}
                placeholder={form.hasSesSecret ? '•••••••• (unchanged)' : ''}
                autoComplete="new-password"
              />
            </div>
            <p className="md:col-span-2 text-xs text-gray-500 dark:text-gray-400">
              Leave the keys blank to use the instance's default AWS credential chain (e.g. an IAM instance role).
            </p>
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50">
            {isSaving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>

      {/* Test send */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white">Send a test email</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Uses the values in the form above (no need to save first). Blank secrets reuse the stored ones.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className={inputClass}
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="you@example.com"
          />
          <button
            type="button"
            onClick={handleTest}
            disabled={isTesting || !testTo}
            className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 text-white px-4 py-2 rounded disabled:opacity-50 whitespace-nowrap"
          >
            <Send size={16} /> {isTesting ? 'Sending…' : 'Send test'}
          </button>
        </div>
        {testMsg && (
          <div className="text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
            <CheckCircle size={16} /> {testMsg}
          </div>
        )}
        {testErr && (
          <div className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle size={16} /> {testErr}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailSettingsPage;
