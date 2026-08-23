export type AppSurface = 'frontend' | 'admin';

// Render builds the same repository twice. The build-time surface keeps the
// user experience separate while the server-side APP_SURFACE guard protects
// the service boundary at runtime.
export const appSurface: AppSurface = import.meta.env.VITE_APP_SURFACE === 'admin' ? 'admin' : 'frontend';

export const isAdminSurface = appSurface === 'admin';
