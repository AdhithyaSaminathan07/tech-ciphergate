/**
 * Config-driven application metadata for the Tech Ciphergate /installed-apps page.
 *
 * Uses live Progressive Web App (PWA) installation metadata for Android, iOS,
 * Windows PC, and macOS via the production application URL.
 */

export const TECH_CIPHERGATE_APP = {
  id: 'ciphergate',
  name: 'Tech Ciphergate',
  tagline: 'Intelligent workforce, attendance & operations management platform.',
  developer: 'Tech Vaseegrah',
  category: 'Workforce Management',
  logoUrl: '/appicon.png',
  webAccessUrl: 'https://ciphergate.techvaseegrah.com',
  demoUrl: null, // Uses inline VideoDemoSection playback
  about:
    'Tech Ciphergate brings attendance tracking, task allocation, leave management, payroll workflows, and team communication into a unified platform for Tech Vaseegrah organizations.',
  highlights: [
    'Attendance, leave, and shift management in one portal',
    'Task allocation, KPI tracking, and team communication',
    'Admin and developer workspaces with role-based security',
  ],
  videoDemo: {
    url: '/videos/ciphergate-demo.mp4',
    posterUrl: '/welcome_illustration.png',
    title: 'Tech Ciphergate — Application Walkthrough',
    duration: '0:10',
  },
  desktopScreenshots: [
    {
      id: 'admin-dashboard',
      title: 'Admin Dashboard',
      description:
        'Get a complete overview of company operations, employees, tasks, financial statistics and performance.',
      imageUrl: '/images/installed-apps/dashboard.png',
      badge: 'Executive Overview',
    },
    {
      id: 'salary-management',
      title: 'Salary Management',
      description:
        'Manage employee salaries, monthly payroll, fines and salary reports.',
      imageUrl: '/images/installed-apps/salary-management.png',
      badge: 'Payroll & Compensation',
    },
    {
      id: 'work-allocation',
      title: 'Smart Work Allocation',
      description:
        'Organize tasks across To Do, In Progress, Review and Done with team assignment and workload visibility.',
      imageUrl: '/images/installed-apps/work-allocation.png',
      badge: 'Kanban Workflows',
    },
    {
      id: 'kpi-management',
      title: 'Performance KPI',
      description:
        'Monitor task completion, approval rates, execution time, workload and delivery performance.',
      imageUrl: '/images/installed-apps/kpi-management.png',
      badge: 'Operational Analytics',
    },
    {
      id: 'app-settings',
      title: 'Application Settings',
      description:
        'Manage account preferences, profile information, application settings and configuration.',
      imageUrl: '/images/installed-apps/settings.png',
      badge: 'System & Security',
    },
  ],
  mobileScreenshots: [
    {
      id: 'attendance-mobile',
      title: 'Attendance Management',
      description:
        'Manage employee attendance, face verification, employee records and attendance downloads from mobile.',
      imageUrl: '/images/installed-apps/attendance-mobile.png',
      badge: 'Workforce & Biometrics',
      highlights: [
        'Instant face verification check-in & check-out',
        'Real-time employee list with department tags',
        'Direct attendance summary report downloads',
      ],
    },
    {
      id: 'invoice-history-mobile',
      title: 'Invoice Management',
      description:
        'Create invoices, view invoice history, track payment details and manage billing from mobile.',
      imageUrl: '/images/installed-apps/invoice-history-mobile.png',
      badge: 'Billing & Financials',
      highlights: [
        'Proforma and GST compliant invoice generation',
        'Chronological invoice history and status tracking',
        'One-click PDF preview, edit, and export',
      ],
    },
  ],
  screenshots: [
    {
      id: 'admin-dashboard',
      title: 'Admin Dashboard',
      description:
        'Get a complete overview of company operations, employees, tasks, financial statistics and performance.',
      caption:
        'Get a complete overview of company operations, employees, tasks, financial statistics and performance.',
      imageUrl: '/images/installed-apps/dashboard.png',
      badge: 'Executive',
      type: 'desktop',
    },
    {
      id: 'salary-management',
      title: 'Salary Management',
      description:
        'Manage employee salaries, monthly payroll, fines and salary reports.',
      caption:
        'Manage employee salaries, monthly payroll, fines and salary reports.',
      imageUrl: '/images/installed-apps/salary-management.png',
      badge: 'Payroll',
      type: 'desktop',
    },
    {
      id: 'work-allocation',
      title: 'Smart Work Allocation',
      description:
        'Organize tasks across To Do, In Progress, Review and Done with team assignment and workload visibility.',
      caption:
        'Organize tasks across To Do, In Progress, Review and Done with team assignment and workload visibility.',
      imageUrl: '/images/installed-apps/work-allocation.png',
      badge: 'Workflows',
      type: 'desktop',
    },
    {
      id: 'kpi-management',
      title: 'Performance KPI',
      description:
        'Monitor task completion, approval rates, execution time, workload and delivery performance.',
      caption:
        'Monitor task completion, approval rates, execution time, workload and delivery performance.',
      imageUrl: '/images/installed-apps/kpi-management.png',
      badge: 'Analytics',
      type: 'desktop',
    },
    {
      id: 'app-settings',
      title: 'Application Settings',
      description:
        'Manage account preferences, profile information, application settings and configuration.',
      caption:
        'Manage account preferences, profile information, application settings and configuration.',
      imageUrl: '/images/installed-apps/settings.png',
      badge: 'Settings',
      type: 'desktop',
    },
    {
      id: 'attendance-mobile',
      title: 'Attendance Management',
      description:
        'Manage employee attendance, face verification, employee records and attendance downloads from mobile.',
      caption:
        'Manage employee attendance, face verification, employee records and attendance downloads from mobile.',
      imageUrl: '/images/installed-apps/attendance-mobile.png',
      badge: 'Mobile App',
      type: 'mobile',
    },
    {
      id: 'invoice-history-mobile',
      title: 'Invoice Management',
      description:
        'Create invoices, view invoice history, track payment details and manage billing from mobile.',
      caption:
        'Create invoices, view invoice history, track payment details and manage billing from mobile.',
      imageUrl: '/images/installed-apps/invoice-history-mobile.png',
      badge: 'Mobile App',
      type: 'mobile',
    },
  ],
  platforms: {
    android: {
      downloadUrl: null,
      version: 'Web App (PWA)',
      size: null,
      installMethod: 'pwa',
      notes: 'Installs directly via Chrome / Edge / Samsung Internet PWA prompt.',
    },
    ios: {
      downloadUrl: null,
      version: 'iPhone & iPad',
      size: null,
      installMethod: 'safari-a2hs',
      notes: 'Add to Home Screen via Safari Share menu.',
    },
    windows: {
      downloadUrl: null,
      version: 'Desktop PWA',
      size: null,
      installMethod: 'pwa',
      notes: 'Installs as a standalone Windows app via Chrome or Microsoft Edge.',
    },
    macos: {
      downloadUrl: null,
      version: 'Desktop PWA / Dock',
      size: null,
      installMethod: 'pwa-or-dock',
      notes: 'Installs via Chrome/Edge PWA prompt or Safari Add to Dock.',
    },
  },
};
