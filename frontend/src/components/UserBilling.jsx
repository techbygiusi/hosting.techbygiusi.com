import React, { useEffect, useMemo, useState } from 'react';
import { userApi, getErrorMessage } from '../services/api';
import { EmptyState, InlineNotice, SectionCard } from './UiBits';

const TEXT = {
  en: {
    total: 'Your total this month', runtime: 'Runtime', cpu: 'CPU', memory: 'Memory', storage: 'Storage',
    services: 'Cost by service', noData: 'No billing data yet', noDataText: 'Billing tracking starts automatically for self-service containers and other billable services.',
    month: 'Month', hours: 'h', coreHours: 'core h', gbHours: 'GB h', gbMonth: 'GB month',
    average: 'Allocated', sourceSelf: 'Self-service', sourceAssigned: 'Assigned service', loading: 'Loading billing…',
    failed: 'Billing data could not be loaded.', yourShare: 'Your share', serviceTotal: 'Service total',
    splitAcross: 'Split across', usersLabel: 'users', priceExamples: 'Price examples',
    priceExamplesNote: 'Calculation: 30 days · 99% uptime · 50% average CPU usage · 50% average RAM usage · 100% assigned storage capacity', currentRates: 'Current rates',
    coreRate: 'CPU / core-hour', memoryRate: 'RAM / GB-hour', storageRate: 'Storage / GB-month',
    configuration: 'Configuration', cores: 'Cores', ram: 'RAM', monthlyPrice: 'Monthly price'
  },
  de: {
    total: 'Dein Anteil in diesem Monat', runtime: 'Laufzeit', cpu: 'CPU', memory: 'Arbeitsspeicher', storage: 'Speicher',
    services: 'Kosten pro Service', noData: 'Noch keine Abrechnungsdaten', noDataText: 'Die Billing-Erfassung startet automatisch für Self-Service-Container und andere abrechenbare Services.',
    month: 'Monat', hours: 'Std.', coreHours: 'Core-Std.', gbHours: 'GB-Std.', gbMonth: 'GB-Monat',
    average: 'zugewiesen', sourceSelf: 'Self-Service', sourceAssigned: 'Zugewiesener Service', loading: 'Billing wird geladen…',
    failed: 'Billing-Daten konnten nicht geladen werden.', yourShare: 'Dein Anteil', serviceTotal: 'Gesamtkosten',
    splitAcross: 'Aufgeteilt auf', usersLabel: 'Benutzer', priceExamples: 'Preisbeispiele',
    priceExamplesNote: 'Berechnung: 30 Tage · 99 % Uptime · 50 % durchschnittliche CPU-Auslastung · 50 % durchschnittliche RAM-Auslastung · 100 % der zugewiesenen Storage-Größe', currentRates: 'Aktuelle Tarife',
    coreRate: 'CPU / Core-Stunde', memoryRate: 'RAM / GB-Stunde', storageRate: 'Speicher / GB-Monat',
    configuration: 'Konfiguration', cores: 'Cores', ram: 'RAM', monthlyPrice: 'Monatspreis'
  }
};

function money(value, currency, language) {
  try {
    return new Intl.NumberFormat(language === 'de' ? 'de-DE' : 'en-GB', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
  } catch (_) {
    return `${Number(value || 0).toFixed(2)} ${currency || 'EUR'}`;
  }
}

function rateMoney(value, currency, language) {
  try {
    return new Intl.NumberFormat(language === 'de' ? 'de-DE' : 'en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: 4,
      maximumFractionDigits: 6
    }).format(Number(value || 0));
  } catch (_) {
    return `${Number(value || 0).toFixed(4)} ${currency || 'EUR'}`;
  }
}

function num(value, digits = 1) {
  return Number(value || 0).toFixed(digits);
}

function CostBreakdown({ data, settings, language, compact = false }) {
  const text = TEXT[language] || TEXT.en;
  const currency = settings?.currency || 'EUR';
  const parts = [
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
  const priceExamples = useMemo(() => {
    const activeHours = 30 * 24 * 0.99;
    const configurations = [
      { cores: 1, ram: 2, storage: 16 },
      { cores: 1, ram: 4, storage: 32 },
      { cores: 2, ram: 4, storage: 32 },
      { cores: 2, ram: 8, storage: 64 },
      { cores: 4, ram: 8, storage: 64 },
      { cores: 4, ram: 16, storage: 128 },
      { cores: 8, ram: 32, storage: 256 },
      { cores: 12, ram: 64, storage: 512 }
    ];
    const cpuRate = Number(settings.cpuPerCoreHour || 0);
    const memoryRate = Number(settings.memoryPerGbHour || 0);
    const storageRate = Number(settings.storagePerGbMonth || 0);

    const averageLoad = 0.5;
    return configurations.map((configuration) => ({
      ...configuration,
      price: configuration.cores * averageLoad * activeHours * cpuRate
        + configuration.ram * averageLoad * activeHours * memoryRate
        + configuration.storage * storageRate
    }));
  }, [settings.cpuPerCoreHour, settings.memoryPerGbHour, settings.storagePerGbMonth]);
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
                  <div className="billing-service-cost-stack">
                    <span>{text.serviceTotal}: <strong>{money(resource.fullTotalCost ?? resource.totalCost, settings.currency, language)}</strong></span>
                    <strong className="billing-service-total">{text.yourShare}: {money(resource.ownCost ?? resource.totalCost, settings.currency, language)}</strong>
                    {Number(resource.allocatedUsers || 1) > 1 ? (
                      <small>{num(resource.sharePercent, 1)}% · {text.splitAcross} {resource.allocatedUsers} {text.usersLabel}</small>
                    ) : null}
                  </div>
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

      <SectionCard title={text.priceExamples}>
        <div className="billing-price-examples">
          <div className="billing-rate-transparency">
            <div><span>{text.coreRate}</span><strong>{rateMoney(settings.cpuPerCoreHour, settings.currency, language)}</strong></div>
            <div><span>{text.memoryRate}</span><strong>{rateMoney(settings.memoryPerGbHour, settings.currency, language)}</strong></div>
            <div><span>{text.storageRate}</span><strong>{rateMoney(settings.storagePerGbMonth, settings.currency, language)}</strong></div>
          </div>

          <div className="billing-example-table-wrap">
            <table className="billing-example-table">
              <thead>
                <tr>
                  <th>{text.configuration}</th>
                  <th>{text.cores}</th>
                  <th>{text.ram}</th>
                  <th>{text.storage}</th>
                  <th>{text.monthlyPrice}</th>
                </tr>
              </thead>
              <tbody>
                {priceExamples.map((example) => (
                  <tr key={`${example.cores}-${example.ram}-${example.storage}`}>
                    <td><strong>{example.cores}C / {example.ram} GB / {example.storage} GB</strong></td>
                    <td>{example.cores}</td>
                    <td>{example.ram} GB</td>
                    <td>{example.storage} GB</td>
                    <td><strong>{money(example.price, settings.currency, language)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="billing-price-examples-note">{text.priceExamplesNote}</p>
        </div>
      </SectionCard>
    </div>
  );
}
