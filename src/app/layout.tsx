import type { Metadata } from "next";
import "@fontsource/cal-sans/400.css";
import "@fontsource/nunito/400.css";
import "@fontsource/poppins/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "MetaMed Revisão",
  description: "Planejamento semanal de revisão por temas para residência médica",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
      </body>
    </html>
  );
}
