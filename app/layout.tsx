import './globals.css';
import type { Metadata } from 'next';
import { Inter, Noto_Serif_JP } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const notoSerifJP = Noto_Serif_JP({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-noto-serif-jp',
});

export const metadata: Metadata = {
  title: '黄金比フェイスバランススタジオ',
  description: '宣材写真・ステージメイク最適化のための顔バランス分析ツール',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${inter.variable} ${notoSerifJP.variable}`}>
      <body className="font-sans antialiased bg-[#F7F1E8] text-[#111111]">{children}</body>
    </html>
  );
}
