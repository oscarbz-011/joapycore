import type { Metadata } from 'next';
import { Hanken_Grotesk, JetBrains_Mono, Figtree } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { cn } from "@/lib/utils";

const figtree = Figtree({subsets:['latin'],variable:'--font-sans'});

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'JoapyCore',
  description: 'ERP SaaS modular',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={cn("h-full", hanken.variable, jetbrains.variable, "font-sans", figtree.variable)} suppressHydrationWarning>
      <head>
        {/* Runs before hydration — sets data-theme (+ .dark class, para las
            utilidades dark: de Tailwind) desde localStorage, resolviendo
            'system' o la ausencia de preferencia contra el tema del SO,
            para evitar un flash del tema incorrecto. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('joappy-theme');var d=(t==='light'||t==='dark')?t:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',d);document.documentElement.classList.toggle('dark',d==='dark');})()` }} />
      </head>
      <body className="h-full font-sans antialiased" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
