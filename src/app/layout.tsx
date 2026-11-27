import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Spice Garden | Indian food, made memorable', template: '%s | Spice Garden' },
  description: 'Order freshly prepared Indian favourites, reserve your table, and follow every order from kitchen to table.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-IN"><body>{children}</body></html>;
}
