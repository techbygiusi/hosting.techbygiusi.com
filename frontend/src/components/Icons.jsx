import React from 'react';


function Icon({ children, size = 20, className = '', strokeWidth = 1.6, viewBox = '0 0 24 24', ...rest }) {
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const MenuIcon = (props) => (
  <Icon {...props}><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></Icon>
);

export const CloseIcon = (props) => (
  <Icon {...props}><path d="M6 6l12 12" /><path d="M18 6L6 18" /></Icon>
);

export const LogoutIcon = (props) => (
  <Icon {...props}><path d="M10 6H5v12h5" /><path d="M14 8l4 4-4 4" /><path d="M8 12h10" /></Icon>
);

export const ChevronDownIcon = (props) => (
  <Icon {...props}><path d="M6 9.5l6 6 6-6" /></Icon>
);

export const ChevronRightIcon = (props) => (
  <Icon {...props}><path d="M9.5 6l6 6-6 6" /></Icon>
);

export const ArrowLeftIcon = (props) => (
  <Icon {...props}><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></Icon>
);

export const SunIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" /><path d="M12 20v2" />
    <path d="M4.93 4.93l1.41 1.41" /><path d="M17.66 17.66l1.41 1.41" />
    <path d="M2 12h2" /><path d="M20 12h2" />
    <path d="M4.93 19.07l1.41-1.41" /><path d="M17.66 6.34l1.41-1.41" />
  </Icon>
);

export const MoonIcon = (props) => (
  <Icon {...props}><path d="M20 14.4A7.6 7.6 0 0 1 9.6 4a8.5 8.5 0 1 0 10.4 10.4z" /></Icon>
);

export const UserIcon = (props) => (
  <Icon {...props}><circle cx="12" cy="8.5" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></Icon>
);


export const HomeIcon = (props) => (
  <Icon {...props}>
    <path d="M3.5 10.8 12 3.8l8.5 7" />
    <path d="M5.5 9.5V20h13V9.5" />
    <path d="M9.5 20v-6h5v6" />
  </Icon>
);

export const SettingsIcon = (props) => (
  <Icon {...props}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const DashboardIcon = (props) => (
  <Icon {...props}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
  </Icon>
);

export const BookIcon = (props) => (
  <Icon {...props}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z" />
  </Icon>
);

export const BellIcon = (props) => (
  <Icon {...props}>
    <path d="M18 15.5V10a6 6 0 1 0-12 0v5.5L4.5 18h15z" />
    <path d="M10 21h4" />
  </Icon>
);

export const LockIcon = (props) => (
  <Icon {...props}>
    <rect x="4.5" y="10" width="15" height="10.5" rx="2.2" />
    <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
  </Icon>
);

export const GlobeIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17" />
    <path d="M12 3.5c2.4 2.6 3.6 5.5 3.6 8.5s-1.2 5.9-3.6 8.5c-2.4-2.6-3.6-5.5-3.6-8.5S9.6 6.1 12 3.5z" />
  </Icon>
);

export const ImageIcon = (props) => (
  <Icon {...props}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.4" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4.5 17l4.6-4.4a1.8 1.8 0 0 1 2.5 0l3.4 3.3a1.8 1.8 0 0 0 2.5 0l2.5-2.3" />
  </Icon>
);

export const UploadIcon = (props) => (
  <Icon {...props}>
    <path d="M12 16V4.5" /><path d="M7.5 9L12 4.5 16.5 9" />
    <path d="M4.5 15.5v2.6A2.4 2.4 0 0 0 6.9 20.5h10.2a2.4 2.4 0 0 0 2.4-2.4v-2.6" />
  </Icon>
);

export const TrashIcon = (props) => (
  <Icon {...props}>
    <path d="M4.5 7h15" />
    <path d="M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7" />
    <path d="M6.5 7l.8 12.1A1.9 1.9 0 0 0 9.2 21h5.6a1.9 1.9 0 0 0 1.9-1.9L17.5 7" />
    <path d="M10.5 11v6M13.5 11v6" />
  </Icon>
);

export const CheckIcon = (props) => (
  <Icon {...props}><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>
);

export const CopyIcon = (props) => (
  <Icon {...props}>
    <rect x="9" y="9" width="11" height="11" rx="2.2" />
    <path d="M15 6.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h.5" />
  </Icon>
);

export const LinkIcon = (props) => (
  <Icon {...props}>
    <path d="M10.5 13.5a3.6 3.6 0 0 0 5.3.4l2.6-2.6a3.6 3.6 0 0 0-5.1-5.1l-1.5 1.5" />
    <path d="M13.5 10.5a3.6 3.6 0 0 0-5.3-.4l-2.6 2.6a3.6 3.6 0 0 0 5.1 5.1l1.5-1.5" />
  </Icon>
);

export const QuoteIcon = (props) => (
  <Icon {...props}>
    <path d="M9.5 6.5C7 7.6 5.5 9.8 5.5 12.6V17h5v-4.6H7.9c0-1.7.8-3 2.4-3.9z" />
    <path d="M18 6.5c-2.5 1.1-4 3.3-4 6.1V17h5v-4.6h-2.6c0-1.7.8-3 2.4-3.9z" />
  </Icon>
);

export const AlignLeftIcon = (props) => (
  <Icon {...props}><path d="M4 6h16" /><path d="M4 12h10" /><path d="M4 18h13" /></Icon>
);

export const AlignCenterIcon = (props) => (
  <Icon {...props}><path d="M4 6h16" /><path d="M7 12h10" /><path d="M5.5 18h13" /></Icon>
);

export const AlignRightIcon = (props) => (
  <Icon {...props}><path d="M4 6h16" /><path d="M10 12h10" /><path d="M7 18h13" /></Icon>
);


export const SearchIcon = (props) => (
  <Icon {...props}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></Icon>
);

export const TerminalIcon = (props) => (
  <Icon {...props}><path d="m5 7 4 4-4 4" /><path d="M11 16h8" /></Icon>
);

export const ClockIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const BillingIcon = (props) => (
  <Icon {...props}>
    <path d="M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8z" />
    <path d="M9 8h6" /><path d="M9 12h6" /><path d="M9 16h3.5" />
  </Icon>
);

export const ServerIcon = (props) => (
  <Icon {...props}>
    <rect x="3.5" y="4.5" width="17" height="6" rx="1.8" />
    <rect x="3.5" y="13.5" width="17" height="6" rx="1.8" />
    <path d="M7 7.5h.01M7 16.5h.01" />
  </Icon>
);

export default Icon;
