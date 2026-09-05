import React, { useEffect, useState } from 'react';
import { adminApi, getErrorMessage } from '../services/api';
import { EmptyState, InlineNotice, SectionCard } from './UiBits';

const TEXT = {
  en: {
    month: 'Month', total: 'Total this month', users: 'Users billed', services: 'Billable services',
    rates: 'Billing rates', currency: 'Currency', runtime: 'Runtime / hour', cpu: 'CPU / core-hour', memory: 'Memory / GB-hour', storage: 'Storage / GB-month',
    save: 'Save rates', saving: 'Saving…', saved: 'Billing rates saved.', failed: 'Billing data could not be loaded.',
    userCosts: 'Cost by user', serviceList: 'Included services', sourceSelf: 'Self-service', sourceAssigned: 'Admin assigned',
    noUsage: 'No usage tracked for this month.', noServices: 'No billable services.', owner: 'Owner', saveFailed: 'Billing rates could not be saved.'
  },
  de: {
    month: 'Monat', total: 'Gesamt in diesem Monat', users: 'Abgerechnete Benutzer', services: 'Abrechenbare Services',
    rates: 'Billing-Tarife', currency: 'Währung', runtime: 'Laufzeit / Stunde', cpu: 'CPU / Core-Stunde', memory: 'RAM / GB-Stunde', storage: 'Speicher / GB-Monat',
    save: 'Tarife speichern', saving: 'Speichern…', saved: 'Billing-Tarife gespeichert.', failed: 'Billing-Daten konnten nicht geladen werden.',
    userCosts: 'Kosten pro Benutzer', serviceList: 'Enthaltene Services', sourceSelf: 'Self-Service', sourceAssigned: 'Vom Admin zugewiesen',
    noUsage: 'Für diesen Monat wurden noch keine Nutzungsdaten erfasst.', noServices: 'Keine abrechenbaren Services.', owner: 'Besitzer', saveFailed: 'Billing-Tarife konnten nicht gespeichert werden.'
  }
};

function money(value, currency, language) {
  try {
    return new Intl.NumberFormat(language === 'de' ? 'de-DE' : 'en-GB', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
  } catch (_) {
    return `${Number(value || 0).toFixed(2)} ${currency || 'EUR'}`;
  }
}

export default function AdminBilling({ language = 'en' }) {
  const text = TEXT[language] || TEXT.en;
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState({ currency: 'EUR', runtimePerHour: 0, cpuPerCoreHour: 0, memoryPerGbHour: 0, storagePerGbMonth: 0 });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setError('');
    try {
      const response = await adminApi.getBilling(month);
      setData(response.data || null);
      if (response.data?.settings) setSettings(response.data.settings);
    } catch (err) {
      setError(getErrorMessage(err, text.failed));
    }
  };

  useEffect(() => { load(); }, [month]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await adminApi.updateBillingSettings(settings);
      setSettings(response.data?.settings || settings);
      setNotice(text.saved);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, text.saveFailed));
    } finally { setSaving(false); }
  };

  const currency = settings.currency || 'EUR';
  return (
    <div className="admin-billing-page">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
      <div className="billing-toolbar"><label><span>{text.month}</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label></div>

      <div className="admin-billing-summary-grid">
        <article className="billing-summary-card accent"><span>{text.total}</span><strong>{money(data?.summary?.totalCost, currency, language)}</strong></article>
        <article className="billing-summary-card"><span>{text.users}</span><strong>{data?.users?.length || 0}</strong></article>
        <article className="billing-summary-card"><span>{text.services}</span><strong>{data?.billableServices?.length || 0}</strong></article>
      </div>

      <div className="admin-billing-grid">
        <SectionCard title={text.rates}>
          <form className="billing-rate-form" onSubmit={save}>
            <label><span>{text.currency}</span><select value={settings.currency} onChange={(event) => setSettings((current) => ({ ...current, currency: event.target.value }))}><option value="EUR">EUR (€)</option><option value="USD">USD ($)</option><option value="GBP">GBP (£)</option><option value="CHF">CHF</option></select></label>
            <label><span>{text.runtime}</span><input type="number" min="0" step="0.001" value={settings.runtimePerHour} onChange={(event) => setSettings((current) => ({ ...current, runtimePerHour: event.target.value }))} /></label>
            <label><span>{text.cpu}</span><input type="number" min="0" step="0.001" value={settings.cpuPerCoreHour} onChange={(event) => setSettings((current) => ({ ...current, cpuPerCoreHour: event.target.value }))} /></label>
            <label><span>{text.memory}</span><input type="number" min="0" step="0.001" value={settings.memoryPerGbHour} onChange={(event) => setSettings((current) => ({ ...current, memoryPerGbHour: event.target.value }))} /></label>
            <label><span>{text.storage}</span><input type="number" min="0" step="0.001" value={settings.storagePerGbMonth} onChange={(event) => setSettings((current) => ({ ...current, storagePerGbMonth: event.target.value }))} /></label>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? text.saving : text.save}</button>
          </form>
        </SectionCard>

        <SectionCard title={text.userCosts}>
          {(data?.users || []).length ? <div className="billing-user-list">{data.users.map((entry) => <div className="billing-user-row" key={entry.id}><div><strong>{entry.name || entry.email}</strong><span>{entry.email}</span></div><strong>{money(entry.totalCost, currency, language)}</strong></div>)}</div> : <EmptyState title={text.userCosts} text={text.noUsage} />}
        </SectionCard>
      </div>

      <SectionCard title={text.serviceList}>
        {(data?.billableServices || []).length ? <div className="billing-service-admin-grid">{data.billableServices.map((service) => {
          const usage = (data?.resources || []).find((entry) => String(entry.id) === String(service.id));
          return <article className="billing-admin-service" key={service.id}><div><strong>{service.name}</strong><span>{service.clusterName} · {service.containerId}</span></div><div><span>{text.owner}</span><strong>{service.userName || service.groupName || '—'}</strong></div><div className="billing-admin-service-footer"><span className={`status-badge ${service.source === 'self-service' ? 'success' : 'neutral'}`}>{service.source === 'self-service' ? text.sourceSelf : text.sourceAssigned}</span><strong>{money(usage?.totalCost, currency, language)}</strong></div></article>;
        })}</div> : <EmptyState title={text.serviceList} text={text.noServices} />}
      </SectionCard>
    </div>
  );
}
