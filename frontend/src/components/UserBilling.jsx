import React, { useEffect, useMemo, useState } from 'react';
import { userApi, getErrorMessage } from '../services/api';
import { EmptyState, InlineNotice, SectionCard } from './UiBits';

const TEXT = {
  en: {
    total: 'This month', runtime: 'Runtime', cpu: 'CPU', memory: 'Memory', storage: 'Storage',
    services: 'Cost by service', noData: 'No billing data yet', noDataText: 'Usage tracking starts automatically for self-service containers and other billable services.',
    month: 'Month', hours: 'h', coreHours: 'core h', gbHours: 'GB h', gbMonth: 'GB month',
    average: 'Average', sourceSelf: 'Self-service', sourceAssigned: 'Assigned service', loading: 'Loading billing…',
    failed: 'Billing data could not be loaded.'
  },
  de: {
    total: 'Dieser Monat', runtime: 'Laufzeit', cpu: 'CPU', memory: 'Arbeitsspeicher', storage: 'Speicher',
    services: 'Kosten pro Service', noData: 'Noch keine Abrechnungsdaten', noDataText: 'Die Verbrauchserfassung startet automatisch für Self-Service-Container und andere abrechenbare Services.',
    month: 'Monat', hours: 'Std.', coreHours: 'Core-Std.', gbHours: 'GB-Std.', gbMonth: 'GB-Monat',
    average: 'Ø', sourceSelf: 'Self-Service', sourceAssigned: 'Zugewiesener Service', loading: 'Billing wird geladen…',
    failed: 'Billing-Daten konnten nicht geladen werden.'
  }
};

function money(value, currency, language) {
  try {
    return new Intl.NumberFormat(language === 'de' ? 'de-DE' : 'en-GB', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
  } catch (_) {
    return `${Number(value || 0).toFixed(2)} ${currency || 'EUR'}`;
  }
}

function num(value, digits = 1) {
  return Number(value || 0).toFixed(digits);
}

function CostBreakdown({ data, settings, language, compact = false }) {
  const text = TEXT[language] || TEXT.en;
  const currency = settings?.currency || 'EUR';
  const parts = [
    [text.runtime, data?.costs?.runtime],
    [text.cpu, data?.costs?.cpu],
    [text.memory, data?.costs?.memory],
    [text.storage, data?.costs?.storage]
  ];
  return (
    <div className={`billing-cost-breakdown ${compact ? 'compact' : ''}`}>
      {parts.map(([label, value]) => <div key={label}><span>{label}</span><strong>{money(value, currency, language)}</strong></div>)}
    </div>
  );
}

export default function UserBilling({ language = 'en' }) {
  const text = TEXT[language] || TEXT.en;
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    userApi.getBilling(month)
      .then((response) => { if (!cancelled) setData(response.data || null); })
      .catch((err) => { if (!cancelled) setError(getErrorMessage(err, text.failed)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month, text.failed]);

  const settings = data?.settings || { currency: 'EUR' };
  const summary = data?.summary || {};
  const metrics = useMemo(() => [
    { label: text.runtime, value: `${num(summary.runtimeHours)} ${text.hours}`, sub: money(summary.costs?.runtime, settings.currency, language) },
    { label: text.cpu, value: `${num(summary.cpuCoreHours)} ${text.coreHours}`, sub: money(summary.costs?.cpu, settings.currency, language) },
    { label: text.memory, value: `${num(summary.memoryGbHours)} ${text.gbHours}`, sub: money(summary.costs?.memory, settings.currency, language) },
    { label: text.storage, value: `${num(summary.storageGbMonths, 2)} ${text.gbMonth}`, sub: money(summary.costs?.storage, settings.currency, language) }
  ], [summary, settings.currency, language, text]);

  if (loading && !data) return <div className="page-state-clean">{text.loading}</div>;

  return (
    <div className="billing-page">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      <div className="billing-toolbar">
        <label><span>{text.month}</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
      </div>

      <section className="billing-total-card">
        <div><span>{text.total}</span><strong>{money(summary.totalCost, settings.currency, language)}</strong></div>
        <CostBreakdown data={summary} settings={settings} language={language} />
      </section>

      <div className="billing-metric-grid">
        {metrics.map((metric) => (
          <article className="billing-metric-card" key={metric.label}>
            <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.sub}</small>
          </article>
        ))}
      </div>

      <SectionCard title={text.services}>
        {(data?.resources || []).length ? (
          <div className="billing-service-list">
            {data.resources.map((resource) => (
              <article className="billing-service-row" key={`${resource.id}-${resource.name}`}>
                <div className="billing-service-main">
                  <div><strong>{resource.name}</strong><span>{resource.clusterName || '—'} · {resource.source === 'self-service' ? text.sourceSelf : text.sourceAssigned}</span></div>
                  <strong className="billing-service-total">{money(resource.totalCost, settings.currency, language)}</strong>
                </div>
                <div className="billing-service-usage">
                  <span>{text.runtime}: <strong>{num(resource.runtimeHours)} {text.hours}</strong></span>
                  <span>{text.cpu}: <strong>{num(resource.cpuCoreHours)} {text.coreHours}</strong></span>
                  <span>{text.memory}: <strong>{num(resource.memoryGbHours)} {text.gbHours}</strong></span>
                  <span>{text.storage}: <strong>{num(resource.averageStorageGb)} GB {text.average}</strong></span>
                </div>
                <CostBreakdown data={resource} settings={settings} language={language} compact />
              </article>
            ))}
          </div>
        ) : <EmptyState title={text.noData} text={text.noDataText} />}
      </SectionCard>
    </div>
  );
}
