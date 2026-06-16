import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kung Fu Duel Prototype',
  description: 'A playable FINAL v7.5 Q-style animal kung fu duel web demo.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Inter font for body text */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        {/* Space Grotesk font for headlines */}
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-inter antialiased dark">{children}</body>
    </html>
  );
}
