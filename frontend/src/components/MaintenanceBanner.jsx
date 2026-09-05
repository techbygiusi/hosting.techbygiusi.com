import React, { useEffect, useMemo, useState } from 'react';
import { publicApi } from '../services/api';

const COPY = {
  en: {
    active: 'Maintenance in progress',
    upcoming: 'Scheduled maintenance',
    starts: 'Starts',
    ends: 'Ends'
  },
  de: {
    active: 'Wartung läuft',
    upcoming: 'Geplante Wartung',
    starts: 'Beginn',
    ends: 'Ende'
  }
};

function dateValue(value) {
  const stamp = new Date(value).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

export default function MaintenanceBanner({ language = 'en' }) {
  const [announcements, setAnnouncements] = useState([]);
  const text = COPY[language === 'de' ? 'de' : 'en'];

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await publicApi.getAnnouncements();
        if (active) setAnnouncements(response.data?.announcements || []);
      } catch (_) {
        if (active) setAnnouncements([]);
      }
    };
    load();
    const timer = window.setInterval(load, 60000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const announcement = useMemo(() => {
    const now = Date.now();
    const maxStart = now + 24 * 60 * 60 * 1000;
    return announcements
      .filter((item) => {
        const starts = dateValue(item.startsAt);
        const ends = dateValue(item.endsAt);
        return ends > now && (item.active || (starts >= now && starts <= maxStart));
      })
      .sort((a, b) => {
        if (!!a.active !== !!b.active) return a.active ? -1 : 1;
        return dateValue(a.startsAt) - dateValue(b.startsAt);
      })[0] || null;
  }, [announcements]);

  if (!announcement) return null;

  const locale = language === 'de' ? 'de-DE' : 'en-GB';
  const format = (value) => {
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    } catch (_) {
      return value;
    }
  };

  return (
    <div className={`maintenance-banner maintenance-${announcement.severity || 'info'}`} role="status" aria-live="polite">
      <div className="maintenance-banner-main">
        <strong>{announcement.active ? text.active : text.upcoming}: {announcement.title}</strong>
        {announcement.message ? <span>{announcement.message}</span> : null}
      </div>
      <div className="maintenance-banner-time">
        <span>{text.starts}: {format(announcement.startsAt)}</span>
        <span>{text.ends}: {format(announcement.endsAt)}</span>
      </div>
    </div>
  );
}
