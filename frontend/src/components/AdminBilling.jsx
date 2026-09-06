import React, { useEffect, useMemo, useState } from 'react';
import { adminApi, getErrorMessage } from '../services/api';
import { EmptyState, InlineNotice, SectionCard } from './UiBits';

const TEXT = {
  en: {
    month: 'Month', total: 'Total this month', users: 'Users billed', services: 'Billable services',
    rates: 'Billing rates', currency: 'Currency', cpu: 'CPU / core-hour', memory: 'Memory / GB-hour', storage: 'Storage / GB-month',
    save: 'Save rates', saving: 'Saving…', saved: 'Billing rates saved.', failed: 'Billing data could not be loaded.',
    userCosts: 'Cost by user', serviceList: 'Included services', sourceSelf: 'Self-service', sourceAssigned: 'Admin assigned',
    noUsage: 'No usage tracked for this month.', noServices: 'No billable services.', owner: 'Owner', saveFailed: 'Billing rates could not be saved.',
    simulator: 'Cost simulator',
    simulatorTotal: 'Estimated monthly cost', monthDays: 'Days in month', uptime: 'Uptime in month',
    cpuCores: 'CPU cores', cpuUsage: 'Average CPU utilization', ramSize: 'RAM size', ramUsage: 'Average RAM utilization', storageSize: 'Storage size',
    cpuRate: 'CPU price / core-hour', ramRate: 'RAM price / GB-hour', storageRate: 'Storage price / GB-month',
    activeHours: 'Active hours', cpuCost: 'CPU', ramCost: 'RAM', storageCost: 'Storage',
    groupTime: 'Time', groupStorage: 'Storage', useSavedRates: 'Use saved rates'
  },
  de: {
    month: 'Monat', total: 'Gesamt in diesem Monat', users: 'Abgerechnete Benutzer', services: 'Abrechenbare Services',
    rates: 'Billing-Tarife', currency: 'Währung', cpu: 'CPU / Core-Stunde', memory: 'RAM / GB-Stunde', storage: 'Speicher / GB-Monat',
    save: 'Tarife speichern', saving: 'Speichern…', saved: 'Billing-Tarife gespeichert.', failed: 'Billing-Daten konnten nicht geladen werden.',
    userCosts: 'Kosten pro Benutzer', serviceList: 'Enthaltene Services', sourceSelf: 'Self-Service', sourceAssigned: 'Vom Admin zugewiesen',
    noUsage: 'Für diesen Monat wurden noch keine Nutzungsdaten erfasst.', noServices: 'Keine abrechenbaren Services.', owner: 'Besitzer', saveFailed: 'Billing-Tarife konnten nicht gespeichert werden.',
    simulator: 'Kosten-Simulator',
    simulatorTotal: 'Geschätzte Monatskosten', monthDays: 'Tage im Monat', uptime: 'Laufzeit im Monat',
    cpuCores: 'CPU-Cores', cpuUsage: 'Ø CPU-Auslastung', ramSize: 'RAM-Größe', ramUsage: 'Ø RAM-Auslastung', storageSize: 'Speichergröße',
    cpuRate: 'CPU-Preis / Core-Stunde', ramRate: 'RAM-Preis / GB-Stunde', storageRate: 'Speicherpreis / GB-Monat',
    activeHours: 'Aktive Stunden', cpuCost: 'CPU', ramCost: 'RAM', storageCost: 'Speicher',
    groupTime: 'Zeitraum', groupStorage: 'Speicher', useSavedRates: 'Gespeicherte Tarife übernehmen'
  }
};

function money(value, currency, language) {
  try {
    return new Intl.NumberFormat(language === 'de' ? 'de-DE' : 'en-GB', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
  } catch (_) {
    return `${Number(value || 0).toFixed(2)} ${currency || 'EUR'}`;
  }
}


function SimulatorSlider({ label, value, min, max, step = 1, suffix = '', onChange }) {
  const numericValue = Number(value || 0);
  const safeMax = Math.max(Number(max || 0), Number(min || 0) + Number(step || 1));
  const percent = Math.max(0, Math.min(100, ((numericValue - Number(min || 0)) / (safeMax - Number(min || 0))) * 100));

  return (
    <label className="billing-simulator-control">
      <div className="billing-simulator-control-head">
        <span>{label}</span>
        <div className="billing-simulator-number-wrap">
          <input
            className="billing-simulator-number"
            type="number"
            min={min}
            max={max}
            step={step}
            value={numericValue}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          {suffix ? <span>{suffix}</span> : null}
        </div>
      </div>
      <input
        className="billing-simulator-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={numericValue}
        style={{ '--range-progress': `${percent}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export default function AdminBilling({ language = 'en' }) {
  const text = TEXT[language] || TEXT.en;
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState({ currency: 'EUR', cpuPerCoreHour: 0, memoryPerGbHour: 0, storagePerGbMonth: 0 });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [simulator, setSimulator] = useState({
    monthDays: 30,
    uptimePercent: 100,
    cpuCores: 4,
    cpuUsagePercent: 50,
    ramGb: 8,
    ramUsagePercent: 50,
    storageGb: 100,
    cpuPerCoreHour: 0,
    memoryPerGbHour: 0,
    storagePerGbMonth: 0
  });

  const setSimulatorValue = (key, value) => {
    setSimulator((current) => ({ ...current, [key]: Number.isFinite(Number(value)) ? Number(value) : 0 }));
  };

  const simulatorResult = useMemo(() => {
    const days = Math.max(1, Number(simulator.monthDays || 30));
    const uptime = Math.max(0, Math.min(100, Number(simulator.uptimePercent || 0))) / 100;
    const activeHours = days * 24 * uptime;
    const cpuCores = Math.max(0, Number(simulator.cpuCores || 0));
    const cpuUsage = Math.max(0, Math.min(100, Number(simulator.cpuUsagePercent || 0))) / 100;
    const ramGb = Math.max(0, Number(simulator.ramGb || 0));
    const ramUsage = Math.max(0, Math.min(100, Number(simulator.ramUsagePercent || 0))) / 100;
    const storageGb = Math.max(0, Number(simulator.storageGb || 0));

    const cpuCost = cpuCores * cpuUsage * activeHours * Math.max(0, Number(simulator.cpuPerCoreHour || 0));
    const ramCost = ramGb * ramUsage * activeHours * Math.max(0, Number(simulator.memoryPerGbHour || 0));
    const storageCost = storageGb * Math.max(0, Number(simulator.storagePerGbMonth || 0));

    return {
      activeHours,
      cpuCost,
      ramCost,
      storageCost,
      totalCost: cpuCost + ramCost + storageCost
    };
  }, [simulator]);

  const load = async () => {
    setError('');
    try {
      const response = await adminApi.getBilling(month);
      setData(response.data || null);
      if (response.data?.settings) {
        const savedSettings = response.data.settings;
        setSettings(savedSettings);
        setSimulator((current) => ({
          ...current,
          cpuPerCoreHour: Number(savedSettings.cpuPerCoreHour || 0),
          memoryPerGbHour: Number(savedSettings.memoryPerGbHour || 0),
          storagePerGbMonth: Number(savedSettings.storagePerGbMonth || 0)
        }));
      }
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
      const savedSettings = response.data?.settings || settings;
      setSettings(savedSettings);
      setSimulator((current) => ({
        ...current,
        cpuPerCoreHour: Number(savedSettings.cpuPerCoreHour || 0),
        memoryPerGbHour: Number(savedSettings.memoryPerGbHour || 0),
        storagePerGbMonth: Number(savedSettings.storagePerGbMonth || 0)
      }));
      setNotice(text.saved);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, text.saveFailed));
    } finally { setSaving(false); }
  };

  const currency = settings.currency || 'EUR';

  const applySavedRatesToSimulator = () => {
    setSimulator((current) => ({
      ...current,
      cpuPerCoreHour: Number(settings.cpuPerCoreHour || 0),
      memoryPerGbHour: Number(settings.memoryPerGbHour || 0),
      storagePerGbMonth: Number(settings.storagePerGbMonth || 0)
    }));
  };

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

      <SectionCard title={text.simulator}>
        <div className="billing-simulator">
          <div className="billing-simulator-topbar billing-simulator-topbar-actions">
            <button type="button" className="btn-secondary btn-small" onClick={applySavedRatesToSimulator}>{text.useSavedRates}</button>
          </div>
          <div className="billing-simulator-layout">
            <div className="billing-simulator-controls">
              <div className="billing-simulator-group">
                <div className="billing-simulator-group-title">{text.groupTime}</div>
                <SimulatorSlider label={text.monthDays} value={simulator.monthDays} min={28} max={31} step={1} suffix="" onChange={(value) => setSimulatorValue('monthDays', value)} />
                <SimulatorSlider label={text.uptime} value={simulator.uptimePercent} min={0} max={100} step={1} suffix="%" onChange={(value) => setSimulatorValue('uptimePercent', value)} />
              </div>

              <div className="billing-simulator-group">
                <div className="billing-simulator-group-title">CPU</div>
                <SimulatorSlider label={text.cpuCores} value={simulator.cpuCores} min={1} max={64} step={1} onChange={(value) => setSimulatorValue('cpuCores', value)} />
                <SimulatorSlider label={text.cpuUsage} value={simulator.cpuUsagePercent} min={0} max={100} step={1} suffix="%" onChange={(value) => setSimulatorValue('cpuUsagePercent', value)} />
                <SimulatorSlider label={text.cpuRate} value={simulator.cpuPerCoreHour} min={0} max={2} step={0.0001} suffix={currency} onChange={(value) => setSimulatorValue('cpuPerCoreHour', value)} />
              </div>

              <div className="billing-simulator-group">
                <div className="billing-simulator-group-title">RAM</div>
                <SimulatorSlider label={text.ramSize} value={simulator.ramGb} min={1} max={256} step={1} suffix="GB" onChange={(value) => setSimulatorValue('ramGb', value)} />
                <SimulatorSlider label={text.ramUsage} value={simulator.ramUsagePercent} min={0} max={100} step={1} suffix="%" onChange={(value) => setSimulatorValue('ramUsagePercent', value)} />
                <SimulatorSlider label={text.ramRate} value={simulator.memoryPerGbHour} min={0} max={2} step={0.0001} suffix={currency} onChange={(value) => setSimulatorValue('memoryPerGbHour', value)} />
              </div>

              <div className="billing-simulator-group">
                <div className="billing-simulator-group-title">{text.groupStorage}</div>
                <SimulatorSlider label={text.storageSize} value={simulator.storageGb} min={1} max={4096} step={1} suffix="GB" onChange={(value) => setSimulatorValue('storageGb', value)} />
                <SimulatorSlider label={text.storageRate} value={simulator.storagePerGbMonth} min={0} max={5} step={0.0001} suffix={currency} onChange={(value) => setSimulatorValue('storagePerGbMonth', value)} />
              </div>
            </div>

            <aside className="billing-simulator-result">
              <span>{text.simulatorTotal}</span>
              <strong>{money(simulatorResult.totalCost, currency, language)}</strong>
              <small>{text.activeHours}: {simulatorResult.activeHours.toFixed(1)} h</small>
              <div className="billing-simulator-breakdown">
                <div><span>{text.cpuCost}</span><strong>{money(simulatorResult.cpuCost, currency, language)}</strong></div>
                <div><span>{text.ramCost}</span><strong>{money(simulatorResult.ramCost, currency, language)}</strong></div>
                <div><span>{text.storageCost}</span><strong>{money(simulatorResult.storageCost, currency, language)}</strong></div>
              </div>
            </aside>
          </div>
        </div>
      </SectionCard>

      <div className="admin-billing-grid">
        <SectionCard title={text.rates}>
          <form className="billing-rate-form" onSubmit={save}>
            <label><span>{text.currency}</span><select value={settings.currency} onChange={(event) => setSettings((current) => ({ ...current, currency: event.target.value }))}><option value="EUR">EUR (€)</option><option value="USD">USD ($)</option><option value="GBP">GBP (£)</option><option value="CHF">CHF</option></select></label>
            <label><span>{text.cpu}</span><input type="number" min="0" step="any" value={settings.cpuPerCoreHour} onChange={(event) => setSettings((current) => ({ ...current, cpuPerCoreHour: event.target.value }))} /></label>
            <label><span>{text.memory}</span><input type="number" min="0" step="any" value={settings.memoryPerGbHour} onChange={(event) => setSettings((current) => ({ ...current, memoryPerGbHour: event.target.value }))} /></label>
            <label><span>{text.storage}</span><input type="number" min="0" step="any" value={settings.storagePerGbMonth} onChange={(event) => setSettings((current) => ({ ...current, storagePerGbMonth: event.target.value }))} /></label>
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
